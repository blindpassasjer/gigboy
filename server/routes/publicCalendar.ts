import { Router } from 'express';
import { and, asc, eq, gte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bandMembers, bandRiders, bands, calendarFeeds, gigs, pressKits, setlists, tours } from '../db/schema.js';
import { buildIcs } from '../lib/ics.js';

export const publicCalendarRouter = Router({ mergeParams: true });

type GigRow = typeof gigs.$inferSelect;

// One formatter per timezone for the process — building an Intl.DateTimeFormat per gig per request is slow.
const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timezone: string | null): Intl.DateTimeFormat | null {
  const key = timezone ?? 'UTC';
  if (!formatters.has(key)) {
    try {
      formatters.set(
        key,
        new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: key, timeZoneName: 'short' }),
      );
    } catch {
      formatters.set(key, null); // unknown IANA zone stored on a gig
    }
  }
  return formatters.get(key) ?? null;
}

function formatTime(d: Date, timezone: string | null): string {
  try {
    const formatter = formatterFor(timezone);
    if (!formatter) throw new Error('unknown timezone');
    return formatter.format(d);
  } catch {
    // Unknown IANA zone stored on the gig — fall back to UTC rather than failing the whole feed.
    return `${d.toISOString().slice(11, 16)} UTC`;
  }
}

/** Day-of-show details for band members — this feed is never public, so contacts and schedule are fine here. */
function buildDescription(
  g: GigRow,
  names: { tour: string | null; setlist: string | null; pressKit: string | null; rider: string | null },
): string | null {
  const lines: string[] = [];
  if (g.getInAt) lines.push(`Get in: ${formatTime(g.getInAt, g.timezone)}`);
  if (g.soundCheckAt) lines.push(`Sound check: ${formatTime(g.soundCheckAt, g.timezone)}`);
  lines.push(`On stage: ${formatTime(g.startsAt, g.timezone)}`);
  const contact = [g.contactName, g.contactPhone, g.contactEmail].filter(Boolean).join(' · ');
  if (contact) lines.push(`Contact: ${contact}`);
  if (names.tour) lines.push(`Tour: ${names.tour}`);
  if (names.setlist) lines.push(`Setlist: ${names.setlist}`);
  if (names.rider) lines.push(`Tech rider: ${names.rider}`);
  if (names.pressKit) lines.push(`Press kit: ${names.pressKit}`);
  if (g.notes) lines.push('', g.notes);
  return lines.join('\n');
}

// Token-addressed (calendar apps can't authenticate), but the token belongs to one user and that
// user's current band membership is re-checked on every request.
publicCalendarRouter.get('/calendar/:token.ics', async (req, res) => {
  try {
    const feedRows = await db
      .select({ bandId: calendarFeeds.bandId, bandName: bands.name })
      .from(calendarFeeds)
      .innerJoin(bands, eq(calendarFeeds.bandId, bands.id))
      .innerJoin(
        bandMembers,
        and(eq(bandMembers.bandId, calendarFeeds.bandId), eq(bandMembers.userId, calendarFeeds.userId)),
      )
      .where(and(eq(calendarFeeds.token, req.params.token), eq(calendarFeeds.status, 'active')))
      .limit(1);
    const feed = feedRows[0];
    if (!feed) {
      res.status(404).send('Not found.');
      return;
    }

    const rows = await db
      .select({
        gig: gigs,
        tourName: tours.name,
        setlistName: setlists.name,
        pressKitName: pressKits.name,
        riderName: bandRiders.name,
      })
      .from(gigs)
      .leftJoin(tours, eq(gigs.tourId, tours.id))
      .leftJoin(setlists, eq(gigs.setlistId, setlists.id))
      .leftJoin(pressKits, eq(gigs.pressKitId, pressKits.id))
      .leftJoin(bandRiders, eq(gigs.riderId, bandRiders.id))
      // A year of history is plenty for a subscription; without a floor the feed grows forever.
      .where(and(eq(gigs.bandId, feed.bandId), gte(gigs.startsAt, new Date(Date.now() - 365 * 86_400_000))))
      .orderBy(asc(gigs.startsAt));

    const body = buildIcs(
      `${feed.bandName} gigs`,
      rows.map(({ gig: g, tourName, setlistName, pressKitName, riderName }) => ({
        uid: `${g.id}@gigboy`,
        title: g.title,
        startsAt: g.startsAt,
        endsAt: g.endsAt && g.endsAt > g.startsAt ? g.endsAt : null, // never emit DTEND before DTSTART
        location: [g.venue, g.address].filter(Boolean).join(', ') || null,
        description: buildDescription(g, { tour: tourName, setlist: setlistName, pressKit: pressKitName, rider: riderName }),
        status: g.status as 'confirmed' | 'tentative' | 'cancelled',
        updatedAt: g.updatedAt,
      })),
    );

    res.set('Content-Type', 'text/calendar; charset=utf-8');
    // Private data: keep shared caches and proxies from storing it.
    res.set('Cache-Control', 'private, max-age=900');
    res.send(body);
  } catch (err) {
    console.error('Failed to serve calendar feed:', err);
    res.status(500).send('Something went wrong.');
  }
});
