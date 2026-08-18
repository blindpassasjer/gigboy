import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pressKits } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandEditor, requireBandMember } from '../middleware/bandAccess.js';
import { removeNullish } from '../lib/serialize.js';
import { insertTrashItem } from '../lib/trash.js';

type PressKitRow = typeof pressKits.$inferSelect;

export function pressKitToApi(row: PressKitRow) {
  return removeNullish({
    id: row.id,
    name: row.name,
    icon: row.icon,
    richText: row.richText,
    imageIds: row.imageIds,
    videoUrls: row.videoUrls,
    selectedVideoUrls: row.selectedVideoUrls,
    presaveReleaseName: row.presaveReleaseName,
    presaveReleaseDate: row.presaveReleaseDate,
    presaveUrls: row.presaveUrls,
    selectedPresaveUrls: row.selectedPresaveUrls,
    createdAt: row.createdAt?.toISOString(),
  });
}

/** Loads a press kit scoped to :bandId, 404ing if missing. Shared with bandPressKitShares.ts. */
export async function loadBandPressKit(bandId: string, id: string): Promise<PressKitRow | null> {
  const rows = await db
    .select()
    .from(pressKits)
    .where(and(eq(pressKits.id, id), eq(pressKits.bandId, bandId)))
    .limit(1);
  return rows[0] ?? null;
}

export const bandPressKitsRouter = Router({ mergeParams: true });
bandPressKitsRouter.use(requireAuth);

bandPressKitsRouter.get('/', requireBandMember, async (req, res) => {
  try {
    const rows = await db.select().from(pressKits).where(eq(pressKits.bandId, req.params.bandId));
    res.json({ pressKits: rows.map(pressKitToApi) });
  } catch (err) {
    console.error('Failed to list band press kits:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandPressKitsRouter.post('/', requireBandEditor, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name : '';
    const bandId = req.params.bandId;

    const [row] = await db
      .insert(pressKits)
      .values({
        id: crypto.randomUUID(),
        bandId,
        name,
        richText: '',
        imageIds: [],
        videoUrls: [],
        selectedVideoUrls: [],
        presaveUrls: [],
        selectedPresaveUrls: [],
        createdBy: req.userId!,
      })
      .returning();

    res.json({ pressKit: pressKitToApi(row) });
  } catch (err) {
    console.error('Failed to create band press kit:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandPressKitsRouter.put('/:id', requireBandEditor, async (req, res) => {
  try {
    const existing = await loadBandPressKit(req.params.bandId, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Press kit not found.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates: Partial<typeof pressKits.$inferInsert> = {};
    if (typeof body.name === 'string') updates.name = body.name;
    if ('icon' in body) updates.icon = (body.icon as string | null) ?? null;
    if (typeof body.richText === 'string') updates.richText = body.richText;
    if (Array.isArray(body.imageIds)) updates.imageIds = body.imageIds as string[];
    if (Array.isArray(body.videoUrls)) updates.videoUrls = body.videoUrls as string[];
    if (Array.isArray(body.selectedVideoUrls)) updates.selectedVideoUrls = body.selectedVideoUrls as string[];
    if ('presaveReleaseName' in body) updates.presaveReleaseName = (body.presaveReleaseName as string | null) ?? null;
    if ('presaveReleaseDate' in body) updates.presaveReleaseDate = (body.presaveReleaseDate as string | null) ?? null;
    if (Array.isArray(body.presaveUrls)) updates.presaveUrls = body.presaveUrls as string[];
    if (Array.isArray(body.selectedPresaveUrls)) updates.selectedPresaveUrls = body.selectedPresaveUrls as string[];

    const [row] = await db
      .update(pressKits)
      .set(updates)
      .where(eq(pressKits.id, req.params.id))
      .returning();

    res.json({ pressKit: pressKitToApi(row) });
  } catch (err) {
    console.error('Failed to update band press kit:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandPressKitsRouter.delete('/:id', requireBandEditor, async (req, res) => {
  try {
    const bandId = req.params.bandId;
    const existing = await loadBandPressKit(bandId, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Press kit not found.' });
      return;
    }
    await insertTrashItem({ bandId }, 'pressKit', pressKitToApi(existing));
    await db.delete(pressKits).where(eq(pressKits.id, req.params.id));
    res.json({});
  } catch (err) {
    console.error('Failed to delete band press kit:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
