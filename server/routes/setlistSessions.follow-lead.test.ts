// @vitest-environment node
/**
 * End-to-end check of the "solo / follow lead" setlist session flow (server/routes/setlistSessions.ts):
 * a real Express app + real HTTP + real Server-Sent-Events stream, backed by an in-memory Postgres
 * (pg-mem). Auth is shimmed to an `x-user-id` header so the test stays hermetic; everything else —
 * the rooms map, claim/release, the SSE broadcast, the position clamp, membership checks and the
 * per-user stream cap added for DoS hardening — is exercised as written.
 */
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ db: null as unknown as import('drizzle-orm/node-postgres').NodePgDatabase<Record<string, unknown>>, ready: null as unknown as Promise<void> }));

vi.mock('../db/client.js', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('../db/schema.js');

  const client = new PGlite();
  const db = drizzle(client, { schema: schema as unknown as Record<string, unknown> });

  h.ready = (async () => {
    const pool = client;
    await pool.exec(`
      CREATE TABLE users (id text primary key, email text, email_lower text, username text,
        password_hash text, avatar text, full_name text, role text default 'member',
        storage_quota_bytes bigint, created_at timestamptz default now());
      CREATE TABLE bands (id text primary key, name text, description text, icon text, logo text,
        owner_id text, created_at timestamptz default now(), updated_at timestamptz default now());
      CREATE TABLE band_members (band_id text, user_id text, role text default 'editor',
        joined_at timestamptz default now(), primary key (band_id, user_id));
      CREATE TABLE setlists (id text primary key, band_id text, name text, icon text,
        song_ids jsonb default '[]', song_notes jsonb, sort_order integer,
        created_at timestamptz default now(), updated_at timestamptz default now());
      CREATE TABLE setlist_sessions (setlist_id text primary key, band_id text,
        song_index integer not null default 0, page_index integer not null default 0,
        transpose integer not null default 0, updated_at timestamptz default now());
    `);
    await pool.exec(`
      INSERT INTO users (id, email, email_lower, username, password_hash) VALUES
        ('leader',   'l@x', 'l@x', 'leader',   'x'),
        ('follower', 'f@x', 'f@x', 'follower', 'x'),
        ('outsider', 'o@x', 'o@x', 'outsider', 'x');
      INSERT INTO bands (id, name, owner_id) VALUES ('b1', 'Band', 'leader');
      INSERT INTO band_members (band_id, user_id, role) VALUES
        ('b1', 'leader', 'editor'), ('b1', 'follower', 'editor');
      INSERT INTO setlists (id, band_id, name) VALUES
        ('s1','b1','Set 1'),('s2','b1','Set 2'),('s3','b1','Set 3'),
        ('s4','b1','Set 4'),('s5','b1','Set 5'),('s6','b1','Set 6');
    `);
  })();

  h.db = db as never;
  return { db };
});

const { bandSetlistSessionRouter } = await import('./setlistSessions.js');

let baseUrl: string;
let server: ReturnType<express.Express['listen']>;

beforeAll(async () => {
  await h.ready;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const u = req.header('x-user-id');
    if (u) (req as unknown as { userId?: string }).userId = u;
    next();
  });
  app.use('/api/bands/:bandId/setlists/:setlistId/session', bandSetlistSessionRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api/bands/b1/setlists`;
});

afterAll(() => {
  server?.close();
});

const url = (setlistId: string, path: string) => `${baseUrl}/${setlistId}/session${path}`;

/** Opens an SSE stream and yields successive parsed `data:` JSON payloads. */
function openStream(setlistId: string, userId: string, path = '/stream') {
  const ctrl = new AbortController();
  const queue: unknown[] = [];
  let waiter: ((v: unknown) => void) | null = null;
  const push = (v: unknown) => {
    if (waiter) { waiter(v); waiter = null; }
    else queue.push(v);
  };

  const started = fetch(url(setlistId, path), { headers: { 'x-user-id': userId }, signal: ctrl.signal })
    .then(async (res) => {
      if (!res.ok || !res.body) return res;
      (async () => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buf.indexOf('\n\n')) !== -1) {
              const frame = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              const line = frame.split('\n').find((l) => l.startsWith('data: '));
              if (line) push(JSON.parse(line.slice(6)));
            }
          }
        } catch { /* aborted */ }
      })();
      return res;
    });

  return {
    response: () => started,
    next: (timeoutMs = 2000): Promise<unknown> => {
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        waiter = resolve;
        setTimeout(() => reject(new Error('timed out waiting for SSE event')), timeoutMs);
      });
    },
    close: () => ctrl.abort(),
  };
}

const post = (setlistId: string, path: string, userId: string, body?: unknown) =>
  fetch(url(setlistId, path), {
    method: 'POST',
    headers: { 'x-user-id': userId, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

describe('solo / follow lead', () => {
  it('a follower stream receives the leader claiming and every position change', async () => {
    // Both the leader and the follower have the live stream open, as the real UI does.
    const leader = openStream('s1', 'leader');
    const follower = openStream('s1', 'follower');
    await Promise.all([leader.response(), follower.response()]);
    await leader.next();
    expect(await follower.next()).toMatchObject({ songIndex: 0, pageIndex: 0, transpose: 0, hostUserId: null });

    const claim = await post('s1', '/claim', 'leader');
    expect(claim.status).toBe(200);
    expect(await claim.json()).toMatchObject({ hostUserId: 'leader' });
    expect(await follower.next()).toMatchObject({ hostUserId: 'leader' });

    const move = await post('s1', '/', 'leader', { songIndex: 3, pageIndex: 2, transpose: 5 });
    expect(move.status).toBe(200);
    expect(await follower.next()).toMatchObject({ songIndex: 3, pageIndex: 2, transpose: 5, hostUserId: 'leader' });

    leader.close();
    follower.close();
  });

  it('non-leaders cannot drive the position', async () => {
    const leader = openStream('s2', 'leader');
    await leader.response();
    await post('s2', '/claim', 'leader');

    const res = await post('s2', '/', 'follower', { songIndex: 9 });
    expect(res.status).toBe(403);
    leader.close();
  });

  it('a second person cannot claim the lead while it is held', async () => {
    const leader = openStream('s3', 'leader');
    await leader.response();
    expect((await post('s3', '/claim', 'leader')).status).toBe(200);

    const res = await post('s3', '/claim', 'follower');
    expect(res.status).toBe(409);
    leader.close();
  });

  it('transpose is clamped to the +/-11 semitone range', async () => {
    const leader = openStream('s4', 'leader');
    const listener = openStream('s4', 'follower');
    await Promise.all([leader.response(), listener.response()]);
    await leader.next();
    await listener.next();
    await post('s4', '/claim', 'leader');
    await listener.next(); // claim broadcast

    await post('s4', '/', 'leader', { transpose: 999 });
    expect((await listener.next()) as { transpose: number }).toMatchObject({ transpose: 11 });
    leader.close();
    listener.close();
  });

  it('releasing the lead broadcasts hostUserId=null and frees the claim', async () => {
    const leader = openStream('s5', 'leader');
    const watcher = openStream('s5', 'follower');
    await Promise.all([leader.response(), watcher.response()]);
    await leader.next();
    await watcher.next();
    await post('s5', '/claim', 'leader');
    await watcher.next();

    expect((await post('s5', '/release', 'leader')).status).toBe(200);
    expect(await watcher.next()).toMatchObject({ hostUserId: null });

    const reclaim = await post('s5', '/claim', 'follower');
    expect(reclaim.status).toBe(200);
    expect(await reclaim.json()).toMatchObject({ hostUserId: 'follower' });
    leader.close();
    watcher.close();
  });

  it('outsiders (non band members) are refused', async () => {
    expect((await fetch(url('s6', '/'), { headers: { 'x-user-id': 'outsider' } })).status).toBe(403);
    expect((await post('s6', '/claim', 'outsider')).status).toBe(403);
  });

  it('caps concurrent streams per user per setlist at 5 (DoS hardening)', async () => {
    const streams = Array.from({ length: 5 }, () => openStream('s6', 'leader'));
    const responses = await Promise.all(streams.map((s) => s.response()));
    expect(responses.every((r) => r.ok)).toBe(true);

    const sixth = openStream('s6', 'leader');
    expect((await sixth.response()).status).toBe(429);

    streams.forEach((s) => s.close());
    sixth.close();
  });
});
