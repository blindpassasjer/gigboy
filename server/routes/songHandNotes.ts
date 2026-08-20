import { Router } from 'express';
import type { Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { handNotes } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandMember } from '../middleware/bandAccess.js';
import { handNoteToApi } from '../lib/handNotes.js';
import { loadBandSongScope, type ResolvedSongScope } from '../lib/songScope.js';

/** Shared GET/PUT/DELETE handlers, mounted below for the band-scoped song path. */
function buildHandNotesRouter(loadScope: (req: Request, res: Response) => Promise<ResolvedSongScope | null>) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    try {
      const scope = await loadScope(req, res);
      if (!scope) return;
      const rows = await db
        .select()
        .from(handNotes)
        .where(eq(handNotes.songId, scope.song.id))
        .orderBy(desc(handNotes.updatedAt));
      res.json({ notes: rows.map(handNoteToApi) });
    } catch (err) {
      console.error('Failed to list song hand notes:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.put('/me', async (req, res) => {
    try {
      const scope = await loadScope(req, res);
      if (!scope) return;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const strokes = Array.isArray(body.strokes) ? body.strokes : [];
      const textNotes = Array.isArray(body.textNotes) ? body.textNotes : undefined;

      const [row] = await db
        .insert(handNotes)
        .values({
          id: crypto.randomUUID(),
          songId: scope.song.id,
          bandId: scope.bandId,
          authorUserId: req.userId!,
          authorName: typeof body.authorName === 'string' ? body.authorName : null,
          authorAvatar: typeof body.authorAvatar === 'string' ? body.authorAvatar : null,
          strokes,
          textNotes: textNotes ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [handNotes.songId, handNotes.authorUserId],
          set: {
            authorName: typeof body.authorName === 'string' ? body.authorName : null,
            authorAvatar: typeof body.authorAvatar === 'string' ? body.authorAvatar : null,
            strokes,
            textNotes: textNotes ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();

      res.json({ note: handNoteToApi(row) });
    } catch (err) {
      console.error('Failed to save song hand note:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.delete('/me', async (req, res) => {
    try {
      const scope = await loadScope(req, res);
      if (!scope) return;
      await db
        .delete(handNotes)
        .where(and(eq(handNotes.songId, scope.song.id), eq(handNotes.authorUserId, req.userId!)));
      res.json({});
    } catch (err) {
      console.error('Failed to delete song hand note:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  /** Lets a song/band owner-or-editor clear another author's note (used by the "remove author" UI). */
  router.delete('/:authorUserId', async (req, res) => {
    try {
      const scope = await loadScope(req, res);
      if (!scope) return;
      const targetAuthorId = req.params.authorUserId;
      if (targetAuthorId !== req.userId && !scope.canManageOthers) {
        res.status(403).json({ error: 'You do not have permission to remove this note.' });
        return;
      }
      await db
        .delete(handNotes)
        .where(and(eq(handNotes.songId, scope.song.id), eq(handNotes.authorUserId, targetAuthorId)));
      res.json({});
    } catch (err) {
      console.error('Failed to delete song hand note:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  return router;
}

export const bandSongHandNotesRouter = Router({ mergeParams: true });
bandSongHandNotesRouter.use(requireAuth, requireBandMember);
bandSongHandNotesRouter.use(buildHandNotesRouter(loadBandSongScope));
