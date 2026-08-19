import { songs } from '../db/schema.js';
import { buildCrudRouter } from './crud.js';
import { removeNullish } from '../lib/serialize.js';

type SongRow = typeof songs.$inferSelect;

export function toApi(row: SongRow) {
  return removeNullish({
    id: row.id,
    title: row.title,
    artist: row.artist,
    author: row.author,
    playbackUrl: row.playbackUrl,
    language: row.language,
    secondaryLanguages: row.secondaryLanguages,
    tags: row.tags,
    chordpro: row.chordpro,
    capo: row.capo,
    key: row.key,
    preferredTranspose: row.preferredTranspose,
    tempo: row.tempo,
    timeSignature: row.timeSignature,
    sortOrder: row.sortOrder,
    collaboratorIds: row.collaboratorIds,
    collaborationPermissions: row.collaborationPermissions,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  });
}

function fromBody(body: Record<string, unknown>, id: string, userId: string) {
  return {
    id,
    userId,
    title: typeof body.title === 'string' ? body.title : '',
    artist: (body.artist as string | undefined) ?? null,
    author: (body.author as string | undefined) ?? null,
    playbackUrl: (body.playbackUrl as string | undefined) ?? null,
    language: typeof body.language === 'string' ? body.language : 'en',
    secondaryLanguages: (body.secondaryLanguages as string[] | undefined) ?? null,
    tags: (body.tags as string[] | undefined) ?? null,
    chordpro: typeof body.chordpro === 'string' ? body.chordpro : '',
    capo: (body.capo as number | undefined) ?? null,
    key: (body.key as string | undefined) ?? null,
    preferredTranspose: (body.preferredTranspose as number | undefined) ?? null,
    tempo: (body.tempo as number | undefined) ?? null,
    timeSignature: (body.timeSignature as string | undefined) ?? null,
    sortOrder: (body.sortOrder as number | undefined) ?? null,
    updatedAt: new Date(),
  };
}

export const songsRouter = buildCrudRouter({
  table: songs,
  idColumn: songs.id,
  userIdColumn: songs.userId,
  resourceKey: 'song',
  pluralKey: 'songs',
  itemType: 'song',
  toApi,
  fromBody,
  collaboratorIdsColumn: songs.collaboratorIds,
});
