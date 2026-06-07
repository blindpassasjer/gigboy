import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { HandNoteStroke, SongHandNoteDocument, TextNote } from '../types';

const SONGS_COLLECTION = 'songs';
const HAND_NOTES_COLLECTION = 'handNotes';

export type SongHandNotesScope =
  | { type: 'user'; ownerId: string }
  | { type: 'band'; bandId: string };

function songHandNotesCollectionRef(db: Firestore, scope: SongHandNotesScope, songId: string) {
  if (scope.type === 'band') {
    return collection(db, 'bands', scope.bandId, SONGS_COLLECTION, songId, HAND_NOTES_COLLECTION);
  }
  return collection(db, 'users', scope.ownerId, SONGS_COLLECTION, songId, HAND_NOTES_COLLECTION);
}

function songHandNotesDocRef(
  db: Firestore,
  scope: SongHandNotesScope,
  songId: string,
  authorUid: string,
) {
  if (scope.type === 'band') {
    return doc(db, 'bands', scope.bandId, SONGS_COLLECTION, songId, HAND_NOTES_COLLECTION, authorUid);
  }
  return doc(db, 'users', scope.ownerId, SONGS_COLLECTION, songId, HAND_NOTES_COLLECTION, authorUid);
}

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeStroke(raw: unknown, isV2 = false): HandNoteStroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  const id = typeof data.id === 'string' ? data.id : crypto.randomUUID();
  const color = typeof data.color === 'string' ? data.color : '#c0392b';
  const width = typeof data.width === 'number' && Number.isFinite(data.width) ? data.width : 2;
  const createdAt = typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString();

  if (!Array.isArray(data.points)) return null;
  const points = data.points
    .filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
    .map((v, i) => {
      // v2: Y values (odd indices) are width-relative and may exceed 1 — only clamp X and ensure Y >= 0.
      if (isV2 && i % 2 === 1) return Math.max(0, v);
      return clamp01(v);
    });

  if (points.length < 4 || points.length % 2 !== 0) return null;

  return {
    id,
    color,
    width,
    points,
    createdAt,
  };
}

function normalizeTextNote(raw: unknown): TextNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const id = typeof data.id === 'string' ? data.id : crypto.randomUUID();
  const x = typeof data.x === 'number' && Number.isFinite(data.x) ? clamp01(data.x) : null;
  const y = typeof data.y === 'number' && Number.isFinite(data.y) ? clamp01(data.y) : null;
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  const createdAt = typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString();
  if (x === null || y === null || !text) return null;
  return { id, x, y, text, createdAt };
}

function normalizeNoteDocument(docId: string, raw: unknown): SongHandNoteDocument {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const authorUid = typeof data.authorUid === 'string'
    ? data.authorUid
    : typeof data.authorId === 'string'
      ? data.authorId
      : typeof data.uid === 'string'
        ? data.uid
        : docId;
  const authorName = typeof data.authorName === 'string'
    ? data.authorName
    : typeof data.name === 'string'
      ? data.name
      : null;
  const authorAvatar = typeof data.authorAvatar === 'string'
    ? data.authorAvatar
    : typeof data.avatar === 'string'
      ? data.avatar
      : null;
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString();

  const viewportData = data.viewport && typeof data.viewport === 'object'
    ? (data.viewport as Record<string, unknown>)
    : {};

  const viewport = {
    width: typeof viewportData.width === 'number' && viewportData.width > 0 ? viewportData.width : 1,
    height: typeof viewportData.height === 'number' && viewportData.height > 0 ? viewportData.height : 1,
  };

  const coordinateSystem = data.coordinateSystem === 'v3' ? 'v3' as const
    : data.coordinateSystem === 'v2' ? 'v2' as const
    : undefined;
  const isV2 = coordinateSystem === 'v2';

  const strokes = Array.isArray(data.strokes)
    ? data.strokes.map((s) => normalizeStroke(s, isV2)).filter((stroke): stroke is HandNoteStroke => Boolean(stroke))
    : [];

  const rawTextNotes = Array.isArray(data.textNotes)
    ? data.textNotes.map(normalizeTextNote).filter((tn): tn is TextNote => Boolean(tn))
    : undefined;

  return {
    authorUid,
    authorName,
    authorAvatar,
    updatedAt,
    viewport,
    coordinateSystem,
    strokes,
    textNotes: rawTextNotes?.length ? rawTextNotes : undefined,
  };
}

export function subscribeToSongHandNotes(
  db: Firestore,
  scope: SongHandNotesScope,
  songId: string,
  onUpdate: (notes: SongHandNoteDocument[]) => void,
  onError?: (error: Error) => void
): () => void {
  const collectionRef = songHandNotesCollectionRef(db, scope, songId);
  const unsubscribe = onSnapshot(
    collectionRef,
    (snapshot) => {
      const notes = snapshot.docs
        .map((entry) => normalizeNoteDocument(entry.id, entry.data()))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onUpdate(notes);
    },
    (error) => {
      console.error('Failed to subscribe to song hand notes.', error);
      onError?.(error as Error);
    }
  );
  return unsubscribe;
}

export async function saveSongHandNote(params: {
  db: Firestore;
  scope: SongHandNotesScope;
  songId: string;
  note: SongHandNoteDocument;
}) {
  const { db, scope, songId, note } = params;
  const { authorUid } = note;

  await setDoc(songHandNotesDocRef(db, scope, songId, authorUid), note);
}

export async function deleteSongHandNote(params: {
  db: Firestore;
  scope: SongHandNotesScope;
  songId: string;
  authorUid: string;
}) {
  const { db, scope, songId, authorUid } = params;
  await deleteDoc(songHandNotesDocRef(db, scope, songId, authorUid));
}
