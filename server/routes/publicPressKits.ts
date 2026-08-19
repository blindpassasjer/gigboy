import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bands, pressKitImages, pressKitShares, pressKits } from '../db/schema.js';
import { pressKitImageToApi } from '../lib/pressKitImages.js';
import { pressKitToApi } from './bandPressKits.js';

export interface PublicPressKitData {
  kit: ReturnType<typeof pressKitToApi>;
  bandName: string;
  bandLogo: string | null;
  images: ReturnType<typeof pressKitImageToApi>[];
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
  const downloadUrlBase = `/api/bands/${row.kit.bandId}/press-kit-images`;
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

  return {
    kit: pressKitToApi(row.kit),
    bandName: row.bandName,
    bandLogo: row.bandLogo,
    images,
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
