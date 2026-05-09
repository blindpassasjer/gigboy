import type { Setlist, Song, SongList, InputList, TrashItemType } from '../types';

export const TRASH_COLLECTION = 'trashItems';
export const TRASH_RETENTION_DAYS = 30;

export interface TrashRecord<T> {
  id: string;
  itemType: TrashItemType;
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

export function parseSongTrashRecord(id: string, raw: Record<string, unknown>): TrashRecord<Song> | null {
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

export function parseSongListTrashRecord(id: string, raw: Record<string, unknown>): TrashRecord<SongList> | null {
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

export function parseSetlistTrashRecord(id: string, raw: Record<string, unknown>): TrashRecord<Setlist> | null {
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

export function parseInputListTrashRecord(id: string, raw: Record<string, unknown>): TrashRecord<InputList> | null {
  if (raw.itemType !== 'technicalRider') return null;
  if (typeof raw.deletedAt !== 'string' || typeof raw.purgeAt !== 'string') return null;
  if (!raw.data || typeof raw.data !== 'object') return null;

  const data = raw.data as InputList;
  if (typeof data.id !== 'string' || typeof data.name !== 'string' || !Array.isArray(data.lines)) return null;

  return {
    id,
    itemType: 'technicalRider',
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
}> | null {
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
}> | null {
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
