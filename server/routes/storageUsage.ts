import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attachments, bandLogos, bandMembers, pressKitImages, songRecordings, songs } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { getUserStorageQuotaBytes } from '../lib/storageQuota.js';

function sumBytes(rows: Array<{ sizeBytes: number }>): number {
  return rows.reduce((sum, row) => sum + row.sizeBytes, 0);
}

export const storageUsageRouter = Router();
storageUsageRouter.use(requireAuth);

storageUsageRouter.get('/', async (req, res) => {
  try {
    const bandId = typeof req.query.bandId === 'string' && req.query.bandId ? req.query.bandId : null;
    const userId = req.userId!;

    if (!bandId) {
      res.status(400).json({ error: 'bandId is required.' });
      return;
    }

    const memberRows = await db
      .select({ userId: bandMembers.userId })
      .from(bandMembers)
      .where(and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, userId)))
      .limit(1);
    if (!memberRows[0]) {
      res.status(403).json({ error: 'You are not a member of this band.' });
      return;
    }

    const bandSongRows = await db.select({ id: songs.id }).from(songs).where(eq(songs.bandId, bandId));
    const bandSongIds = bandSongRows.map((row) => row.id);

    const [recordingRows, attachmentRows, imageRows, logoRows] = await Promise.all([
      db
        .select({ sizeBytes: songRecordings.sizeBytes })
        .from(songRecordings)
        .where(eq(songRecordings.bandId, bandId)),
      bandSongIds.length
        ? db.select({ sizeBytes: attachments.sizeBytes }).from(attachments).where(inArray(attachments.songId, bandSongIds))
        : Promise.resolve([]),
      db.select({ sizeBytes: pressKitImages.sizeBytes, thumbSizeBytes: pressKitImages.thumbSizeBytes }).from(pressKitImages).where(eq(pressKitImages.bandId, bandId)),
      db.select({ sizeBytes: bandLogos.sizeBytes, thumbSizeBytes: bandLogos.thumbSizeBytes }).from(bandLogos).where(eq(bandLogos.bandId, bandId)),
    ]);

    const recordingBytes = sumBytes(recordingRows);
    const attachmentBytes = sumBytes(attachmentRows);
    const imageBytes = sumBytes(imageRows.map((r) => ({ sizeBytes: r.sizeBytes + r.thumbSizeBytes })))
      + sumBytes(logoRows.map((r) => ({ sizeBytes: r.sizeBytes + r.thumbSizeBytes })));

    const quotaBytes = await getUserStorageQuotaBytes(userId);

    res.json({
      recordingBytes,
      attachmentBytes,
      imageBytes,
      quotaBytes,
    });
  } catch (err) {
    console.error('Failed to compute storage usage:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
