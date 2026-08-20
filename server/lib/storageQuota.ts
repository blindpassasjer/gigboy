import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  attachments,
  bandLogos,
  pressKitImages,
  songRecordings,
  songs,
  users,
} from '../db/schema.js';

// Self-host has no plan tiers; this is the old Firestore-hosted SaaS `crew` tier's figure,
// used whenever a user has no admin-assigned quota (users.storageQuotaBytes is null).
export const DEFAULT_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

export function resolveStorageQuotaBytes(storageQuotaBytes: number | null | undefined): number {
  return storageQuotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES;
}

/** Looks up a user's resolved storage quota (admin-assigned, or the default). */
export async function getUserStorageQuotaBytes(userId: string): Promise<number> {
  const rows = await db.select({ storageQuotaBytes: users.storageQuotaBytes }).from(users).where(eq(users.id, userId)).limit(1);
  return resolveStorageQuotaBytes(rows[0]?.storageQuotaBytes);
}

function sumBytes(rows: Array<{ sizeBytes: number }>): number {
  return rows.reduce((sum, row) => sum + row.sizeBytes, 0);
}

/** Total bytes currently stored for a band: song attachments, recordings, press kit images, and logos. */
export async function getBandStorageUsageBytes(bandId: string): Promise<number> {
  const bandSongRows = await db.select({ id: songs.id }).from(songs).where(eq(songs.bandId, bandId));
  const bandSongIds = bandSongRows.map((row) => row.id);

  const [recordingRows, attachmentRows, imageRows, logoRows] = await Promise.all([
    db.select({ sizeBytes: songRecordings.sizeBytes }).from(songRecordings).where(eq(songRecordings.bandId, bandId)),
    bandSongIds.length
      ? db.select({ sizeBytes: attachments.sizeBytes }).from(attachments).where(inArray(attachments.songId, bandSongIds))
      : Promise.resolve([]),
    db.select({ sizeBytes: pressKitImages.sizeBytes, thumbSizeBytes: pressKitImages.thumbSizeBytes }).from(pressKitImages).where(eq(pressKitImages.bandId, bandId)),
    db.select({ sizeBytes: bandLogos.sizeBytes, thumbSizeBytes: bandLogos.thumbSizeBytes }).from(bandLogos).where(eq(bandLogos.bandId, bandId)),
  ]);

  return (
    sumBytes(recordingRows)
    + sumBytes(attachmentRows)
    + sumBytes(imageRows.map((r) => ({ sizeBytes: r.sizeBytes + r.thumbSizeBytes })))
    + sumBytes(logoRows.map((r) => ({ sizeBytes: r.sizeBytes + r.thumbSizeBytes })))
  );
}

/**
 * Enforces the uploading user's own storage quota against the band's total usage. Mirrors the
 * client-side pre-check in SongAttachments.tsx/SongRecorder.tsx (which uses the same
 * user.storageQuotaBytes vs. band-usage comparison) — this is the server-side backstop so the
 * limit can't be bypassed by calling the API directly.
 */
export async function assertUploadWithinQuota(
  userId: string,
  bandId: string,
  additionalBytes: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [quotaBytes, usedBytes] = await Promise.all([
    getUserStorageQuotaBytes(userId),
    getBandStorageUsageBytes(bandId),
  ]);

  if (usedBytes + additionalBytes <= quotaBytes) {
    return { ok: true };
  }

  const usedMb = Math.round(usedBytes / (1024 * 1024));
  const quotaMb = Math.round(quotaBytes / (1024 * 1024));
  return {
    ok: false,
    message: `Storage quota exceeded. You've used ${usedMb} MB of your ${quotaMb} MB limit.`,
  };
}
