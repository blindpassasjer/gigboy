import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { trashItems } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import {
  permanentlyDeleteTrashRow,
  restoreTrashRow,
  sweepExpiredPersonalTrash,
  trashRowToListItem,
} from '../lib/trash.js';

export const trashRouter = Router();
trashRouter.use(requireAuth);

trashRouter.get('/', async (req, res) => {
  try {
    await sweepExpiredPersonalTrash(req.userId!);
    const rows = await db
      .select()
      .from(trashItems)
      .where(eq(trashItems.userId, req.userId!))
      .orderBy(desc(trashItems.deletedAt));
    res.json({ items: rows.map(trashRowToListItem) });
  } catch (err) {
    console.error('Failed to list trash:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

trashRouter.post('/:id/restore', async (req, res) => {
  try {
    const existing = await db
      .select()
      .from(trashItems)
      .where(and(eq(trashItems.id, req.params.id), eq(trashItems.userId, req.userId!)))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: 'Trash item not found.' });
      return;
    }
    const result = await restoreTrashRow(existing[0]);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    await db.delete(trashItems).where(eq(trashItems.id, req.params.id));
    res.json({});
  } catch (err) {
    console.error('Failed to restore trash item:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

trashRouter.delete('/:id', async (req, res) => {
  try {
    const existing = await db
      .select()
      .from(trashItems)
      .where(and(eq(trashItems.id, req.params.id), eq(trashItems.userId, req.userId!)))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: 'Trash item not found.' });
      return;
    }
    await permanentlyDeleteTrashRow(existing[0]);
    res.json({});
  } catch (err) {
    console.error('Failed to permanently delete trash item:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

trashRouter.delete('/', async (req, res) => {
  try {
    const rows = await db.select().from(trashItems).where(eq(trashItems.userId, req.userId!));
    for (const row of rows) {
      await permanentlyDeleteTrashRow(row);
    }
    res.json({});
  } catch (err) {
    console.error('Failed to empty trash:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
