// @vitest-environment node
/**
 * Song-nested resources: PDF attachments, audio recordings and hand notes - uploads, ownership rules, quota, file cleanup, band scoping: real Express app over HTTP, backed by an
 * in-memory Postgres (PGlite) built from the real drizzle migrations, so the migration SQL itself
 * is exercised too. Auth is shimmed to an `x-user-id` header; the feed route is unauthenticated,
 * as in production.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  // trash.ts (pulled in by the CRUD builder) imports the storage adapter, which insists on this being set.
  process.env.ATTACHMENTS_DIR = `/tmp/gigboy-files-${process.pid}`; // hoisted code can't use the imports below
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
        ('other',  'o@x', 'o@x', 'other',  'x'), ('ed2', 'e2@x', 'e2@x', 'ed2', 'x');
      INSERT INTO users (id, email, email_lower, username, password_hash, role) VALUES ('admin', 'a@x', 'a@x', 'admin', 'x', 'admin'), ('admin2', 'a2@x', 'a2@x', 'admin2', 'x', 'admin');
      INSERT INTO bands (id, name, owner_id) VALUES ('b1', 'Band; One', 'editor'), ('b2', 'Other', 'other');
      INSERT INTO band_members (band_id, user_id, role) VALUES
        ('b1', 'editor', 'editor'), ('b1', 'viewer', 'viewer'), ('b2', 'other', 'editor');
      INSERT INTO songs (id, band_id, title, language, chordpro) VALUES
        ('song1', 'b1', 'Song One', 'en', '{title: Song One}'), ('song2', 'b2', 'Foreign', 'en', '');
      INSERT INTO band_members (band_id, user_id, role) VALUES ('b1', 'ed2', 'editor');
      INSERT INTO setlists (id, band_id, name) VALUES ('s1', 'b1', 'Set One'), ('s2', 'b2', 'Foreign Set');
    `);
  })();
  return { db };
});

const { bandAttachmentsRouter } = await import('./bandAttachments.js');
const { bandSongRecordingsRouter } = await import('./songRecordings.js');
const { bandSongHandNotesRouter } = await import('./songHandNotes.js');

let base: string;
let server: ReturnType<express.Express['listen']>;
const filesDir = process.env.ATTACHMENTS_DIR!;

async function call(method: string, path: string, user?: string, body?: unknown) {
  const isForm = body instanceof FormData;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(isForm || body === undefined ? {} : { 'content-type': 'application/json' }), ...(user ? { 'x-user-id': user } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let json: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { json = JSON.parse(buf.toString('utf8')); } catch { /* binary */ }
  return { status: res.status, json, buf, headers: res.headers };
}

const upload = (bytes: Buffer, type: string, filename: string, extra: Record<string, string> = {}) => {
  const f = new FormData();
  f.append('file', new Blob([new Uint8Array(bytes)], { type }), filename);
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  return f;
};
const pdf = Buffer.from('%PDF-1.4 test');

beforeAll(async () => {
  await h.ready;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const u = req.header('x-user-id');
    if (u) (req as unknown as { userId?: string }).userId = u;
    next();
  });
  app.use('/api/bands/:bandId/songs/:songId/attachments', bandAttachmentsRouter);
  app.use('/api/bands/:bandId/songs/:songId/hand-notes', bandSongHandNotesRouter);
  app.use('/api/bands/:bandId/songs/:songId/recordings', bandSongRecordingsRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => { server.close(); rmSync(filesDir, { recursive: true, force: true }); });

const A = '/api/bands/b1/songs/song1/attachments';

describe('attachments', () => {
  let id: string;

  it('lets editors upload PDFs, stores the file, and lets any member download it', async () => {
    const up = await call('POST', A, 'editor', upload(pdf, 'application/pdf', 'chart.pdf'));
    expect(up.status).toBe(200);
    expect(up.json.attachment).toMatchObject({ name: 'chart.pdf', sizeBytes: pdf.length });
    id = up.json.attachment.id;
    expect(existsSync(join(filesDir, 'song1', `${id}.pdf`))).toBe(true);
    const dl = await call('GET', `${A}/${id}/download`, 'viewer');
    expect(dl.status).toBe(200);
    expect(dl.buf.equals(pdf)).toBe(true);
    expect((await call('GET', A, 'viewer')).json.attachments).toHaveLength(1);
  });

  it('rejects anonymous callers, viewers, strangers and non-PDF or empty uploads', async () => {
    expect((await call('POST', A, undefined, upload(pdf, 'application/pdf', 'a.pdf'))).status).toBe(401);
    expect((await call('POST', A, 'viewer', upload(pdf, 'application/pdf', 'a.pdf'))).status).toBe(403);
    expect((await call('POST', A, 'other', upload(pdf, 'application/pdf', 'a.pdf'))).status).toBe(403);
    expect((await call('POST', A, 'editor', upload(Buffer.from('x'), 'text/plain', 'a.txt'))).status).toBe(400);
    expect((await call('POST', A, 'editor', new FormData())).status).toBe(400);
    expect((await call('GET', A, 'other')).status).toBe(403);
    expect((await call('GET', `${A}/${id}/download`, 'other')).status).toBe(403);
  });

  it('404s for a song that belongs to a different band', async () => {
    expect((await call('GET', '/api/bands/b1/songs/song2/attachments', 'editor')).status).toBe(404);
    expect((await call('POST', '/api/bands/b1/songs/song2/attachments', 'editor', upload(pdf, 'application/pdf', 'a.pdf'))).status).toBe(404);
  });

  it('enforces the uploader quota with 413', async () => {
    await h.exec("UPDATE users SET storage_quota_bytes = 10 WHERE id = 'editor'");
    const res = await call('POST', A, 'editor', upload(pdf, 'application/pdf', 'big.pdf'));
    expect(res.status).toBe(413);
    expect(res.json.error).toMatch(/quota/i);
    await h.exec("UPDATE users SET storage_quota_bytes = NULL WHERE id = 'editor'");
  });

  it('only lets the uploader rename or delete, and delete moves it to trash', async () => {
    expect((await call('PATCH', `${A}/${id}`, 'ed2', { name: 'x.pdf' })).status).toBe(403);
    expect((await call('PATCH', `${A}/${id}`, 'editor', { name: '  ' })).status).toBe(400);
    expect((await call('PATCH', `${A}/${id}`, 'editor', { name: 'renamed.pdf' })).json.attachment.name).toBe('renamed.pdf');
    expect((await call('DELETE', `${A}/${id}`, 'ed2')).status).toBe(403);
    expect((await call('DELETE', `${A}/${id}`, 'editor')).status).toBe(200);
    expect((await call('GET', `${A}/${id}/download`, 'editor')).status).toBe(404);
    const [row] = (await (await import('../db/client.js')).db.execute(
      (await import('drizzle-orm')).sql`SELECT item_type FROM trash_items WHERE band_id = 'b1'`,
    )).rows as Array<{ item_type: string }>;
    expect(row.item_type).toBe('attachment');
  });
});

const R = '/api/bands/b1/songs/song1/recordings';

describe('recordings', () => {
  let id: string;
  const audio = Buffer.from('fake-audio-bytes');

  it('lets members record, stores metadata and the file', async () => {
    const up = await call('POST', R, 'viewer', upload(audio, 'audio/webm', 'take.webm', { name: ' Take 1 ', durationMs: '1234.6', waveformBars: '[0.1, 0.5, "x"]' }));
    expect(up.status).toBe(200);
    expect(up.json.recording).toMatchObject({ name: 'Take 1', durationMs: 1235, sizeBytes: audio.length });
    id = up.json.recording.id;
    expect(existsSync(join(filesDir, 'song1', 'recordings', `${id}.webm`))).toBe(true);
    const list = await call('GET', R, 'editor');
    expect(list.json.recordings[0]).toMatchObject({ id, commentCount: 0 });
  });

  it('rejects non-audio, empty and cross-band uploads, and strangers', async () => {
    expect((await call('POST', R, 'editor', upload(Buffer.from('x'), 'text/plain', 'a.txt'))).status).toBe(400);
    expect((await call('POST', R, 'editor', new FormData())).status).toBe(400);
    expect((await call('POST', R, 'other', upload(audio, 'audio/webm', 'a.webm'))).status).toBe(403);
    expect((await call('POST', R, undefined, upload(audio, 'audio/webm', 'a.webm'))).status).toBe(401);
    expect((await call('GET', '/api/bands/b1/songs/song2/recordings', 'editor')).status).toBe(404);
  });

  it('lets the recorder or an editor rename/delete, but not another viewer', async () => {
    await h.exec("INSERT INTO users (id, email, email_lower, username, password_hash) VALUES ('v2','v2@x','v2@x','v2','x'); INSERT INTO band_members (band_id, user_id, role) VALUES ('b1','v2','viewer');");
    expect((await call('PATCH', `${R}/${id}`, 'v2', { name: 'Mine' })).status).toBe(403);
    expect((await call('DELETE', `${R}/${id}`, 'v2')).status).toBe(403);
    expect((await call('PATCH', `${R}/${id}`, 'viewer', { name: '' })).status).toBe(400);
    expect((await call('PATCH', `${R}/${id}`, 'viewer', { name: 'Mine' })).json.recording.name).toBe('Mine');
    expect((await call('PATCH', `${R}/${id}`, 'editor', { name: 'Editor renamed' })).status).toBe(200);
  });

  it('serves the file to members only, then deletes the row and the file', async () => {
    expect((await call('GET', `${R}/${id}/download`, 'other')).status).toBe(403);
    expect((await call('GET', `${R}/${id}/download`, 'v2')).buf.equals(audio)).toBe(true);
    expect((await call('DELETE', `${R}/${id}`, 'editor')).status).toBe(200);
    expect(existsSync(join(filesDir, 'song1', 'recordings', `${id}.webm`))).toBe(false);
    expect((await call('GET', `${R}/${id}/download`, 'editor')).status).toBe(404);
  });

  it('enforces the quota on recordings too', async () => {
    await h.exec("UPDATE users SET storage_quota_bytes = 5 WHERE id = 'viewer'");
    expect((await call('POST', R, 'viewer', upload(audio, 'audio/webm', 'a.webm'))).status).toBe(413);
  });
});

const N = '/api/bands/b1/songs/song1/hand-notes';

describe('hand notes', () => {
  it('upserts one note per author and keeps authors separate', async () => {
    await call('PUT', `${N}/me`, 'viewer', { strokes: [{ p: 1 }], authorName: 'Vee' });
    await call('PUT', `${N}/me`, 'viewer', { strokes: [{ p: 2 }] });
    await call('PUT', `${N}/me`, 'editor', { strokes: [] });
    const list = await call('GET', N, 'viewer');
    expect(list.json.notes).toHaveLength(2);
    expect(list.json.notes.find((n: { authorUid?: string }) => n.authorUid === 'viewer')?.strokes).toEqual([{ p: 2 }]);
    expect((await call('PUT', `${N}/me`, 'other', { strokes: [] })).status).toBe(403);
    expect((await call('PUT', `${N}/me`, undefined, { strokes: [] })).status).toBe(401);
  });

  it('only lets editors clear other authors\' notes', async () => {
    expect((await call('DELETE', `${N}/editor`, 'viewer')).status).toBe(403);
    expect((await call('DELETE', `${N}/viewer`, 'editor')).status).toBe(200);
    expect((await call('DELETE', `${N}/me`, 'editor')).status).toBe(200);
    expect((await call('GET', N, 'editor')).json.notes).toHaveLength(0);
  });
});
