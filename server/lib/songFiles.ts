import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attachments, songRecordings } from '../db/schema.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';

/**
 * Deletes every stored file (PDF attachments + audio recordings) belonging to a song. Call this
 * *before* deleting the song row: `attachments.songId`/`song_recordings.songId` cascade-delete
 * their DB rows the moment the song goes, and once those rows are gone there's no query path
 * back to their storage keys — the files on disk become permanently unreachable garbage instead
 * of being cleaned up. (Hand notes and revisions have no backing files, so nothing to do there.)
 */
export async function deleteSongFiles(songId: string): Promise<void> {
  const [attachmentRows, recordingRows] = await Promise.all([
    db.select({ storageKey: attachments.storageKey }).from(attachments).where(eq(attachments.songId, songId)),
    db.select({ storageKey: songRecordings.storageKey }).from(songRecordings).where(eq(songRecordings.songId, songId)),
  ]);
  await Promise.all(
    [...attachmentRows, ...recordingRows].map((row) => localStorageAdapter.delete(row.storageKey)),
  );
}
