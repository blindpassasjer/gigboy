import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import type { PgTableWithColumns, PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db/client.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandEditor, requireBandMember } from '../middleware/bandAccess.js';
import { insertTrashItem, type TrashItemType } from '../lib/trash.js';

interface BandCrudConfig<Row extends Record<string, unknown>, Api> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTableWithColumns<any>;
  idColumn: PgColumn;
  bandIdColumn: PgColumn;
  resourceKey: string;
  pluralKey: string;
  /** Trash item type recorded when a row is soft-deleted (see Phase 5 trash_items). */
  itemType: TrashItemType;
  toApi: (row: Row) => Api;
  fromBody: (body: Record<string, unknown>, id: string, bandId: string) => Record<string, unknown>;
}

/**
 * Builds a band-scoped CRUD router (list/create/update/delete) mounted at
 * `/api/bands/:bandId/<resource>`. Structurally mirrors `buildCrudRouter` in `crud.ts`
 * but checks band membership/editor role instead of personal ownership.
 */
export function buildBandCrudRouter<Row extends { bandId: string | null }, Api>(
  config: BandCrudConfig<Row, Api>,
) {
  const { table, idColumn, bandIdColumn, resourceKey, pluralKey, itemType, toApi, fromBody } = config;
  const router = Router({ mergeParams: true });
  router.use(requireAuth);

  router.get('/', requireBandMember, async (req, res) => {
    try {
      const rows = (await db
        .select()
        .from(table)
        .where(eq(bandIdColumn, req.params.bandId))) as Row[];
      res.json({ [pluralKey]: rows.map(toApi) });
    } catch (err) {
      console.error(`Failed to list band ${pluralKey}:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.post('/', requireBandEditor, async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const id = typeof body.id === 'string' && body.id ? body.id : null;
      if (!id) {
        res.status(400).json({ error: 'id is required.' });
        return;
      }
      const values = fromBody(body, id, req.params.bandId);
      const [row] = (await db
        .insert(table)
        .values(values)
        .onConflictDoUpdate({ target: idColumn, set: values })
        .returning()) as Row[];
      res.json({ [resourceKey]: toApi(row) });
    } catch (err) {
      console.error(`Failed to save band ${resourceKey}:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.put('/:id', requireBandEditor, async (req, res) => {
    try {
      const existing = (await db
        .select()
        .from(table)
        .where(and(eq(idColumn, req.params.id), eq(bandIdColumn, req.params.bandId)))
        .limit(1)) as Row[];
      if (!existing[0]) {
        res.status(404).json({ error: `${resourceKey} not found.` });
        return;
      }
      const values = fromBody((req.body ?? {}) as Record<string, unknown>, req.params.id, req.params.bandId);
      const [row] = (await db
        .update(table)
        .set(values)
        .where(eq(idColumn, req.params.id))
        .returning()) as Row[];
      res.json({ [resourceKey]: toApi(row) });
    } catch (err) {
      console.error(`Failed to update band ${resourceKey}:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.delete('/:id', requireBandEditor, async (req, res) => {
    try {
      const existing = (await db
        .select()
        .from(table)
        .where(and(eq(idColumn, req.params.id), eq(bandIdColumn, req.params.bandId)))
        .limit(1)) as Row[];
      if (!existing[0]) {
        res.status(404).json({ error: `${resourceKey} not found.` });
        return;
      }
      await insertTrashItem({ bandId: req.params.bandId }, itemType, toApi(existing[0]));
      await db.delete(table).where(eq(idColumn, req.params.id));
      res.json({});
    } catch (err) {
      console.error(`Failed to delete band ${resourceKey}:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  return router;
}
