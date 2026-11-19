// @vitest-environment node
/**
 * Auth flows with real signed-cookie sessions: login, /me, profile edits, password change (revokes other sessions), logout, deletion, rate limiting: real Express app over HTTP, backed by an
 * in-memory Postgres (PGlite) built from the real drizzle migrations, so the migration SQL itself
 * is exercised too. Auth is shimmed to an `x-user-id` header; the feed route is unauthenticated,
 * as in production.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
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

const { authRouter } = await import('./auth.js');
const { attachSession } = await import('../middleware/session.js');
const { authRateLimit } = await import('../middleware/rateLimit.js');

let base: string;
let server: ReturnType<express.Express['listen']>;

async function call(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const setCookie = res.headers.get('set-cookie');
  return {
    status: res.status,
    json: (await res.json().catch(() => ({}))) as Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    cookie: setCookie ? setCookie.split(';')[0] : undefined,
    setCookie,
  };
}

async function login(email = 'e@x', password = 'hunter2hunter2') {
  return call('POST', '/api/auth/login', { body: { email, password } });
}

beforeAll(async () => {
  await h.ready;
  const hash = await bcrypt.hash('hunter2hunter2', 4);
  await h.exec(`UPDATE users SET password_hash = '${hash}'`);
  const app = express();
  app.use(cookieParser('test-secret'));
  app.use(express.json());
  app.use(attachSession);
  app.use('/api/auth', authRouter);
  // A separate mount with the limiter, as in production (index.ts), so it doesn't throttle the main tests.
  app.use('/limited', authRateLimit, authRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => { server.close(); });

describe('login and sessions', () => {
  it('rejects bad credentials with one generic message for unknown email and wrong password', async () => {
    const wrongPw = await login('e@x', 'nope-nope-nope');
    const noUser = await login('ghost@x', 'hunter2hunter2');
    expect(wrongPw.json).toEqual({ user: null, error: 'Invalid email or password.' });
    expect(noUser.json).toEqual(wrongPw.json);
    expect(wrongPw.cookie).toBeUndefined();
    expect((await call('POST', '/api/auth/login', { body: { email: 1 } })).json.error).toMatch(/required/);
  });

  it('logs in case-insensitively, sets an httpOnly signed cookie and never leaks the hash', async () => {
    const res = await login('  E@X ');
    expect(res.json.error).toBeNull();
    expect(res.json.user).toMatchObject({ id: 'editor' });
    expect(JSON.stringify(res.json)).not.toMatch(/\$2[aby]\$/);
    expect(res.setCookie).toMatch(/HttpOnly/i);
    expect(res.setCookie).toMatch(/SameSite=Strict/i);
    expect(res.cookie).toMatch(/^session=s%3A/); // signed
    const me = await call('GET', '/api/auth/me', { cookie: res.cookie });
    expect(me.json.user.id).toBe('editor');
  });

  it('treats missing, tampered, unsigned and expired cookies as logged out', async () => {
    const { cookie } = await login();
    expect((await call('GET', '/api/auth/me')).json.user).toBeNull();
    expect((await call('GET', '/api/auth/me', { cookie: `${cookie}x` })).json.user).toBeNull();
    const rawToken = decodeURIComponent(cookie!.split('=')[1]).slice(2).split('.')[0];
    expect((await call('GET', '/api/auth/me', { cookie: `session=${rawToken}` })).json.user).toBeNull();
    await h.exec(`UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE token = '${rawToken}'`);
    expect((await call('GET', '/api/auth/me', { cookie })).json.user).toBeNull();
  });

  it('logout deletes the session server-side', async () => {
    const { cookie } = await login();
    expect((await call('POST', '/api/auth/logout', { cookie })).status).toBe(200);
    expect((await call('GET', '/api/auth/me', { cookie })).json.user).toBeNull();
  });
});

describe('profile', () => {
  it('requires login for every mutation', async () => {
    for (const [m, p] of [['PATCH', '/api/auth/me'], ['POST', '/api/auth/password'], ['DELETE', '/api/auth/me']]) {
      expect((await call(m, p, { body: {} })).status, `${m} ${p}`).toBe(401);
    }
  });

  it('validates and applies profile edits, refusing taken emails/usernames', async () => {
    const { cookie } = await login('v@x');
    const patch = (body: Record<string, unknown>) => call('PATCH', '/api/auth/me', { cookie, body });
    expect((await patch({})).json.error).toMatch(/No changes/);
    expect((await patch({ email: 'nope' })).json.error).toMatch(/valid email/);
    expect((await patch({ username: 'a' })).json.error).toMatch(/2 characters/);
    expect((await patch({ avatar: 'x'.repeat(9) })).json.error).toMatch(/avatar/);
    expect((await patch({ fullName: '   ' })).json.error).toMatch(/required/);
    expect((await patch({ fullName: 'x'.repeat(81) })).json.error).toMatch(/80/);
    expect((await patch({ email: 'E@x' })).json.error).toMatch(/already exists/);
    expect((await patch({ username: 'editor' })).json.error).toMatch(/already exists/);
    const ok = await patch({ fullName: ' Vee ', username: 'vee' });
    expect(ok.json.error).toBeNull();
    expect(ok.json.user).toMatchObject({ fullName: 'Vee', username: 'vee' });
  });

  it('ignores attempts to change role or id through the profile endpoint', async () => {
    const { cookie } = await login('o@x');
    await call('PATCH', '/api/auth/me', { cookie, body: { fullName: 'Oh', role: 'admin', id: 'admin' } });
    const me = await call('GET', '/api/auth/me', { cookie });
    expect(me.json.user.id).toBe('other');
    expect(me.json.user.role).not.toBe('admin');
  });
});

describe('password change', () => {
  it('checks the current password and the new length', async () => {
    const { cookie } = await login('o@x');
    const post = (body: Record<string, unknown>) => call('POST', '/api/auth/password', { cookie, body });
    expect((await post({ newPassword: 'longenough1' })).json.error).toMatch(/Current password is required/);
    expect((await post({ currentPassword: 'wrong-wrong', newPassword: 'longenough1' })).json.error).toMatch(/incorrect/);
    expect((await post({ currentPassword: 'hunter2hunter2', newPassword: 'short' })).json.error).toMatch(/8 characters/);
  });

  it('changes the password, keeps this session and revokes the others', async () => {
    const a = await login('o@x');
    const b = await login('o@x');
    const res = await call('POST', '/api/auth/password', { cookie: a.cookie, body: { currentPassword: 'hunter2hunter2', newPassword: 'brand-new-pass' } });
    expect(res.json.error).toBeNull();
    expect((await call('GET', '/api/auth/me', { cookie: a.cookie })).json.user?.id).toBe('other');
    expect((await call('GET', '/api/auth/me', { cookie: b.cookie })).json.user).toBeNull();
    expect((await login('o@x', 'hunter2hunter2')).json.user).toBeNull();
    expect((await login('o@x', 'brand-new-pass')).json.user?.id).toBe('other');
  });
});

describe('account deletion', () => {
  it('deletes the account and its sessions', async () => {
    const { cookie } = await login('v@x');
    expect((await call('DELETE', '/api/auth/me', { cookie })).json.error).toBeNull();
    expect((await call('GET', '/api/auth/me', { cookie })).json.user).toBeNull();
    expect((await login('v@x')).json.user).toBeNull();
  });
});

describe('rate limiting', () => {
  it('returns 429 after 20 requests a minute from one address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await call('POST', '/limited/login', { body: {} })).status) // no bcrypt work on this path, keeps the test fast;
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);
  });
});
