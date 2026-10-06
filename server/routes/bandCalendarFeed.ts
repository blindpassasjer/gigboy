import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { calendarFeeds } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandMember } from '../middleware/bandAccess.js';

type FeedRow = typeof calendarFeeds.$inferSelect;

// Path only, no origin: the client prefixes the domain the app is actually being served from, so the
// link is right behind any proxy/domain without relying on PUBLIC_ORIGIN or the (spoofable) Host header.
function feedToApi(row: FeedRow) {
  return { token: row.token, feedPath: `/api/public/calendar/${row.token}.ics` };
}

async function findActiveFeed(bandId: string, userId: string): Promise<FeedRow | null> {
  const rows = await db
    .select()
    .from(calendarFeeds)
    .where(
      and(eq(calendarFeeds.bandId, bandId), eq(calendarFeeds.userId, userId), eq(calendarFeeds.status, 'active')),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function createFeed(bandId: string, userId: string): Promise<FeedRow> {
  const [row] = await db
    .insert(calendarFeeds)
    .values({ token: crypto.randomUUID(), bandId, status: 'active', userId })
    .onConflictDoNothing()
    .returning();
  // Conflict means a concurrent request just created the member's feed — use that one.
  return row ?? (await findActiveFeed(bandId, userId))!;
}

export const bandCalendarFeedRouter = Router({ mergeParams: true });
bandCalendarFeedRouter.use(requireAuth);

bandCalendarFeedRouter.get('/', requireBandMember, async (req, res) => {
  try {
    const feed = await findActiveFeed(req.params.bandId, req.userId!);
    res.json({ feed: feed ? feedToApi(feed) : null });
  } catch (err) {
    console.error('Failed to load calendar feed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Any member (viewers included) manages their own feed; it is read-only.
// Idempotent: returns the existing active feed if there is one.
bandCalendarFeedRouter.post('/', requireBandMember, async (req, res) => {
  try {
    const feed = (await findActiveFeed(req.params.bandId, req.userId!)) ?? (await createFeed(req.params.bandId, req.userId!));
    res.json({ feed: feedToApi(feed) });
  } catch (err) {
    console.error('Failed to create calendar feed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Revokes the current URL and issues a new one — for when the link has leaked.
bandCalendarFeedRouter.post('/regenerate', requireBandMember, async (req, res) => {
  try {
    const feed = await db.transaction(async (tx) => {
      await tx
        .update(calendarFeeds)
        .set({ status: 'revoked' })
        .where(
          and(
            eq(calendarFeeds.bandId, req.params.bandId),
            eq(calendarFeeds.userId, req.userId!),
            eq(calendarFeeds.status, 'active'),
          ),
        );
      const [row] = await tx
        .insert(calendarFeeds)
        .values({ token: crypto.randomUUID(), bandId: req.params.bandId, status: 'active', userId: req.userId! })
        .returning();
      return row;
    });
    res.json({ feed: feedToApi(feed) });
  } catch (err) {
    console.error('Failed to regenerate calendar feed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandCalendarFeedRouter.post('/disable', requireBandMember, async (req, res) => {
  try {
    await db
      .update(calendarFeeds)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(calendarFeeds.bandId, req.params.bandId),
          eq(calendarFeeds.userId, req.userId!),
          eq(calendarFeeds.status, 'active'),
        ),
      );
    res.json({});
  } catch (err) {
    console.error('Failed to disable calendar feed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
