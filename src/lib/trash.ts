import type { Setlist, Song, SongList, TrashItemType } from '../types';

export const TRASH_COLLECTION = 'trashItems';
export const TRASH_RETENTION_DAYS = 30;

export interface TrashRecord<T> {
  id: string;
  itemType: TrashItemType;
  deletedAt: string;
  purgeAt: string;
  data: T;
}

function omitUndefinedFields<T extends Record<string, unknown>>(data: T) {
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

export function createTrashPayload<T extends Record<string, unknown>>(
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
