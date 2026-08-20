import { randomUUID } from 'node:crypto';
import { and, count, eq, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  attachments,
  bandRiders,
  pressKitImages,
  pressKits,
  setlists,
  songLists,
  songs,
  trashItems,
} from '../db/schema.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';

/** Matches TrashListItem['itemType'] in src/components/TrashView.tsx, minus the not-built-in-self-host variants. */
export type TrashItemType =
  | 'song'
  | 'songlist'
  | 'setlist'
  | 'technicalRider'
  | 'attachment'
  | 'pressKit'
  | 'pressKitImage';

export const TRASH_RETENTION_DAYS = 30;

export interface TrashScope {
  bandId: string;
}

type TrashRow = typeof trashItems.$inferSelect;

/** Snapshots a just-deleted resource into `trash_items`. Call before deleting the live row. */
export async function insertTrashItem(scope: TrashScope, itemType: TrashItemType, payload: unknown): Promise<void> {
  const deletedAt = new Date();
  const purgeAt = new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(trashItems).values({
    id: randomUUID(),
    bandId: scope.bandId,
    itemType,
    payload,
    deletedAt,
    purgeAt,
  });
}

/** Derives the display name TrashListItem expects from a trash row's stored payload. */
export function nameForTrashPayload(itemType: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (itemType === 'song') return typeof p.title === 'string' ? p.title : 'Untitled song';
  if (itemType === 'attachment') {
    const attachment = (p.attachment ?? {}) as Record<string, unknown>;
    return typeof attachment.name === 'string' ? attachment.name : 'Attachment';
  }
  if (itemType === 'pressKit') return typeof p.name === 'string' ? p.name : 'Untitled press kit';
  if (itemType === 'pressKitImage') return typeof p.title === 'string' ? p.title : 'Untitled image';
  return typeof p.name === 'string' ? p.name : 'Untitled';
}

/** Maps a `trash_items` row to the wire shape TrashListItem (src/components/TrashView.tsx) expects. */
export function trashRowToListItem(row: TrashRow) {
  return {
    trashId: row.id,
    itemType: row.itemType as TrashItemType,
    name: nameForTrashPayload(row.itemType, row.payload),
    deletedAt: row.deletedAt.toISOString(),
    purgeAt: row.purgeAt.toISOString(),
  };
}

/** Permanently deletes one trash row; for attachments/press-kit images this also removes the underlying stored file(s). */
export async function permanentlyDeleteTrashRow(row: TrashRow): Promise<void> {
  if (row.itemType === 'attachment') {
    const payload = row.payload as { storageKey?: string };
    if (payload.storageKey) {
      await localStorageAdapter.delete(payload.storageKey);
    }
  }
  if (row.itemType === 'pressKitImage') {
    const payload = row.payload as { storageKey?: string; thumbStorageKey?: string };
    if (payload.storageKey) {
      await localStorageAdapter.delete(payload.storageKey);
    }
    if (payload.thumbStorageKey) {
      await localStorageAdapter.delete(payload.thumbStorageKey);
    }
  }
  await db.delete(trashItems).where(eq(trashItems.id, row.id));
}

/** Sweeps (permanently deletes) every expired trash row scoped to `bandId`. Call at the top of the band `GET /trash`. */
export async function sweepExpiredBandTrash(bandId: string): Promise<void> {
  const now = new Date();
  const expired = await db
    .select()
    .from(trashItems)
    .where(and(eq(trashItems.bandId, bandId), lt(trashItems.purgeAt, now)));
  for (const row of expired) {
    await permanentlyDeleteTrashRow(row);
  }
}

async function nextSortOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  whereCond: any,
): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table).where(whereCond);
  return row?.value ?? 0;
}

export type RestoreResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Re-inserts a trashed row into its live table from `row.payload`, appending to the end of its
 * scope's sort order (recomputing nothing else — siblings are assumed already contiguous, matching
 * how every existing create handler assigns sortOrder=count). Does NOT delete the trash row itself;
 * callers do that once this returns ok so a failed restore leaves the trash row intact.
 */
export async function restoreTrashRow(row: TrashRow): Promise<RestoreResult> {
  const payload = row.payload as Record<string, unknown>;

  switch (row.itemType) {
    case 'song': {
      const whereCond = eq(songs.bandId, row.bandId!);
      const sortOrder = await nextSortOrder(songs, whereCond);
      await db.insert(songs).values({
        id: (payload.id as string) ?? randomUUID(),
        bandId: row.bandId!,
        title: (payload.title as string) ?? '',
        artist: (payload.artist as string | undefined) ?? null,
        author: (payload.author as string | undefined) ?? null,
        playbackUrl: (payload.playbackUrl as string | undefined) ?? null,
        language: (payload.language as string) ?? 'en',
        secondaryLanguages: (payload.secondaryLanguages as string[] | undefined) ?? null,
        tags: (payload.tags as string[] | undefined) ?? null,
        chordpro: (payload.chordpro as string) ?? '',
        capo: (payload.capo as number | undefined) ?? null,
        key: (payload.key as string | undefined) ?? null,
        preferredTranspose: (payload.preferredTranspose as number | undefined) ?? null,
        tempo: (payload.tempo as number | undefined) ?? null,
        timeSignature: (payload.timeSignature as string | undefined) ?? null,
        sortOrder,
        createdAt: payload.createdAt ? new Date(payload.createdAt as string) : new Date(),
        updatedAt: new Date(),
      });
      return { ok: true };
    }
    case 'songlist': {
      const whereCond = eq(songLists.bandId, row.bandId!);
      const sortOrder = await nextSortOrder(songLists, whereCond);
      await db.insert(songLists).values({
        id: (payload.id as string) ?? randomUUID(),
        bandId: row.bandId!,
        name: (payload.name as string) ?? '',
        songIds: Array.isArray(payload.songIds) ? (payload.songIds as string[]) : [],
        folderId: (payload.folderId as string | undefined) ?? null,
        icon: (payload.icon as string | undefined) ?? null,
        sortOrder,
      });
      return { ok: true };
    }
    case 'setlist': {
      const whereCond = eq(setlists.bandId, row.bandId!);
      const sortOrder = await nextSortOrder(setlists, whereCond);
      await db.insert(setlists).values({
        id: (payload.id as string) ?? randomUUID(),
        bandId: row.bandId!,
        name: (payload.name as string) ?? '',
        icon: (payload.icon as string | undefined) ?? null,
        songIds: Array.isArray(payload.songIds) ? (payload.songIds as string[]) : [],
        songNotes: (payload.songNotes as Record<string, string> | undefined) ?? null,
        sortOrder,
        createdAt: payload.createdAt ? new Date(payload.createdAt as string) : new Date(),
        updatedAt: new Date(),
      });
      return { ok: true };
    }
    case 'technicalRider': {
      if (!row.bandId) {
        return { ok: false, status: 500, error: 'Riders can only be restored within a band.' };
      }
      const sortOrder = await nextSortOrder(bandRiders, eq(bandRiders.bandId, row.bandId));
      await db.insert(bandRiders).values({
        id: (payload.id as string) ?? randomUUID(),
        bandId: row.bandId,
        name: (payload.name as string) ?? '',
        icon: (payload.icon as string | undefined) ?? null,
        hospitalityNotes: (payload.hospitalityNotes as string | undefined) ?? null,
        logisticsNotes: (payload.logisticsNotes as string | undefined) ?? null,
        items: Array.isArray(payload.items) ? (payload.items as unknown[]) : [],
        drawingLayers: Array.isArray(payload.drawingLayers) ? (payload.drawingLayers as unknown[]) : [],
        publicShareEnabled: Boolean(payload.publicShareEnabled),
        sortOrder,
        createdAt: payload.createdAt ? new Date(payload.createdAt as string) : new Date(),
        updatedAt: new Date(),
      });
      return { ok: true };
    }
    case 'attachment': {
      const attachmentPayload = payload as {
        attachment?: {
          id?: string;
          name?: string;
          sizeBytes?: number;
          mimeType?: string;
          createdAt?: string;
          uploader?: { userId?: string; displayName?: string; avatar?: string | null };
        };
        songId?: string;
        storageKey?: string;
      };
      const songId = attachmentPayload.songId;
      if (!songId) {
        return { ok: false, status: 500, error: 'Trashed attachment is missing its parent song reference.' };
      }
      const parentSong = await db.select({ id: songs.id }).from(songs).where(eq(songs.id, songId)).limit(1);
      if (!parentSong[0]) {
        return {
          ok: false,
          status: 409,
          error: 'The song this attachment belonged to no longer exists, so it cannot be restored.',
        };
      }
      const a = attachmentPayload.attachment ?? {};
      await db.insert(attachments).values({
        id: a.id ?? randomUUID(),
        songId,
        name: a.name ?? 'attachment.pdf',
        storageKey: attachmentPayload.storageKey ?? '',
        sizeBytes: a.sizeBytes ?? 0,
        mimeType: a.mimeType ?? 'application/pdf',
        createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
        uploaderUserId: a.uploader?.userId ?? null,
        uploaderDisplayName: a.uploader?.displayName ?? null,
        uploaderAvatar: a.uploader?.avatar ?? null,
      });
      return { ok: true };
    }
    case 'pressKit': {
      if (!row.bandId) {
        return { ok: false, status: 500, error: 'Press kits can only be restored within a band.' };
      }
      await db.insert(pressKits).values({
        id: (payload.id as string) ?? randomUUID(),
        bandId: row.bandId,
        name: (payload.name as string) ?? '',
        icon: (payload.icon as string | undefined) ?? null,
        richText: (payload.richText as string | undefined) ?? '',
        imageIds: Array.isArray(payload.imageIds) ? (payload.imageIds as string[]) : [],
        videoUrls: Array.isArray(payload.videoUrls) ? (payload.videoUrls as string[]) : [],
        selectedVideoUrls: Array.isArray(payload.selectedVideoUrls) ? (payload.selectedVideoUrls as string[]) : [],
        presaveReleaseName: (payload.presaveReleaseName as string | undefined) ?? null,
        presaveReleaseDate: (payload.presaveReleaseDate as string | undefined) ?? null,
        presaveUrls: Array.isArray(payload.presaveUrls) ? (payload.presaveUrls as string[]) : [],
        selectedPresaveUrls: Array.isArray(payload.selectedPresaveUrls)
          ? (payload.selectedPresaveUrls as string[])
          : [],
        createdAt: payload.createdAt ? new Date(payload.createdAt as string) : new Date(),
        createdBy: (payload.createdBy as string | undefined) ?? null,
      });
      return { ok: true };
    }
    case 'pressKitImage': {
      if (!row.bandId) {
        return { ok: false, status: 500, error: 'Press kit images can only be restored within a band.' };
      }
      const imageId = (payload.id as string) ?? randomUUID();
      await db.insert(pressKitImages).values({
        id: imageId,
        bandId: row.bandId,
        title: (payload.title as string) ?? 'Untitled image',
        storageKey: (payload.storageKey as string) ?? '',
        thumbStorageKey: (payload.thumbStorageKey as string) ?? '',
        mimeType: (payload.mimeType as string) ?? 'application/octet-stream',
        sizeBytes: (payload.sizeBytes as number) ?? 0,
        thumbSizeBytes: (payload.thumbSizeBytes as number) ?? 0,
        createdAt: payload.createdAt ? new Date(payload.createdAt as string) : new Date(),
        createdBy: (payload.createdBy as string | undefined) ?? null,
      });

      const linkedPressKitIds = Array.isArray(payload.linkedPressKitIds)
        ? (payload.linkedPressKitIds as string[])
        : [];
      for (const kitId of linkedPressKitIds) {
        const kitRows = await db.select().from(pressKits).where(eq(pressKits.id, kitId)).limit(1);
        const kit = kitRows[0];
        if (!kit) continue; // linked kit was itself deleted in the meantime; skip silently
        const currentImageIds = Array.isArray(kit.imageIds) ? kit.imageIds : [];
        if (!currentImageIds.includes(imageId)) {
          await db
            .update(pressKits)
            .set({ imageIds: [...currentImageIds, imageId] })
            .where(eq(pressKits.id, kitId));
        }
      }
      return { ok: true };
    }
    default:
      return { ok: false, status: 500, error: `Unsupported trash item type: ${row.itemType}` };
  }
}
