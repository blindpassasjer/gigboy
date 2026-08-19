import type { handNotes } from '../db/schema.js';
import { removeNullish } from './serialize.js';

type HandNoteRow = typeof handNotes.$inferSelect;

/** Maps a DB row to the wire shape `LyricNoteDocument` (src/types/index.ts) expects. */
export function handNoteToApi(row: HandNoteRow) {
  return removeNullish({
    authorUid: row.authorUserId,
    authorName: row.authorName ?? undefined,
    authorAvatar: row.authorAvatar ?? undefined,
    updatedAt: row.updatedAt.toISOString(),
    strokes: Array.isArray(row.strokes) ? row.strokes : [],
    textNotes: Array.isArray(row.textNotes) && row.textNotes.length ? row.textNotes : undefined,
  });
}
