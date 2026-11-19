// @vitest-environment node
/**
 * Role/permission matrix for bands, setlists and trash: real Express app over HTTP, backed by an
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
      INSERT INTO bands (id, name, owner_id) VALUES ('b1', 'Band; One', 'editor'), ('b2', 'Other', 'other');
      INSERT INTO band_members (band_id, user_id, role) VALUES
        ('b1', 'editor', 'editor'), ('b1', 'viewer', 'viewer'), ('b2', 'other', 'editor');
      INSERT INTO setlists (id, band_id, name) VALUES ('s1', 'b1', 'Set One'), ('s2', 'b2', 'Foreign Set');
    `);
  })();
  return { db };
});

const { bandsRouter } = await import('./bands.js');
const { bandSetlistsRouter } = await import('./bandSetlists.js');
const { bandTrashRouter } = await import('./bandTrash.js');

let base: string;
let server: ReturnType<express.Express['listen']>;

async function call(method: string, path: string, user?: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(user ? { 'x-user-id': user } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { json = JSON.parse(text); } catch { /* plain text */ }
  return { status: res.status, json };
}

beforeAll(async () => {
  await h.ready;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const u = req.header('x-user-id');
    if (u) (req as unknown as { userId?: string }).userId = u;
    next();
  });
  app.use('/api/bands/:bandId/setlists', bandSetlistsRouter);
  app.use('/api/bands/:bandId/trash', bandTrashRouter);
  app.use('/api/bands', bandsRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => { server.close(); });

describe('band settings', () => {
  it('requires login', async () => {
    expect((await call('PUT', '/api/bands/b1', undefined, { name: 'x' })).status).toBe(401);
  });

  it('lets only editors rename a band and create invite links', async () => {
    expect((await call('PUT', '/api/bands/b1', 'viewer', { name: 'Hacked' })).status).toBe(403);
    expect((await call('PUT', '/api/bands/b1', 'other', { name: 'Hacked' })).status).toBe(403);
    expect((await call('POST', '/api/bands/b1/invite-link', 'viewer')).status).toBe(403);
    expect((await call('POST', '/api/bands/b1/invite-link', 'other')).status).toBe(403);
    expect((await call('PUT', '/api/bands/b1', 'editor', { name: 'Renamed' })).status).toBe(200);
    expect((await call('POST', '/api/bands/b1/invite-link', 'editor')).status).toBe(200);
  });

  it('lets only the owner delete a band', async () => {
    expect((await call('DELETE', '/api/bands/b2', 'viewer')).status).toBe(403);
    expect((await call('DELETE', '/api/bands/b2', 'editor')).status).toBe(403);
    expect((await call('DELETE', '/api/bands/nope', 'editor')).status).toBe(404);
  });

  it('protects member removal', async () => {
    // Non-members can't remove anyone; the owner can never be removed; viewers can't remove others.
    expect((await call('DELETE', '/api/bands/b1/members/viewer', 'other')).status).toBe(403);
    expect((await call('DELETE', '/api/bands/b1/members/editor', 'editor')).status).toBe(409);
    expect((await call('DELETE', '/api/bands/b1/members/editor', 'viewer')).status).toBe(409);
    await h.exec(`INSERT INTO users (id, email, email_lower, username, password_hash) VALUES ('v2','v2@x','v2@x','v2','x');
      INSERT INTO band_members (band_id, user_id, role) VALUES ('b1','v2','viewer');`);
    expect((await call('DELETE', '/api/bands/b1/members/viewer', 'v2')).status).toBe(403);
    // A member may leave on their own; the owner may remove others.
    expect((await call('DELETE', '/api/bands/b1/members/v2', 'v2')).status).toBe(200);
  });
});

describe('setlists', () => {
  const sl = { id: 'sl1', name: 'Friday', songIds: [] };

  it('lets editors write, members read, strangers nothing', async () => {
    expect((await call('POST', '/api/bands/b1/setlists', 'viewer', sl)).status).toBe(403);
    expect((await call('POST', '/api/bands/b1/setlists', 'other', sl)).status).toBe(403);
    expect((await call('POST', '/api/bands/b1/setlists', undefined, sl)).status).toBe(401);
    expect((await call('POST', '/api/bands/b1/setlists', 'editor', sl)).status).toBe(200);
    expect((await call('GET', '/api/bands/b1/setlists', 'viewer')).json.setlists.map((s: { id: string }) => s.id)).toContain('sl1');
    expect((await call('GET', '/api/bands/b1/setlists', 'other')).status).toBe(403);
  });

  it("won't let an editor of another band touch this band's setlist", async () => {
    expect((await call('PUT', '/api/bands/b1/setlists/sl1', 'other', { ...sl, name: 'Pwned' })).status).toBe(403);
    // Using their own band id with a foreign setlist id must not modify it either.
    await call('PUT', '/api/bands/b2/setlists/sl1', 'other', { ...sl, name: 'Pwned' });
    const list = await call('GET', '/api/bands/b1/setlists', 'editor');
    expect(list.json.setlists.find((s: { id: string }) => s.id === 'sl1').name).toBe('Friday');
  });

  it('moves deleted setlists to trash, restorable only by editors', async () => {
    expect((await call('DELETE', '/api/bands/b1/setlists/sl1', 'viewer')).status).toBe(403);
    expect((await call('DELETE', '/api/bands/b1/setlists/sl1', 'editor')).status).toBe(200);
    const trash = await call('GET', '/api/bands/b1/trash', 'viewer');
    expect(trash.status).toBe(200);
    const item = trash.json.items[0];
    expect(item).toBeTruthy();
    expect((await call('GET', '/api/bands/b1/trash', 'other')).status).toBe(403);
    expect((await call('POST', `/api/bands/b1/trash/${item.trashId}/restore`, 'viewer')).status).toBe(403);
    expect((await call('DELETE', `/api/bands/b1/trash/${item.trashId}`, 'viewer')).status).toBe(403); // owner-only
    expect((await call('DELETE', '/api/bands/b1/trash', 'viewer')).status).toBe(403);
    expect((await call('POST', `/api/bands/b1/trash/${item.trashId}/restore`, 'editor')).status).toBe(200);
  });
});
