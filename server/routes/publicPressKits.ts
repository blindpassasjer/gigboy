import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bands, pressKitImages, pressKitShares, pressKits } from '../db/schema.js';
import { pressKitImageToApi } from '../lib/pressKitImages.js';
import { pressKitToApi } from './bandPressKits.js';

export const publicPressKitsRouter = Router({ mergeParams: true });

publicPressKitsRouter.get('/press-kits/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const shareRows = await db
      .select()
      .from(pressKitShares)
      .where(and(eq(pressKitShares.token, token), eq(pressKitShares.status, 'active')))
      .limit(1);
    const share = shareRows[0];
    if (!share) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }

    const kitRows = await db
      .select({ kit: pressKits, bandName: bands.name, bandLogo: bands.logo })
      .from(pressKits)
      .innerJoin(bands, eq(pressKits.bandId, bands.id))
      .where(eq(pressKits.id, share.kitId))
      .limit(1);
    const row = kitRows[0];
    if (!row) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }

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

    res.json({
      kit: pressKitToApi(row.kit),
      bandName: row.bandName,
      bandLogo: row.bandLogo,
      images,
    });
  } catch (err) {
    console.error('Failed to load public press kit:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
