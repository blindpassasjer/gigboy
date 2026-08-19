import { Router } from 'express';
import { eq, or, sql } from 'drizzle-orm';
import type { PgTableWithColumns, PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db/client.js';
import { requireAuth } from '../middleware/session.js';
import { insertTrashItem, type TrashItemType } from '../lib/trash.js';

interface CrudConfig<Row extends Record<string, unknown>, Api> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTableWithColumns<any>;
  idColumn: PgColumn;
  userIdColumn: PgColumn;
  resourceKey: string;
  pluralKey: string;
  /** Trash item type recorded when a row is soft-deleted (see Phase 5 trash_items). */
  itemType: TrashItemType;
  toApi: (row: Row) => Api;
  fromBody: (body: Record<string, unknown>, id: string, userId: string) => Record<string, unknown>;
  /**
   * When set, `GET /` also returns rows this jsonb array column contains the caller's id in —
   * i.e. resources personally shared with them via an accepted collaboration invite (Phase 2's
   * collaboration_invites), not just rows they own. See collaborationInvites.ts.
   */
  collaboratorIdsColumn?: PgColumn;
}

/** Builds a standard auth-scoped CRUD router (list/upsert/update/delete), owner-checked on write. */
export function buildCrudRouter<Row extends { userId: string | null }, Api>(config: CrudConfig<Row, Api>) {
  const { table, idColumn, userIdColumn, resourceKey, pluralKey, itemType, toApi, fromBody, collaboratorIdsColumn } =
    config;
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    try {
      const ownedCond = eq(userIdColumn, req.userId!);
      const whereCond = collaboratorIdsColumn
        ? or(ownedCond, sql`${collaboratorIdsColumn} @> ${JSON.stringify([req.userId])}::jsonb`)
        : ownedCond;
      const rows = (await db.select().from(table).where(whereCond)) as Row[];
      res.json({ [pluralKey]: rows.map(toApi) });
    } catch (err) {
      console.error(`Failed to list ${pluralKey}:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const id = typeof body.id === 'string' && body.id ? body.id : null;
      if (!id) {
        res.status(400).json({ error: 'id is required.' });
        return;
      }
      const values = fromBody(body, id, req.userId!);
      const [row] = (await db
        .insert(table)
        .values(values)
        .onConflictDoUpdate({ target: idColumn, set: values })
        .returning()) as Row[];
      res.json({ [resourceKey]: toApi(row) });
    } catch (err) {
      console.error(`Failed to save ${resourceKey}:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const existing = (await db.select().from(table).where(eq(idColumn, req.params.id)).limit(1)) as Row[];
      const row0 = existing[0] as (Row & Record<string, unknown>) | undefined;
      const isOwner = row0?.userId === req.userId;
      const isCollaboratorEditor =
        !isOwner &&
        row0 &&
        Array.isArray(row0.collaboratorIds) &&
        (row0.collaboratorIds as string[]).includes(req.userId!) &&
        (row0.collaborationPermissions as Record<string, string> | null)?.[req.userId!] === 'editor';
      if (!row0 || (!isOwner && !isCollaboratorEditor)) {
        res.status(404).json({ error: `${resourceKey} not found.` });
        return;
      }
      // Pass the resource's actual owner id (not the caller's) so a collaborator-editor update
      // can't reassign ownership to themselves.
      const values = fromBody((req.body ?? {}) as Record<string, unknown>, req.params.id, row0.userId as string);
      const [row] = (await db
        .update(table)
        .set(values)
        .where(eq(idColumn, req.params.id))
        .returning()) as Row[];
      res.json({ [resourceKey]: toApi(row) });
    } catch (err) {
      console.error(`Failed to update ${resourceKey}:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const existing = (await db.select().from(table).where(eq(idColumn, req.params.id)).limit(1)) as Row[];
      if (!existing[0] || existing[0].userId !== req.userId) {
        res.status(404).json({ error: `${resourceKey} not found.` });
        return;
      }
      await insertTrashItem({ userId: req.userId! }, itemType, toApi(existing[0]));
      await db.delete(table).where(eq(idColumn, req.params.id));
      res.json({});
    } catch (err) {
      console.error(`Failed to delete ${resourceKey}:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  return router;
}
