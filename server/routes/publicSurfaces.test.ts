// @vitest-environment node
/**
 * Public surfaces (riders, shared press-kit assets, logos) and storage quota accounting: real Express app over HTTP, backed by an
 * in-memory Postgres (PGlite) built from the real drizzle migrations, so the migration SQL itself
 * is exercised too. Auth is shimmed to an `x-user-id` header; the feed route is unauthenticated,
 * as in production.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  // trash.ts (pulled in by the CRUD builder) imports the storage adapter, which insists on this being set.
  process.env.ATTACHMENTS_DIR ??= '/tmp/gigboy-test-attachments';
  return { ready: null as unknown as Promise<void>, exec: null as unknown as (sql: string) => Promise<unknown> };
});

vi.mock('../db/client.js', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('../db/schema.js');
  const client = new PGlite();
  const db = drizzle(client, { schema: schema as unknown as Record<string, unknown> });
  h.exec = (sql) => client.exec(sql);
  h.ready = (async () => {
    const dir = join(process.cwd(), 'server/db/migrations');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      for (const stmt of readFileSync(join(dir, file), 'utf8').split('--> statement-breakpoint')) {
        if (stmt.trim()) await client.exec(stmt);
      }
    }
    await client.exec(`
      INSERT INTO users (id, email, email_lower, username, password_hash) VALUES
        ('editor', 'e@x', 'e@x', 'editor', 'x'),
        ('viewer', 'v@x', 'v@x', 'viewer', 'x'),
        ('other',  'o@x', 'o@x', 'other',  'x');
      INSERT INTO users (id, email, email_lower, username, password_hash, role) VALUES ('admin', 'a@x', 'a@x', 'admin', 'x', 'admin'), ('admin2', 'a2@x', 'a2@x', 'admin2', 'x', 'admin');
      INSERT INTO bands (id, name, owner_id) VALUES ('b1', 'Band; One', 'editor'), ('b2', 'Other', 'other');
      INSERT INTO band_members (band_id, user_id, role) VALUES
        ('b1', 'editor', 'editor'), ('b1', 'viewer', 'viewer'), ('b2', 'other', 'editor');
      INSERT INTO band_riders (id, band_id, name, hospitality_notes, public_share_enabled) VALUES
        ('r-public', 'b1', 'Public rider', 'two beers', true), ('r-private', 'b1', 'Private rider', 'secret', false);
      INSERT INTO press_kit_images (id, band_id, title, storage_key, thumb_storage_key, mime_type, size_bytes, thumb_size_bytes)
        VALUES ('img1', 'b1', 'Photo', 'k/none.jpg', 'k/none-t.jpg', 'image/jpeg', 1000, 100);
      INSERT INTO setlists (id, band_id, name) VALUES ('s1', 'b1', 'Set One'), ('s2', 'b2', 'Foreign Set');
    `);
  })();
  return { db };
});

const { publicRidersRouter } = await import('./publicRiders.js');
const { publicAssetsRouter } = await import('./publicAssets.js');
const { storageUsageRouter } = await import('./storageUsage.js');
const quota = await import('../lib/storageQuota.js');

let base: string;
let server: ReturnType<express.Express['listen']>;

async function call(path: string, user?: string) {
  const res = await fetch(`${base}${path}`, { headers: user ? { 'x-user-id': user } : {} });
  const text = await res.text();
  let json: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { json = JSON.parse(text); } catch { /* binary */ }
  return { status: res.status, json, text };
}

beforeAll(async () => {
  await h.ready;
  const app = express();
  app.use((req, _res, next) => {
    const u = req.header('x-user-id');
    if (u) (req as unknown as { userId?: string }).userId = u;
    next();
  });
  app.use('/api/storage-usage', storageUsageRouter);
  app.use('/api/public', publicRidersRouter);
  app.use('/api/public', publicAssetsRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => { server.close(); });

describe('public riders', () => {
  it('serves a shared rider without login', async () => {
    const res = await call('/api/public/bands/b1/riders/r-public');
    expect(res.status).toBe(200);
    expect(res.json.rider).toMatchObject({ id: 'r-public', hospitalityNotes: 'two beers' });
    expect(res.json.bandName).toBeTruthy();
  });

  it('hides unshared riders, unknown ids and riders requested under the wrong band', async () => {
    expect((await call('/api/public/bands/b1/riders/r-private')).status).toBe(404);
    expect((await call('/api/public/bands/b1/riders/missing')).status).toBe(404);
    expect((await call('/api/public/bands/b2/riders/r-public')).status).toBe(404);
  });
});

describe('public assets', () => {
  it('does not serve press-kit images for unknown or inactive tokens', async () => {
    expect((await call('/api/public/press-kits/bogus/images/img1/download')).status).toBe(404);
    expect((await call('/api/public/press-kits/bogus/images/img1/thumb')).status).toBe(404);
  });

  it('only serves a band logo while the band has a live public surface and a logo', async () => {
    // b2 has no shared rider or active share; b1 has a shared rider but no logo selected.
    expect((await call('/api/public/bands/b2/logo')).status).toBe(404);
    expect((await call('/api/public/bands/b1/logo')).status).toBe(404);
    expect((await call('/api/public/bands/nope/logo')).status).toBe(404);
  });
});

describe('storage accounting', () => {
  it('requires login, a bandId and membership', async () => {
    expect((await call('/api/storage-usage?bandId=b1')).status).toBe(401);
    expect((await call('/api/storage-usage', 'editor')).status).toBe(400);
    expect((await call('/api/storage-usage?bandId=b1', 'other')).status).toBe(403);
  });

  it('counts images plus thumbnails and falls back to the default quota', async () => {
    const res = await call('/api/storage-usage?bandId=b1', 'viewer');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ recordingBytes: 0, attachmentBytes: 0, imageBytes: 1100, quotaBytes: quota.DEFAULT_STORAGE_QUOTA_BYTES });
    expect(await quota.getBandStorageUsageBytes('b1')).toBe(1100);
    expect(await quota.getBandStorageUsageBytes('b2')).toBe(0);
  });

  it('enforces the uploader\'s own quota on the band total', async () => {
    await h.exec("UPDATE users SET storage_quota_bytes = 2000 WHERE id = 'editor'");
    expect(await quota.assertUploadWithinQuota('editor', 'b1', 900)).toEqual({ ok: true }); // 1100 + 900 = 2000, at the limit
    const over = await quota.assertUploadWithinQuota('editor', 'b1', 901);
    expect(over.ok).toBe(false);
    expect(over.ok === false && over.message).toMatch(/quota exceeded/i);
    // A user without an override gets the default quota.
    expect(await quota.assertUploadWithinQuota('viewer', 'b1', 10 * 1024 * 1024)).toEqual({ ok: true });
    expect((await call('/api/storage-usage?bandId=b1', 'editor')).json.quotaBytes).toBe(2000);
  });

  it('lists storage keys for cleanup, thumbnails included', async () => {
    expect(await quota.getBandStorageKeys('b1')).toEqual(expect.arrayContaining(['k/none.jpg', 'k/none-t.jpg']));
  });
});
