import { Router } from 'express';
import type { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { songMemberPrefs, songs } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandMember } from '../middleware/bandAccess.js';
import { loadBandSongScope, type ResolvedSongScope } from '../lib/songScope.js';

const MAX_TRANSPOSE = 11;

function parseTranspose(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(-MAX_TRANSPOSE, Math.min(MAX_TRANSPOSE, Math.round(n)));
}

/** Per-user transpose override for one song, mounted at
 * `/api/bands/:bandId/songs/:songId/transpose`. */
function buildSongTransposeRouter(loadScope: (req: Request, res: Response) => Promise<ResolvedSongScope | null>) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    try {
      const scope = await loadScope(req, res);
      if (!scope) return;
      const rows = await db
        .select({ transpose: songMemberPrefs.transpose })
        .from(songMemberPrefs)
        .where(and(eq(songMemberPrefs.songId, scope.song.id), eq(songMemberPrefs.userId, req.userId!)))
        .limit(1);
      res.json({ pref: rows[0] ? { transpose: rows[0].transpose } : null });
    } catch (err) {
      console.error('Failed to load song transpose pref:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.put('/', async (req, res) => {
    try {
      const scope = await loadScope(req, res);
      if (!scope) return;
      const transpose = parseTranspose((req.body ?? {}).transpose);
      if (transpose === null) {
        res.status(400).json({ error: 'transpose must be a number.' });
        return;
      }
      await db
        .insert(songMemberPrefs)
        .values({
          songId: scope.song.id,
          userId: req.userId!,
          bandId: scope.bandId,
          transpose,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [songMemberPrefs.songId, songMemberPrefs.userId],
          set: { transpose, updatedAt: new Date() },
        });
      res.json({ pref: { transpose } });
    } catch (err) {
      console.error('Failed to save song transpose pref:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.delete('/', async (req, res) => {
    try {
      const scope = await loadScope(req, res);
      if (!scope) return;
      await db
        .delete(songMemberPrefs)
        .where(and(eq(songMemberPrefs.songId, scope.song.id), eq(songMemberPrefs.userId, req.userId!)));
      res.json({});
    } catch (err) {
      console.error('Failed to clear song transpose pref:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  return router;
}

export const bandSongTransposeRouter = Router({ mergeParams: true });
bandSongTransposeRouter.use(requireAuth, requireBandMember);
bandSongTransposeRouter.use(buildSongTransposeRouter(loadBandSongScope));

/**
 * Batch read of the current user's transpose overrides across a whole band, so the library
 * and Concert Mode can preload every personal offset in one call. Mounted at
 * `/api/bands/:bandId/song-prefs`.
 */
export const bandSongPrefsRouter = Router({ mergeParams: true });
bandSongPrefsRouter.use(requireAuth, requireBandMember);
bandSongPrefsRouter.get('/', async (req, res) => {
  try {
    const rows = await db
      .select({ songId: songMemberPrefs.songId, transpose: songMemberPrefs.transpose })
      .from(songMemberPrefs)
      .innerJoin(songs, eq(songs.id, songMemberPrefs.songId))
      .where(and(
        eq(songMemberPrefs.userId, req.userId!),
        eq(songs.bandId, (req.params as { bandId: string }).bandId),
      ));

    const prefs: Record<string, number> = {};
    for (const row of rows) prefs[row.songId] = row.transpose;
    res.json({ prefs });
  } catch (err) {
    console.error('Failed to load band transpose prefs:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
