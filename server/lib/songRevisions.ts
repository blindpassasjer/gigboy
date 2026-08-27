import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { songRevisions, songs, users } from '../db/schema.js';

type SongRow = typeof songs.$inferSelect;
type RevisionRow = typeof songRevisions.$inferSelect;

/** Editable fields captured in a revision snapshot, with human labels for the change summary. */
const SNAPSHOT_FIELDS: Array<{ key: keyof SongRow; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'author', label: 'Author' },
  { key: 'language', label: 'Language' },
  { key: 'secondaryLanguages', label: 'Languages' },
  { key: 'tags', label: 'Tags' },
  { key: 'chordpro', label: 'Lyrics & chords' },
  { key: 'capo', label: 'Capo' },
  { key: 'key', label: 'Key' },
  { key: 'tempo', label: 'Tempo' },
  { key: 'timeSignature', label: 'Time signature' },
];

const MAX_REVISIONS_PER_SONG = 100;
/** Successive saves by the same editor within this window replace the previous revision. */
const COALESCE_WINDOW_MS = 10 * 60 * 1000;

export type SongSnapshot = Record<string, unknown>;

export function snapshotFromSongRow(row: SongRow): SongSnapshot {
  const snapshot: SongSnapshot = {};
  for (const { key } of SNAPSHOT_FIELDS) snapshot[key] = row[key] ?? null;
  return snapshot;
}

function normalize(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  return JSON.stringify(value ?? null);
}

function snapshotsEqual(a: SongSnapshot, b: SongSnapshot): boolean {
  return SNAPSHOT_FIELDS.every(({ key }) => normalize(a[key]) === normalize(b[key]));
}

/** Field labels that differ between two snapshots. */
export function summarizeChange(prev: SongSnapshot | null, next: SongSnapshot): string[] {
  if (!prev) return ['Created'];
  const changed: string[] = [];
  for (const { key, label } of SNAPSHOT_FIELDS) {
    if (normalize(prev[key]) !== normalize(next[key])) changed.push(label);
  }
  return changed;
}

export function songRevisionToApi(row: RevisionRow, prevSnapshot: SongSnapshot | null) {
  return {
    id: row.id,
    createdAt: row.createdAt?.toISOString(),
    editorUserId: row.editorUserId,
    editorDisplayName: row.editorDisplayName,
    editorAvatar: row.editorAvatar,
    snapshot: row.snapshot as SongSnapshot,
    changed: summarizeChange(prevSnapshot, row.snapshot as SongSnapshot),
  };
}

/**
 * Records a snapshot of `songRow` as the newest revision. No-ops when nothing changed;
 * coalesces rapid re-saves by the same editor; prunes old rows past the per-song cap.
 */
export async function recordSongRevision(params: {
  songRow: SongRow;
  editorUserId: string | null;
}): Promise<void> {
  const { songRow, editorUserId } = params;
  const snapshot = snapshotFromSongRow(songRow);

  const [latest] = await db
    .select()
    .from(songRevisions)
    .where(eq(songRevisions.songId, songRow.id))
    .orderBy(desc(songRevisions.createdAt))
    .limit(1);

  if (latest && snapshotsEqual(latest.snapshot as SongSnapshot, snapshot)) return;

  let editorDisplayName: string | null = null;
  let editorAvatar: string | null = null;
  if (editorUserId) {
    const [u] = await db.select().from(users).where(eq(users.id, editorUserId)).limit(1);
    editorDisplayName = u?.fullName || u?.username || null;
    editorAvatar = u?.avatar ?? null;
  }

  const now = new Date();
  const canCoalesce = latest
    && latest.editorUserId === editorUserId
    && latest.createdAt
    && now.getTime() - latest.createdAt.getTime() < COALESCE_WINDOW_MS;

  if (canCoalesce) {
    await db
      .update(songRevisions)
      .set({ snapshot, editorDisplayName, editorAvatar, createdAt: now })
      .where(eq(songRevisions.id, latest.id));
    return;
  }

  await db.insert(songRevisions).values({
    id: crypto.randomUUID(),
    songId: songRow.id,
    bandId: songRow.bandId,
    editorUserId,
    editorDisplayName,
    editorAvatar,
    snapshot,
    createdAt: now,
  });

  // Prune anything past the newest MAX_REVISIONS_PER_SONG.
  const keep = await db
    .select({ createdAt: songRevisions.createdAt })
    .from(songRevisions)
    .where(eq(songRevisions.songId, songRow.id))
    .orderBy(desc(songRevisions.createdAt))
    .limit(MAX_REVISIONS_PER_SONG);
  const cutoff = keep[keep.length - 1]?.createdAt;
  if (keep.length >= MAX_REVISIONS_PER_SONG && cutoff) {
    await db
      .delete(songRevisions)
      .where(and(eq(songRevisions.songId, songRow.id), lt(songRevisions.createdAt, cutoff)));
  }
}
