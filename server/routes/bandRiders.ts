import { Router } from 'express';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bandRiders } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandEditor, requireBandMember } from '../middleware/bandAccess.js';
import { removeNullish } from '../lib/serialize.js';
import { insertTrashItem } from '../lib/trash.js';

type RiderRow = typeof bandRiders.$inferSelect;

export function toApi(row: RiderRow) {
  return removeNullish({
    id: row.id,
    name: row.name,
    icon: row.icon,
    hospitalityNotes: row.hospitalityNotes,
    logisticsNotes: row.logisticsNotes,
    items: row.items,
    drawingLayers: row.drawingLayers,
    publicShareEnabled: row.publicShareEnabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  });
}

export const bandRidersRouter = Router({ mergeParams: true });
bandRidersRouter.use(requireAuth);

bandRidersRouter.get('/', requireBandMember, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(bandRiders)
      .where(eq(bandRiders.bandId, req.params.bandId))
      .orderBy(bandRiders.sortOrder);
    res.json({ riders: rows.map(toApi) });
  } catch (err) {
    console.error('Failed to list band riders:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandRidersRouter.post('/', requireBandEditor, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name : '';
    const bandId = req.params.bandId;

    const [{ value: riderCount }] = await db
      .select({ value: count() })
      .from(bandRiders)
      .where(eq(bandRiders.bandId, bandId));

    const id = crypto.randomUUID();
    const [row] = await db
      .insert(bandRiders)
      .values({
        id,
        bandId,
        name,
        items: [],
        drawingLayers: [],
        publicShareEnabled: false,
        sortOrder: riderCount,
      })
      .returning();

    res.json({ rider: toApi(row) });
  } catch (err) {
    console.error('Failed to create band rider:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandRidersRouter.put('/:id', requireBandEditor, async (req, res) => {
  try {
    const bandId = req.params.bandId;
    const id = req.params.id;
    const existing = await db
      .select()
      .from(bandRiders)
      .where(and(eq(bandRiders.id, id), eq(bandRiders.bandId, bandId)))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: 'Rider not found.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates: Partial<typeof bandRiders.$inferInsert> = {};
    if (typeof body.name === 'string') updates.name = body.name;
    if ('icon' in body) updates.icon = (body.icon as string | null) ?? null;
    if ('hospitalityNotes' in body) updates.hospitalityNotes = (body.hospitalityNotes as string | null) ?? null;
    if ('logisticsNotes' in body) updates.logisticsNotes = (body.logisticsNotes as string | null) ?? null;
    if (Array.isArray(body.items)) updates.items = body.items as unknown[];
    if (Array.isArray(body.drawingLayers)) updates.drawingLayers = body.drawingLayers as unknown[];
    if (typeof body.publicShareEnabled === 'boolean') updates.publicShareEnabled = body.publicShareEnabled;
    if (typeof body.sortOrder === 'number') updates.sortOrder = body.sortOrder;
    updates.updatedAt = new Date();

    const [row] = await db
      .update(bandRiders)
      .set(updates)
      .where(eq(bandRiders.id, id))
      .returning();

    res.json({ rider: toApi(row) });
  } catch (err) {
    console.error('Failed to update band rider:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandRidersRouter.delete('/:id', requireBandEditor, async (req, res) => {
  try {
    const bandId = req.params.bandId;
    const id = req.params.id;
    const existing = await db
      .select()
      .from(bandRiders)
      .where(and(eq(bandRiders.id, id), eq(bandRiders.bandId, bandId)))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: 'Rider not found.' });
      return;
    }
    await insertTrashItem({ bandId }, 'technicalRider', toApi(existing[0]));
    await db.delete(bandRiders).where(eq(bandRiders.id, id));
    res.json({});
  } catch (err) {
    console.error('Failed to delete band rider:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
