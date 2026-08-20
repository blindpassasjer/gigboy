import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attachments, bandMembers, handNotes, songRecordings, songs } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';

export interface SongBadgeCounts {
  notes: number;
  attachments: number;
  recordings: number;
}

function tally(rows: Array<{ songId: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.songId] = (counts[row.songId] ?? 0) + 1;
  }
  return counts;
}

/** Best-effort badge counts (notes/attachments/recordings) for a set of songs, used by song-list cards. */
export const songBadgesRouter = Router();
songBadgesRouter.use(requireAuth);

songBadgesRouter.get('/', async (req, res) => {
  try {
    const userId = req.userId!;
    const rawSongIds = typeof req.query.songIds === 'string' ? req.query.songIds : '';
    const requestedSongIds = [...new Set(rawSongIds.split(',').map((id) => id.trim()).filter(Boolean))];
    if (requestedSongIds.length === 0) {
      res.json({ badges: {} });
      return;
    }

    const memberBandRows = await db.select({ bandId: bandMembers.bandId }).from(bandMembers).where(eq(bandMembers.userId, userId));
    const memberBandIds = memberBandRows.map((row) => row.bandId);
    if (memberBandIds.length === 0) {
      res.json({ badges: {} });
      return;
    }

    const authorizedSongRows = await db
      .select({ id: songs.id })
      .from(songs)
      .where(and(inArray(songs.id, requestedSongIds), inArray(songs.bandId, memberBandIds)));
    const songIds = authorizedSongRows.map((row) => row.id);
    if (songIds.length === 0) {
      res.json({ badges: {} });
      return;
    }

    const [noteRows, attachmentRows, recordingRows] = await Promise.all([
      db.select({ songId: handNotes.songId }).from(handNotes).where(inArray(handNotes.songId, songIds)),
      db.select({ songId: attachments.songId }).from(attachments).where(inArray(attachments.songId, songIds)),
      db.select({ songId: songRecordings.songId }).from(songRecordings).where(inArray(songRecordings.songId, songIds)),
    ]);

    const noteCounts = tally(noteRows);
    const attachmentCounts = tally(attachmentRows);
    const recordingCounts = tally(recordingRows);

    const badges: Record<string, SongBadgeCounts> = {};
    for (const songId of songIds) {
      badges[songId] = {
        notes: noteCounts[songId] ?? 0,
        attachments: attachmentCounts[songId] ?? 0,
        recordings: recordingCounts[songId] ?? 0,
      };
    }

    res.json({ badges });
  } catch (err) {
    console.error('Failed to load song badge counts:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
