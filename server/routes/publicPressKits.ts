import { Router } from 'express';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bands, gigs, pressKitImages, pressKitShares, pressKits, tours } from '../db/schema.js';
import { pressKitImageToApi } from '../lib/pressKitImages.js';
import { pressKitToApi } from './bandPressKits.js';
import { publicBandLogoUrl } from './publicAssets.js';

/** The only gig fields that ever leave the server on a public page — no contact, schedule, notes or attachments. */
export interface PublicTourDate {
  id: string;
  title: string;
  startsAt: string;
  timezone: string | null;
  venue: string | null;
  address: string | null;
  tourId: string | null;
  tourName: string | null;
}

export interface PublicPressKitData {
  kit: ReturnType<typeof pressKitToApi>;
  bandName: string;
  bandLogo: string | null;
  images: ReturnType<typeof pressKitImageToApi>[];
  tourDates: PublicTourDate[];
}

/**
 * Shared data-fetch for a public press kit by share token — used both by the JSON API route below
 * and, in-process (no HTTP loopback), by the OG-tag SSR middleware in index.ts. Returns null if the
 * token doesn't resolve to an active share.
 */
export async function getPublicPressKitData(token: string): Promise<PublicPressKitData | null> {
  const shareRows = await db
    .select()
    .from(pressKitShares)
    .where(and(eq(pressKitShares.token, token), eq(pressKitShares.status, 'active')))
    .limit(1);
  const share = shareRows[0];
  if (!share) return null;

  const kitRows = await db
    .select({ kit: pressKits, bandName: bands.name, bandLogo: bands.logo })
    .from(pressKits)
    .innerJoin(bands, eq(pressKits.bandId, bands.id))
    .where(eq(pressKits.id, share.kitId))
    .limit(1);
  const row = kitRows[0];
  if (!row) return null;

  const imageIds = Array.isArray(row.kit.imageIds) ? row.kit.imageIds : [];
  // Token-scoped public route (publicAssets.ts) — the /api/bands/... image router is auth-gated.
  const downloadUrlBase = `/api/public/press-kits/${token}/images`;
  let images: ReturnType<typeof pressKitImageToApi>[] = [];
  if (imageIds.length > 0) {
    const imageRows = await db
      .select()
      .from(pressKitImages)
      .where(and(eq(pressKitImages.bandId, row.kit.bandId), inArray(pressKitImages.id, imageIds)));
    const byId = new Map(imageRows.map((imgRow) => [imgRow.id, imgRow]));
    images = imageIds
      .map((id) => byId.get(id))
      .filter((imgRow): imgRow is (typeof imageRows)[number] => Boolean(imgRow))
      .map((imgRow) => pressKitImageToApi(imgRow, downloadUrlBase));
  }

  const gigIds = Array.isArray(row.kit.gigIds) ? row.kit.gigIds : [];
  let tourDates: PublicTourDate[] = [];
  if (gigIds.length > 0) {
    // Only gigs picked on the kit, and of those only confirmed, upcoming ones — filtered here so nothing
    // private is ever serialized.
    const dateRows = await db
      .select({
        id: gigs.id,
        title: gigs.title,
        startsAt: gigs.startsAt,
        timezone: gigs.timezone,
        venue: gigs.venue,
        address: gigs.address,
        tourId: gigs.tourId,
        tourName: tours.name,
      })
      .from(gigs)
      .leftJoin(tours, eq(gigs.tourId, tours.id))
      .where(
        and(
          eq(gigs.bandId, row.kit.bandId),
          inArray(gigs.id, gigIds),
          eq(gigs.status, 'confirmed'),
          gte(gigs.startsAt, new Date()),
        ),
      )
      .orderBy(asc(gigs.startsAt));
    tourDates = dateRows.map((d) => ({ ...d, startsAt: d.startsAt.toISOString() }));
  }

  return {
    kit: pressKitToApi(row.kit),
    bandName: row.bandName,
    bandLogo: publicBandLogoUrl(row.kit.bandId, row.bandLogo),
    images,
    tourDates,
  };
}

export const publicPressKitsRouter = Router({ mergeParams: true });

publicPressKitsRouter.get('/press-kits/:token', async (req, res) => {
  try {
    const data = await getPublicPressKitData(req.params.token);
    if (!data) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    res.json(data);
  } catch (err) {
    console.error('Failed to load public press kit:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
