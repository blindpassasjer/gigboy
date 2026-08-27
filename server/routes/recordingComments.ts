import { Router } from 'express';
import type { Request, Response } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { recordingComments, songRecordings, users } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandMember } from '../middleware/bandAccess.js';
import { loadBandSongScope } from '../lib/songScope.js';

type CommentRow = typeof recordingComments.$inferSelect;

function toApi(row: CommentRow) {
  return {
    id: row.id,
    recordingId: row.recordingId,
    authorUserId: row.authorUserId,
    authorDisplayName: row.authorDisplayName,
    authorAvatar: row.authorAvatar,
    atMs: row.atMs,
    body: row.body,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  };
}

function parseAtMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

async function loadScopedRecording(req: Request, res: Response) {
  const scope = await loadBandSongScope(req, res);
  if (!scope) return null;
  const [recording] = await db
    .select()
    .from(songRecordings)
    .where(and(eq(songRecordings.id, req.params.recordingId), eq(songRecordings.songId, scope.song.id)))
    .limit(1);
  if (!recording) {
    res.status(404).json({ error: 'Recording not found.' });
    return null;
  }
  return { scope, recording };
}

export const recordingCommentsRouter = Router({ mergeParams: true });
recordingCommentsRouter.use(requireAuth, requireBandMember);

recordingCommentsRouter.get('/', async (req, res) => {
  try {
    const loaded = await loadScopedRecording(req, res);
    if (!loaded) return;
    const rows = await db
      .select()
      .from(recordingComments)
      .where(eq(recordingComments.recordingId, loaded.recording.id))
      .orderBy(asc(recordingComments.createdAt));
    res.json({ comments: rows.map(toApi) });
  } catch (err) {
    console.error('Failed to list recording comments:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

recordingCommentsRouter.post('/', async (req, res) => {
  try {
    const loaded = await loadScopedRecording(req, res);
    if (!loaded) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text) {
      res.status(400).json({ error: 'Comment text is required.' });
      return;
    }
    if (text.length > 2000) {
      res.status(400).json({ error: 'Comment is too long.' });
      return;
    }

    const [author] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    const [row] = await db
      .insert(recordingComments)
      .values({
        id: crypto.randomUUID(),
        recordingId: loaded.recording.id,
        songId: loaded.scope.song.id,
        bandId: loaded.scope.bandId,
        authorUserId: req.userId!,
        authorDisplayName: author?.fullName || author?.username || null,
        authorAvatar: author?.avatar ?? null,
        atMs: parseAtMs(body.atMs),
        body: text,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    res.json({ comment: toApi(row) });
  } catch (err) {
    console.error('Failed to add recording comment:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

async function loadOwnComment(req: Request, res: Response, canManageOthers: boolean) {
  const [row] = await db
    .select()
    .from(recordingComments)
    .where(and(eq(recordingComments.id, req.params.id), eq(recordingComments.recordingId, req.params.recordingId)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: 'Comment not found.' });
    return null;
  }
  if (row.authorUserId !== req.userId && !canManageOthers) {
    res.status(403).json({ error: 'You can only edit your own comments.' });
    return null;
  }
  return row;
}

recordingCommentsRouter.patch('/:id', async (req, res) => {
  try {
    const loaded = await loadScopedRecording(req, res);
    if (!loaded) return;
    const existing = await loadOwnComment(req, res, loaded.scope.canManageOthers);
    if (!existing) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof body.body === 'string' ? body.body.trim() : existing.body;
    if (!text) {
      res.status(400).json({ error: 'Comment text is required.' });
      return;
    }
    const [row] = await db
      .update(recordingComments)
      .set({
        body: text,
        atMs: 'atMs' in body ? parseAtMs(body.atMs) : existing.atMs,
        updatedAt: new Date(),
      })
      .where(eq(recordingComments.id, existing.id))
      .returning();
    res.json({ comment: toApi(row) });
  } catch (err) {
    console.error('Failed to update recording comment:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

recordingCommentsRouter.delete('/:id', async (req, res) => {
  try {
    const loaded = await loadScopedRecording(req, res);
    if (!loaded) return;
    const existing = await loadOwnComment(req, res, loaded.scope.canManageOthers);
    if (!existing) return;
    await db.delete(recordingComments).where(eq(recordingComments.id, existing.id));
    res.json({});
  } catch (err) {
    console.error('Failed to delete recording comment:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
