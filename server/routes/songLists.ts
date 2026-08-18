import { songLists } from '../db/schema.js';
import { buildCrudRouter } from './crud.js';
import { removeNullish } from '../lib/serialize.js';

type SongListRow = typeof songLists.$inferSelect;

export function toApi(row: SongListRow) {
  return removeNullish({
    id: row.id,
    name: row.name,
    songIds: row.songIds,
    folderId: row.folderId,
    icon: row.icon,
    sortOrder: row.sortOrder,
  });
}

function fromBody(body: Record<string, unknown>, id: string, userId: string) {
  return {
    id,
    userId,
    name: typeof body.name === 'string' ? body.name : '',
    songIds: Array.isArray(body.songIds) ? (body.songIds as string[]) : [],
    folderId: (body.folderId as string | undefined) ?? null,
    icon: (body.icon as string | undefined) ?? null,
    sortOrder: (body.sortOrder as number | undefined) ?? null,
  };
}

export const songListsRouter = buildCrudRouter({
  table: songLists,
  idColumn: songLists.id,
  userIdColumn: songLists.userId,
  resourceKey: 'songList',
  pluralKey: 'songLists',
  itemType: 'songlist',
  toApi,
  fromBody,
});
