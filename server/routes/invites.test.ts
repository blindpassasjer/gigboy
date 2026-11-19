// @vitest-environment node
/**
 * Invites + admin: user-invite lifecycle (single use, revoke, expiry, pinned email), admin-only routes, band invites: real Express app over HTTP, backed by an
 * in-memory Postgres (PGlite) built from the real drizzle migrations, so the migration SQL itself
 * is exercised too. Auth is shimmed to an `x-user-id` header; the feed route is unauthenticated,
 * as in production.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
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
      INSERT INTO setlists (id, band_id, name) VALUES ('s1', 'b1', 'Set One'), ('s2', 'b2', 'Foreign Set');
    `);
  })();
  return { db };
});

const { adminInvitesRouter, publicInvitesRouter } = await import('./invites.js');
const { adminUsersRouter } = await import('./adminUsers.js');
const { bandsRouter } = await import('./bands.js');

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
  return { status: res.status, json, headers: res.headers };
}

beforeAll(async () => {
  await h.ready;
  const app = express();
  app.use(cookieParser('test-secret'));
  app.use(express.json());
  app.use((req, _res, next) => {
    const u = req.header('x-user-id');
    if (u) (req as unknown as { userId?: string }).userId = u;
    next();
  });
  app.use('/api/admin/invites', adminInvitesRouter);
  app.use('/api/admin/users', adminUsersRouter);
  app.use('/api/invites', publicInvitesRouter);
  app.use('/api/bands', bandsRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => { server.close(); });

const newInvite = async (body: Record<string, unknown> = {}) =>
  (await call('POST', '/api/admin/invites', 'admin', body)).json.inviteId as string;

describe('admin-only routes', () => {
  it('rejects anonymous callers and non-admins', async () => {
    for (const [m, p] of [
      ['POST', '/api/admin/invites'], ['GET', '/api/admin/invites'], ['DELETE', '/api/admin/invites/x'],
      ['GET', '/api/admin/users'], ['PATCH', '/api/admin/users/viewer/role'], ['DELETE', '/api/admin/users/viewer'],
      ['PATCH', '/api/admin/users/viewer/quota'],
    ]) {
      expect((await call(m, p)).status, `${m} ${p} anon`).toBe(401);
      expect((await call(m, p, 'editor', m === 'GET' ? undefined : { role: 'admin' })).status, `${m} ${p} member`).toBe(403);
    }
  });

  it('protects against self-demotion, last-admin loss and self-deletion', async () => {
    expect((await call('PATCH', '/api/admin/users/admin/role', 'admin', { role: 'member' })).status).toBe(400);
    expect((await call('PATCH', '/api/admin/users/viewer/role', 'admin', { role: 'wizard' })).status).toBe(400);
    expect((await call('DELETE', '/api/admin/users/admin', 'admin')).status).toBe(400);
    expect((await call('DELETE', '/api/admin/users/ghost', 'admin')).status).toBe(404);
  });

  it('validates storage quota values', async () => {
    expect((await call('PATCH', '/api/admin/users/viewer/quota', 'admin', { storageQuotaBytes: -5 })).status).toBe(400);
    expect((await call('PATCH', '/api/admin/users/viewer/quota', 'admin', { storageQuotaBytes: 1.5 })).status).toBe(400);
    expect((await call('PATCH', '/api/admin/users/viewer/quota', 'admin', { storageQuotaBytes: 1024 })).status).toBe(200);
    expect((await call('PATCH', '/api/admin/users/viewer/quota', 'admin', { storageQuotaBytes: null })).status).toBe(200);
  });
});

describe('user invites', () => {
  it('reports unknown, revoked and valid invites', async () => {
    expect((await call('GET', '/api/invites/nope')).status).toBe(404);
    const id = await newInvite({ email: 'new@x.com' });
    const ok = await call('GET', `/api/invites/${id}`);
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ valid: true, email: 'new@x.com' });
    expect((await call('DELETE', `/api/admin/invites/${id}`, 'admin')).status).toBe(200);
    expect((await call('GET', `/api/invites/${id}`)).status).toBe(410);
    expect((await call('POST', `/api/invites/${id}/accept`, undefined, { username: 'zed', password: 'password1' })).status).toBe(410);
  });

  it('rejects expired invites', async () => {
    const id = await newInvite();
    await h.exec(`UPDATE user_invites SET expires_at = now() - interval '1 day' WHERE id = '${id}'`);
    expect((await call('GET', `/api/invites/${id}`)).status).toBe(410);
    expect((await call('POST', `/api/invites/${id}/accept`, undefined, { username: 'zed', password: 'password1', email: 'z@x.com' })).status).toBe(410);
  });

  it('validates the accept body without consuming the invite', async () => {
    const id = await newInvite();
    const accept = (b: Record<string, unknown>) => call('POST', `/api/invites/${id}/accept`, undefined, b);
    expect((await accept({ username: 'zed', password: 'short', email: 'z@x.com' })).json.error).toMatch(/8 characters/);
    expect((await accept({ username: 'z', password: 'password1', email: 'z@x.com' })).json.error).toMatch(/Username/);
    expect((await accept({ username: 'zed', password: 'password1', email: 'nope' })).json.error).toMatch(/email/i);
    expect((await call('GET', `/api/invites/${id}`)).status).toBe(200);
  });

  it('is single use, pins the invite email, and applies the invited role', async () => {
    const id = await newInvite({ email: 'Pinned@X.com', role: 'admin' });
    const first = await call('POST', `/api/invites/${id}/accept`, undefined, {
      username: 'pinned', password: 'password1', email: 'attacker@x.com',
    });
    expect(first.status).toBe(200);
    expect(first.json.error).toBeNull();
    expect(first.json.user).toMatchObject({ email: 'Pinned@X.com', role: 'admin' });
    expect(String(first.headers.get('set-cookie'))).toMatch(/^session=/);
    expect(JSON.stringify(first.json)).not.toMatch(/password/i);
    const second = await call('POST', `/api/invites/${id}/accept`, undefined, { username: 'again', password: 'password1' });
    expect(second.status).toBe(410);
  });

  it('releases the invite when the email or username is already taken', async () => {
    const id = await newInvite();
    const taken = await call('POST', `/api/invites/${id}/accept`, undefined, { username: 'editor', password: 'password1', email: 'fresh@x.com' });
    expect(taken.json.error).toMatch(/already exists/);
    expect((await call('GET', `/api/invites/${id}`)).status).toBe(200);
    const dupEmail = await call('POST', `/api/invites/${id}/accept`, undefined, { username: 'fresh', password: 'password1', email: 'E@X' });
    expect(dupEmail.json.error).toMatch(/already exists/);
    const ok = await call('POST', `/api/invites/${id}/accept`, undefined, { username: 'fresh', password: 'password1', email: 'fresh@x.com' });
    expect(ok.json.error).toBeNull();
    expect(ok.json.user.role).toBe('member');
  });
});

describe('band invites', () => {
  it('lets editors mint links and any signed-in user accept; viewers cannot mint', async () => {
    expect((await call('POST', '/api/bands/b1/invite-link', 'viewer')).status).toBe(403);
    const link = await call('POST', '/api/bands/b1/invite-link', 'editor');
    const id = link.json.inviteId as string;
    expect((await call('POST', `/api/bands/invites/${id}/accept`)).status).toBe(401);
    expect((await call('POST', `/api/bands/invites/${id}/accept`, 'other')).status).toBe(200);
    // idempotent
    expect((await call('POST', `/api/bands/invites/${id}/accept`, 'other')).status).toBe(200);
    expect((await call('POST', '/api/bands/invites/missing/accept', 'other')).status).toBe(404);
  });

  it('rejects expired and revoked band invites', async () => {
    const id = (await call('POST', '/api/bands/b1/invite-link', 'editor')).json.inviteId as string;
    await h.exec(`UPDATE band_invites SET expires_at = now() - interval '1 day' WHERE id = '${id}'`);
    expect((await call('POST', `/api/bands/invites/${id}/accept`, 'admin')).status).toBe(410);
    const id2 = (await call('POST', '/api/bands/b1/invite-link', 'editor')).json.inviteId as string;
    await h.exec(`UPDATE band_invites SET status = 'revoked' WHERE id = '${id2}'`);
    expect((await call('POST', `/api/bands/invites/${id2}/accept`, 'admin')).status).toBe(409);
  });
});
