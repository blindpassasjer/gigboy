import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { LyricNoteStroke, LineAnchor, LyricNoteDocument, LyricTextNote } from '../types';

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

function normalizeLineAnchor(raw: unknown): LineAnchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const lineId = typeof data.lineId === 'number' && Number.isFinite(data.lineId) ? data.lineId : null;
  // fx/fy are deliberately not clamped — see LineAnchor's doc comment.
  const fx = typeof data.fx === 'number' && Number.isFinite(data.fx) ? data.fx : null;
  const fy = typeof data.fy === 'number' && Number.isFinite(data.fy) ? data.fy : null;
  if (lineId === null || fx === null || fy === null) return null;
  return { lineId, fx, fy };
}

function normalizeStroke(raw: unknown): LyricNoteStroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  const id = typeof data.id === 'string' ? data.id : crypto.randomUUID();
  const color = typeof data.color === 'string' ? data.color : '#c0392b';
  const width = typeof data.width === 'number' && Number.isFinite(data.width) ? data.width : 2;
  const createdAt = typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString();

  if (!Array.isArray(data.points)) return null;
  const points = data.points
    .map(normalizeLineAnchor)
    .filter((p): p is LineAnchor => p !== null);

  if (points.length < 2) return null;

  return {
    id,
    color,
    width,
    points,
    createdAt,
  };
}

function normalizeTextNote(raw: unknown): LyricTextNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const id = typeof data.id === 'string' ? data.id : crypto.randomUUID();
  const anchor = normalizeLineAnchor(raw);
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  const createdAt = typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString();
  if (!anchor || !text) return null;
  return { id, ...anchor, text, createdAt };
}

function normalizeNoteDocument(docId: string, raw: unknown): LyricNoteDocument {
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

  const strokes = Array.isArray(data.strokes)
    ? data.strokes.map(normalizeStroke).filter((stroke): stroke is LyricNoteStroke => Boolean(stroke))
    : [];

  const rawTextNotes = Array.isArray(data.textNotes)
    ? data.textNotes.map(normalizeTextNote).filter((tn): tn is LyricTextNote => Boolean(tn))
    : undefined;

  return {
    authorUid,
    authorName,
    authorAvatar,
    updatedAt,
    strokes,
    textNotes: rawTextNotes?.length ? rawTextNotes : undefined,
  };
}

export function subscribeToSongHandNotes(
  db: Firestore,
  scope: SongHandNotesScope,
  songId: string,
  onUpdate: (notes: LyricNoteDocument[]) => void,
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
  note: LyricNoteDocument;
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
