import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { songRevisions, songs } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandMember, requireBandEditor } from '../middleware/bandAccess.js';
import { loadBandSongScope } from '../lib/songScope.js';
import {
  recordSongRevision,
  snapshotFromSongRow,
  songRevisionToApi,
  summarizeChange,
  type SongSnapshot,
} from '../lib/songRevisions.js';

export const bandSongRevisionsRouter = Router({ mergeParams: true });
bandSongRevisionsRouter.use(requireAuth);

bandSongRevisionsRouter.get('/', requireBandMember, async (req, res) => {
  try {
    const scope = await loadBandSongScope(req, res);
    if (!scope) return;

    const rows = await db
      .select()
      .from(songRevisions)
      .where(eq(songRevisions.songId, scope.song.id))
      .orderBy(asc(songRevisions.createdAt));

    // Each entry's `changed` describes it relative to the one before it.
    const revisions = rows.map((row, i) =>
      songRevisionToApi(row, i > 0 ? (rows[i - 1].snapshot as SongSnapshot) : null),
    );
    revisions.reverse(); // newest first for the UI
    res.json({ revisions });
  } catch (err) {
    console.error('Failed to list song revisions:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandSongRevisionsRouter.get('/:id', requireBandMember, async (req, res) => {
  try {
    const scope = await loadBandSongScope(req, res);
    if (!scope) return;
    const [row] = await db
      .select()
      .from(songRevisions)
      .where(eq(songRevisions.id, req.params.id))
      .limit(1);
    if (!row || row.songId !== scope.song.id) {
      res.status(404).json({ error: 'Revision not found.' });
      return;
    }
    res.json({ revision: songRevisionToApi(row, null) });
  } catch (err) {
    console.error('Failed to load song revision:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandSongRevisionsRouter.post('/:id/restore', requireBandEditor, async (req, res) => {
  try {
    const scope = await loadBandSongScope(req, res);
    if (!scope) return;

    const [revision] = await db
      .select()
      .from(songRevisions)
      .where(eq(songRevisions.id, req.params.id))
      .limit(1);
    if (!revision || revision.songId !== scope.song.id) {
      res.status(404).json({ error: 'Revision not found.' });
      return;
    }

    const snapshot = revision.snapshot as SongSnapshot;
    const [updated] = await db
      .update(songs)
      .set({ ...snapshot, updatedAt: new Date() })
      .where(eq(songs.id, scope.song.id))
      .returning();

    await recordSongRevision({ songRow: updated, editorUserId: req.userId ?? null });

    res.json({
      song: updated,
      changed: summarizeChange(snapshotFromSongRow(updated), snapshot),
    });
  } catch (err) {
    console.error('Failed to restore song revision:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
