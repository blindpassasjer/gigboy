import type { Setlist, Song, SongList, InputList, PressKit, TrashItemType } from '../types';

export const TRASH_COLLECTION = 'trashItems';
const TRASH_RETENTION_DAYS = 30;

export interface TrashRecord<T, K extends TrashItemType = TrashItemType> {
  id: string;
  itemType: K;
  deletedAt: string;
  purgeAt: string;
  data: T;
}

function omitUndefinedFields<T extends object>(data: T) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as T;
}

function retentionMs(days: number) {
  return days * 24 * 60 * 60 * 1000;
}

export function createTrashTimestamps(now = new Date()) {
  const deletedAt = now.toISOString();
  const purgeAt = new Date(now.getTime() + retentionMs(TRASH_RETENTION_DAYS)).toISOString();
  return { deletedAt, purgeAt };
}

export function createTrashPayload<T extends object>(
  itemType: TrashItemType,
  deletedAt: string,
  purgeAt: string,
  data: T,
) {
  return {
    itemType,
    deletedAt,
    purgeAt,
    data: omitUndefinedFields(data),
  };
}

export function isTrashExpired(purgeAt: string, now = Date.now()) {
  const timestamp = Date.parse(purgeAt);
  if (Number.isNaN(timestamp)) return false;
  return timestamp <= now;
}

export function compareTrashByDeletedAtDesc(a: { deletedAt: string }, b: { deletedAt: string }) {
  return b.deletedAt.localeCompare(a.deletedAt);
}

export function parseSongTrashRecord(id: string, raw: Record<string, unknown>): TrashRecord<Song, 'song'> | null {
  if (raw.itemType !== 'song') return null;
  if (typeof raw.deletedAt !== 'string' || typeof raw.purgeAt !== 'string') return null;
  if (!raw.data || typeof raw.data !== 'object') return null;

  const data = raw.data as Song;
  if (typeof data.id !== 'string' || typeof data.title !== 'string') return null;

  return {
    id,
    itemType: 'song',
    deletedAt: raw.deletedAt,
    purgeAt: raw.purgeAt,
    data,
  };
}

export function parseSongListTrashRecord(id: string, raw: Record<string, unknown>): TrashRecord<SongList, 'songlist'> | null {
  if (raw.itemType !== 'songlist') return null;
  if (typeof raw.deletedAt !== 'string' || typeof raw.purgeAt !== 'string') return null;
  if (!raw.data || typeof raw.data !== 'object') return null;

  const data = raw.data as SongList;
  if (typeof data.id !== 'string' || typeof data.name !== 'string' || !Array.isArray(data.songIds)) return null;

  return {
    id,
    itemType: 'songlist',
    deletedAt: raw.deletedAt,
    purgeAt: raw.purgeAt,
    data,
  };
}

export function parseSetlistTrashRecord(id: string, raw: Record<string, unknown>): TrashRecord<Setlist, 'setlist'> | null {
  if (raw.itemType !== 'setlist') return null;
  if (typeof raw.deletedAt !== 'string' || typeof raw.purgeAt !== 'string') return null;
  if (!raw.data || typeof raw.data !== 'object') return null;

  const data = raw.data as Setlist;
  if (typeof data.id !== 'string' || typeof data.name !== 'string' || !Array.isArray(data.songIds)) return null;

  return {
    id,
    itemType: 'setlist',
    deletedAt: raw.deletedAt,
    purgeAt: raw.purgeAt,
    data,
  };
}

export function parseInputListTrashRecord(id: string, raw: Record<string, unknown>): TrashRecord<InputList, 'technicalRider'> | null {
  if (raw.itemType !== 'technicalRider') return null;
  if (typeof raw.deletedAt !== 'string' || typeof raw.purgeAt !== 'string') return null;
  if (!raw.data || typeof raw.data !== 'object') return null;

  const data = raw.data as InputList;
  if (typeof data.id !== 'string' || typeof data.name !== 'string') return null;

  return {
    id,
    itemType: 'technicalRider',
    deletedAt: raw.deletedAt,
    purgeAt: raw.purgeAt,
    data,
  };
}

export function parsePressKitTrashRecord(id: string, raw: Record<string, unknown>): TrashRecord<PressKit, 'pressKit'> | null {
  if (raw.itemType !== 'pressKit') return null;
  if (typeof raw.deletedAt !== 'string' || typeof raw.purgeAt !== 'string') return null;
  if (!raw.data || typeof raw.data !== 'object') return null;

  const data = raw.data as PressKit;
  if (typeof data.id !== 'string' || typeof data.name !== 'string' || typeof data.richText !== 'string') return null;
  if (!Array.isArray(data.imageIds)) return null;

  return {
    id,
    itemType: 'pressKit',
    deletedAt: raw.deletedAt,
    purgeAt: raw.purgeAt,
    data,
  };
}

export function parsePressKitImageTrashRecord(
  id: string,
  raw: Record<string, unknown>
): TrashRecord<{
  image: {
    id: string;
    title: string;
    url: string;
    thumbUrl?: string;
    storagePath?: string;
    thumbStoragePath?: string;
    mimeType?: string;
    sizeBytes?: number;
    thumbSizeBytes?: number;
    createdAt?: string;
    createdBy?: string;
  };
  linkedPressKitIds?: string[];
}, 'pressKitImage'> | null {
  if (raw.itemType !== 'pressKitImage') return null;
  if (typeof raw.deletedAt !== 'string' || typeof raw.purgeAt !== 'string') return null;
  if (!raw.data || typeof raw.data !== 'object') return null;

  const data = raw.data as Record<string, unknown>;
  const imageRaw = data.image;
  if (!imageRaw || typeof imageRaw !== 'object') return null;
  const image = imageRaw as Record<string, unknown>;
  if (typeof image.id !== 'string' || typeof image.title !== 'string' || typeof image.url !== 'string') return null;

  return {
    id,
    itemType: 'pressKitImage',
    deletedAt: raw.deletedAt,
    purgeAt: raw.purgeAt,
    data: {
      image: {
        id: image.id,
        title: image.title,
        url: image.url,
        thumbUrl: typeof image.thumbUrl === 'string' ? image.thumbUrl : undefined,
        storagePath: typeof image.storagePath === 'string' ? image.storagePath : undefined,
        thumbStoragePath: typeof image.thumbStoragePath === 'string' ? image.thumbStoragePath : undefined,
        mimeType: typeof image.mimeType === 'string' ? image.mimeType : undefined,
        sizeBytes: typeof image.sizeBytes === 'number' ? image.sizeBytes : undefined,
        thumbSizeBytes: typeof image.thumbSizeBytes === 'number' ? image.thumbSizeBytes : undefined,
        createdAt: typeof image.createdAt === 'string' ? image.createdAt : undefined,
        createdBy: typeof image.createdBy === 'string' ? image.createdBy : undefined,
      },
      linkedPressKitIds: Array.isArray(data.linkedPressKitIds)
        ? data.linkedPressKitIds.filter((entry): entry is string => typeof entry === 'string')
        : undefined,
    },
  };
}

export function parseAttachmentTrashRecord(
  id: string,
  raw: Record<string, unknown>
): TrashRecord<{
  songId: string;
  songTitle: string;
  attachment: {
    id: string;
    name: string;
    storagePath: string;
    downloadUrl: string;
    sizeBytes: number;
    mimeType: string;
    createdAt: string;
    uploader?: {
      userId: string;
      displayName: string;
      avatar: string | null;
    };
  };
}, 'attachment'> | null {
  if (raw.itemType !== 'attachment') return null;
  if (typeof raw.deletedAt !== 'string' || typeof raw.purgeAt !== 'string') return null;
  if (!raw.data || typeof raw.data !== 'object') return null;

  const data = raw.data as Record<string, unknown>;
  if (typeof data.songId !== 'string') return null;

  const attachmentRaw = data.attachment;
  if (!attachmentRaw || typeof attachmentRaw !== 'object') return null;
  const attachment = attachmentRaw as Record<string, unknown>;
  if (typeof attachment.id !== 'string' || typeof attachment.name !== 'string' || typeof attachment.storagePath !== 'string') return null;

  const rawUploader = attachment.uploader as Record<string, unknown> | undefined;

  return {
    id,
    itemType: 'attachment',
    deletedAt: raw.deletedAt,
    purgeAt: raw.purgeAt,
    data: {
      songId: data.songId,
      songTitle: typeof data.songTitle === 'string' ? data.songTitle : 'Untitled song',
      attachment: {
        id: attachment.id,
        name: attachment.name,
        storagePath: attachment.storagePath,
        downloadUrl: typeof attachment.downloadUrl === 'string' ? attachment.downloadUrl : '',
        sizeBytes: typeof attachment.sizeBytes === 'number' ? attachment.sizeBytes : 0,
        mimeType: typeof attachment.mimeType === 'string' ? attachment.mimeType : 'application/pdf',
        createdAt: typeof attachment.createdAt === 'string' ? attachment.createdAt : new Date().toISOString(),
        uploader: rawUploader && typeof rawUploader.userId === 'string'
          ? {
              userId: rawUploader.userId,
              displayName: typeof rawUploader.displayName === 'string' ? rawUploader.displayName : 'Unknown',
              avatar: typeof rawUploader.avatar === 'string' ? rawUploader.avatar : null,
            }
          : undefined,
      },
    },
  };
}

export function parseBandLogoTrashRecord(
  id: string,
  raw: Record<string, unknown>
): TrashRecord<{
  image: {
    id: 'band-logo';
    title: string;
    url: string;
    thumbUrl?: string;
    storagePath?: string;
    thumbStoragePath?: string;
    mimeType?: string;
    sizeBytes?: number;
    thumbSizeBytes?: number;
    createdAt?: string;
    createdBy?: string;
  };
  linkedPressKitIds?: string[];
}, 'bandLogo'> | null {
  if (raw.itemType !== 'bandLogo') return null;
  if (typeof raw.deletedAt !== 'string' || typeof raw.purgeAt !== 'string') return null;
  if (!raw.data || typeof raw.data !== 'object') return null;

  const data = raw.data as Record<string, unknown>;
  const imageRaw = data.image;
  if (!imageRaw || typeof imageRaw !== 'object') return null;
  const image = imageRaw as Record<string, unknown>;
  if (image.id !== 'band-logo' || typeof image.title !== 'string' || typeof image.url !== 'string') return null;

  return {
    id,
    itemType: 'bandLogo',
    deletedAt: raw.deletedAt,
    purgeAt: raw.purgeAt,
    data: {
      image: {
        id: 'band-logo',
        title: image.title,
        url: image.url,
        thumbUrl: typeof image.thumbUrl === 'string' ? image.thumbUrl : undefined,
        storagePath: typeof image.storagePath === 'string' ? image.storagePath : undefined,
        thumbStoragePath: typeof image.thumbStoragePath === 'string' ? image.thumbStoragePath : undefined,
        mimeType: typeof image.mimeType === 'string' ? image.mimeType : undefined,
        sizeBytes: typeof image.sizeBytes === 'number' ? image.sizeBytes : undefined,
        thumbSizeBytes: typeof image.thumbSizeBytes === 'number' ? image.thumbSizeBytes : undefined,
        createdAt: typeof image.createdAt === 'string' ? image.createdAt : undefined,
        createdBy: typeof image.createdBy === 'string' ? image.createdBy : undefined,
      },
      linkedPressKitIds: Array.isArray(data.linkedPressKitIds)
        ? data.linkedPressKitIds.filter((entry): entry is string => typeof entry === 'string')
        : undefined,
    },
  };
}
