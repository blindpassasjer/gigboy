// @vitest-environment node
/**
 * End-to-end check of gigs + the per-member iCal feed: real Express app over HTTP, backed by an
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

const { bandGigsRouter } = await import('./bandGigs.js');
const { bandToursRouter } = await import('./bandTours.js');
const { bandPressKitsRouter } = await import('./bandPressKits.js');
const { bandPressKitSharesRouter } = await import('./bandPressKitShares.js');
const { publicPressKitsRouter } = await import('./publicPressKits.js');
const { bandCalendarFeedRouter } = await import('./bandCalendarFeed.js');
const { publicCalendarRouter } = await import('./publicCalendar.js');

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
  try { json = JSON.parse(text); } catch { /* ics / plain text */ }
  return { status: res.status, text, json, headers: res.headers };
}

const gig = {
  id: 'g1',
  title: 'Pub; night',
  startsAt: '2026-11-01T19:00:00.000Z',
  getInAt: '2026-11-01T15:00:00.000Z',
  soundCheckAt: '2026-11-01T16:30:00.000Z',
  timezone: 'Europe/Oslo',
  venue: 'The Pub',
  contactName: 'Sam',
  contactPhone: '+47 123',
  notes: 'Back alley',
  setlistId: 's1',
  status: 'confirmed',
};

beforeAll(async () => {
  await h.ready;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const u = req.header('x-user-id');
    if (u) (req as unknown as { userId?: string }).userId = u;
    next();
  });
  app.use('/api/bands/:bandId/gigs', bandGigsRouter);
  app.use('/api/bands/:bandId/tours', bandToursRouter);
  app.use('/api/bands/:bandId/press-kits', bandPressKitSharesRouter);
  app.use('/api/bands/:bandId/press-kits', bandPressKitsRouter);
  app.use('/api/bands/:bandId/calendar-feed', bandCalendarFeedRouter);
  app.use('/api/public', publicCalendarRouter);
  app.use('/api/public', publicPressKitsRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => { server.close(); });

describe('gigs', () => {
  it('lets an editor create a gig and a viewer read but not write it', async () => {
    const created = await call('POST', '/api/bands/b1/gigs', 'editor', gig);
    expect(created.status).toBe(200);
    expect(created.json.gig).toMatchObject({ id: 'g1', title: 'Pub; night', contactName: 'Sam', setlistId: 's1' });
    expect((await call('GET', '/api/bands/b1/gigs', 'viewer')).json.gigs).toHaveLength(1);
    expect((await call('POST', '/api/bands/b1/gigs', 'viewer', { ...gig, id: 'g2' })).status).toBe(403);
    expect((await call('GET', '/api/bands/b1/gigs', 'other')).status).toBe(403);
  });

  it('validates the body, but only after checking the caller may write to the band', async () => {
    // A non-member gets 403 even with an invalid body — no probing which ids exist.
    expect((await call('POST', '/api/bands/b1/gigs', 'other', { id: 'x', title: '', startsAt: 'nope', setlistId: 's1' })).status).toBe(403);
    expect((await call('POST', '/api/bands/b1/gigs')).status).toBe(401);
    expect((await call('POST', '/api/bands/b1/gigs', 'editor', { ...gig, id: 'bad1', title: '  ' })).status).toBe(400);
    expect((await call('POST', '/api/bands/b1/gigs', 'editor', { ...gig, id: 'bad2', startsAt: 'garbage' })).status).toBe(400);
    expect((await call('POST', '/api/bands/b1/gigs', 'editor', { ...gig, id: 'bad3', endsAt: gig.startsAt })).status).toBe(400);
  });

  it("rejects attaching another band's setlist", async () => {
    const res = await call('POST', '/api/bands/b1/gigs', 'editor', { ...gig, id: 'g3', setlistId: 's2' });
    expect(res.status).toBe(400);
    const update = await call('PUT', '/api/bands/b1/gigs/g1', 'editor', { ...gig, setlistId: 's2' });
    expect(update.status).toBe(400);
  });
});

describe('tours', () => {
  it('lets editors create tours, groups gigs under them, and keeps gigs when a tour is deleted', async () => {
    const tour = await call('POST', '/api/bands/b1/tours', 'editor', { id: 't1', name: 'Summer Tour' });
    expect(tour.status).toBe(200);
    expect(tour.json.tour).toMatchObject({ id: 't1', name: 'Summer Tour' });
    expect((await call('POST', '/api/bands/b1/tours', 'viewer', { id: 't9', name: 'Nope' })).status).toBe(403);

    const put = await call('PUT', '/api/bands/b1/gigs/g1', 'editor', { ...gig, tourId: 't1' });
    expect(put.json.gig.tourId).toBe('t1');

    expect((await call('DELETE', '/api/bands/b1/tours/t1', 'editor')).status).toBe(200);
    const gigs = (await call('GET', '/api/bands/b1/gigs', 'viewer')).json.gigs;
    expect(gigs.find((g: { id: string }) => g.id === 'g1').tourId).toBeUndefined();
  });

  it("rejects attaching a gig to another band's tour", async () => {
    await call('POST', '/api/bands/b2/tours', 'other', { id: 't2', name: 'Foreign Tour' });
    const res = await call('PUT', '/api/bands/b1/gigs/g1', 'editor', { ...gig, tourId: 't2' });
    expect(res.status).toBe(400);
  });
});

describe('calendar feed', () => {
  let token = '';

  it('lets any member (viewer included) create a feed, and refuses non-members', async () => {
    expect((await call('GET', '/api/bands/b1/calendar-feed', 'viewer')).json.feed).toBeNull();
    const created = await call('POST', '/api/bands/b1/calendar-feed', 'viewer');
    expect(created.status).toBe(200);
    token = created.json.feed.token;
    expect(created.json.feed.feedPath).toBe(`/api/public/calendar/${token}.ics`);
    expect(created.json.feed.feedUrl).toBeUndefined();
    // Idempotent.
    expect((await call('POST', '/api/bands/b1/calendar-feed', 'viewer')).json.feed.token).toBe(token);
    expect((await call('POST', '/api/bands/b1/calendar-feed', 'other')).status).toBe(403);
  });

  it('serves the full schedule, contact and attachment names without authentication', async () => {
    const res = await call('GET', `/api/public/calendar/${token}.ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    expect(res.headers.get('cache-control')).toContain('private');
    const ics = res.text.replace(/\r\n /g, '');
    const BS = String.fromCharCode(92);
    expect(ics).toContain(`X-WR-CALNAME:Band${BS}; One gigs`);
    expect(ics).toContain(`SUMMARY:Pub${BS}; night`);
    expect(ics).toContain('DTSTART:20261101T190000Z');
    expect(ics).toMatch(/Get in: /);
    expect(ics).toMatch(/Sound check: /);
    expect(ics).toContain('Contact: Sam · +47 123');
    expect(ics).toContain('Setlist: Set One');
    expect(ics).not.toContain('Tour:'); // tour was deleted above, so the gig is ungrouped
  });

  it("only includes the token's own band", async () => {
    await call('POST', '/api/bands/b2/gigs', 'other', { ...gig, id: 'gx', title: 'Other band gig', setlistId: undefined });
    const ics = (await call('GET', `/api/public/calendar/${token}.ics`)).text;
    expect(ics).not.toContain('Other band gig');
  });

  it('404s for an unknown token', async () => {
    expect((await call('GET', '/api/public/calendar/nope.ics')).status).toBe(404);
  });

  it('stops working when the member is removed from the band', async () => {
    await h.exec(`DELETE FROM band_members WHERE band_id='b1' AND user_id='viewer'`);
    expect((await call('GET', `/api/public/calendar/${token}.ics`)).status).toBe(404);
    await h.exec(`INSERT INTO band_members (band_id, user_id, role) VALUES ('b1','viewer','viewer')`);
    expect((await call('GET', `/api/public/calendar/${token}.ics`)).status).toBe(200);
  });

  it('regenerate revokes the old link; disable revokes the current one', async () => {
    const regen = await call('POST', '/api/bands/b1/calendar-feed/regenerate', 'viewer');
    const next = regen.json.feed.token;
    expect(next).not.toBe(token);
    expect((await call('GET', `/api/public/calendar/${token}.ics`)).status).toBe(404);
    expect((await call('GET', `/api/public/calendar/${next}.ics`)).status).toBe(200);
    await call('POST', '/api/bands/b1/calendar-feed/disable', 'viewer');
    expect((await call('GET', `/api/public/calendar/${next}.ics`)).status).toBe(404);
    expect((await call('GET', '/api/bands/b1/calendar-feed', 'viewer')).json.feed).toBeNull();
  });

  it("one member's feed management doesn't touch another member's", async () => {
    const editorFeed = (await call('POST', '/api/bands/b1/calendar-feed', 'editor')).json.feed.token;
    const viewerFeed = (await call('POST', '/api/bands/b1/calendar-feed', 'viewer')).json.feed.token;
    await call('POST', '/api/bands/b1/calendar-feed/disable', 'viewer');
    expect((await call('GET', `/api/public/calendar/${viewerFeed}.ics`)).status).toBe(404);
    expect((await call('GET', `/api/public/calendar/${editorFeed}.ics`)).status).toBe(200);
  });
});

describe('press kit tour dates', () => {
  const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const past = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const mk = (id: string, over: Record<string, unknown>) =>
    call('POST', '/api/bands/b1/gigs', 'editor', {
      id,
      title: id,
      startsAt: future(10),
      status: 'confirmed',
      tourId: 'pt1',
      venue: 'Venue ' + id,
      contactName: 'SECRET CONTACT',
      notes: 'SECRET NOTES',
      getInAt: future(10),
      ...over,
    });
  let kitId = '';
  let shareToken = '';
  const publicIds = async () =>
    ((await call('GET', `/api/public/press-kits/${shareToken}`)).json.tourDates as Array<{ id: string }>).map((d) => d.id);

  it('publishes only gigs picked on the kit, and only confirmed upcoming ones, with no private fields', async () => {
    await call('POST', '/api/bands/b1/tours', 'editor', { id: 'pt1', name: 'Public Tour' });
    await mk('listed', {});
    await mk('not-picked', {});
    await mk('cancelled', { status: 'cancelled' });
    await mk('tentative', { status: 'tentative' });
    await mk('old', { startsAt: past(5) });
    await mk('no-tour', { tourId: undefined });
    await call('POST', '/api/bands/b2/gigs', 'other', { id: 'foreign', title: 'Foreign gig', startsAt: future(12), status: 'confirmed' });

    kitId = (await call('POST', '/api/bands/b1/press-kits', 'editor', { name: 'EPK' })).json.pressKit.id;
    shareToken = (await call('POST', `/api/bands/b1/press-kits/${kitId}/share`, 'editor')).json.share.token;
    expect(await publicIds()).toEqual([]);

    const put = await call('PUT', `/api/bands/b1/press-kits/${kitId}`, 'editor', {
      gigIds: ['listed', 'cancelled', 'tentative', 'old', 'no-tour', 'foreign'],
    });
    // Another band's gig id is dropped at save time.
    expect(put.json.pressKit.gigIds.sort()).toEqual(['cancelled', 'listed', 'no-tour', 'old', 'tentative']);

    expect((await publicIds()).sort()).toEqual(['listed', 'no-tour']);
    const pub = await call('GET', `/api/public/press-kits/${shareToken}`);
    const listed = pub.json.tourDates.find((d: { id: string }) => d.id === 'listed');
    expect(listed).toMatchObject({ title: 'listed', venue: 'Venue listed', tourName: 'Public Tour' });
    expect(pub.text).not.toContain('SECRET');
    expect(pub.text).not.toContain('Foreign');
  });

  it('lists dates soonest first and drops a gig the moment it is unpicked', async () => {
    await mk('later', { startsAt: future(30) });
    await call('PUT', `/api/bands/b1/press-kits/${kitId}`, 'editor', { gigIds: ['later', 'listed'] });
    expect(await publicIds()).toEqual(['listed', 'later']);
    await call('PUT', `/api/bands/b1/press-kits/${kitId}`, 'editor', { gigIds: ['later'] });
    expect(await publicIds()).toEqual(['later']);
  });

  it('stops listing a gig when it is cancelled, and publishes nothing when nothing is picked', async () => {
    await mk('later', { startsAt: future(30), status: 'cancelled' });
    expect(await publicIds()).toEqual([]);
    await call('PUT', `/api/bands/b1/press-kits/${kitId}`, 'editor', { gigIds: [] });
    expect(await publicIds()).toEqual([]);
  });
});
