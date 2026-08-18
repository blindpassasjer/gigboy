import { setlists } from '../db/schema.js';
import { buildCrudRouter } from './crud.js';
import { removeNullish } from '../lib/serialize.js';

type SetlistRow = typeof setlists.$inferSelect;

export function toApi(row: SetlistRow) {
  return removeNullish({
    id: row.id,
    name: row.name,
    icon: row.icon,
    songIds: row.songIds,
    songNotes: row.songNotes,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  });
}

function fromBody(body: Record<string, unknown>, id: string, userId: string) {
  return {
    id,
    userId,
    name: typeof body.name === 'string' ? body.name : '',
    icon: (body.icon as string | undefined) ?? null,
    songIds: Array.isArray(body.songIds) ? (body.songIds as string[]) : [],
    songNotes: (body.songNotes as Record<string, string> | undefined) ?? null,
    sortOrder: (body.sortOrder as number | undefined) ?? null,
    updatedAt: new Date(),
  };
}

export const setlistsRouter = buildCrudRouter({
  table: setlists,
  idColumn: setlists.id,
  userIdColumn: setlists.userId,
  resourceKey: 'setlist',
  pluralKey: 'setlists',
  itemType: 'setlist',
  toApi,
  fromBody,
});
