import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bandRiders, bands } from '../db/schema.js';
import { removeNullish } from '../lib/serialize.js';
import { publicBandLogoUrl } from './publicAssets.js';

export const publicRidersRouter = Router({ mergeParams: true });

publicRidersRouter.get('/bands/:bandId/riders/:id', async (req, res) => {
  try {
    const { bandId, id } = req.params;
    const rows = await db
      .select({ rider: bandRiders, bandName: bands.name, bandLogo: bands.logo })
      .from(bandRiders)
      .innerJoin(bands, eq(bandRiders.bandId, bands.id))
      .where(and(eq(bandRiders.id, id), eq(bandRiders.bandId, bandId)))
      .limit(1);

    const row = rows[0];
    if (!row || !row.rider.publicShareEnabled) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }

    const rider = removeNullish({
      id: row.rider.id,
      name: row.rider.name,
      icon: row.rider.icon,
      hospitalityNotes: row.rider.hospitalityNotes,
      logisticsNotes: row.rider.logisticsNotes,
      items: row.rider.items,
      drawingLayers: row.rider.drawingLayers,
      publicShareEnabled: row.rider.publicShareEnabled,
      sortOrder: row.rider.sortOrder,
      createdAt: row.rider.createdAt?.toISOString(),
      updatedAt: row.rider.updatedAt?.toISOString(),
    });

    res.json({ rider, bandName: row.bandName, bandLogo: publicBandLogoUrl(bandId, row.bandLogo) });
  } catch (err) {
    console.error('Failed to load public rider:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
