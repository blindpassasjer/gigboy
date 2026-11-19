import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bandMembers } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { getBandStorageBreakdown, getUserStorageQuotaBytes } from '../lib/storageQuota.js';

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

    const { recordingBytes, attachmentBytes, imageBytes } = await getBandStorageBreakdown(bandId);

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
