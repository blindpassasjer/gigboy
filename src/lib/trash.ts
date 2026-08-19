import type { TrashItemType } from '../types';

const TRASH_RETENTION_DAYS = 30;

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

export function compareTrashByDeletedAtDesc(a: { deletedAt: string }, b: { deletedAt: string }) {
  return b.deletedAt.localeCompare(a.deletedAt);
}
