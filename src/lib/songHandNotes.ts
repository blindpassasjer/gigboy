import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { HandNoteStroke, SongHandNoteDocument } from '../types';

const SONGS_COLLECTION = 'songs';
const HAND_NOTES_COLLECTION = 'handNotes';

function songHandNotesPath(ownerId: string, songId: string) {
  return ['users', ownerId, SONGS_COLLECTION, songId, HAND_NOTES_COLLECTION] as const;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeStroke(raw: unknown): HandNoteStroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  const id = typeof data.id === 'string' ? data.id : crypto.randomUUID();
  const color = typeof data.color === 'string' ? data.color : '#c0392b';
  const width = typeof data.width === 'number' && Number.isFinite(data.width) ? data.width : 2;
  const createdAt = typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString();

  if (!Array.isArray(data.points)) return null;
  const points = data.points
    .filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
    .map(clamp01);

  if (points.length < 4 || points.length % 2 !== 0) return null;

  return {
    id,
    color,
    width,
    points,
    createdAt,
  };
}

function normalizeNoteDocument(docId: string, raw: unknown): SongHandNoteDocument {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const authorUid = typeof data.authorUid === 'string' ? data.authorUid : docId;
  const authorName = typeof data.authorName === 'string' ? data.authorName : null;
  const authorAvatar = typeof data.authorAvatar === 'string' ? data.authorAvatar : null;
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString();

  const viewportData = data.viewport && typeof data.viewport === 'object'
    ? (data.viewport as Record<string, unknown>)
    : {};

  const viewport = {
    width: typeof viewportData.width === 'number' && viewportData.width > 0 ? viewportData.width : 1,
    height: typeof viewportData.height === 'number' && viewportData.height > 0 ? viewportData.height : 1,
  };

  const strokes = Array.isArray(data.strokes)
    ? data.strokes.map(normalizeStroke).filter((stroke): stroke is HandNoteStroke => Boolean(stroke))
    : [];

  return {
    authorUid,
    authorName,
    authorAvatar,
    updatedAt,
    viewport,
    strokes,
  };
}

export async function loadSongHandNotes(
  db: Firestore,
  ownerId: string,
  songId: string
): Promise<SongHandNoteDocument[]> {
  const snapshot = await getDocs(collection(db, ...songHandNotesPath(ownerId, songId)));

  return snapshot.docs
    .map((entry) => normalizeNoteDocument(entry.id, entry.data()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveSongHandNote(params: {
  db: Firestore;
  ownerId: string;
  songId: string;
  note: SongHandNoteDocument;
}) {
  const { db, ownerId, songId, note } = params;
  const { authorUid } = note;

  await setDoc(doc(db, ...songHandNotesPath(ownerId, songId), authorUid), note);
}

export async function deleteSongHandNote(params: {
  db: Firestore;
  ownerId: string;
  songId: string;
  authorUid: string;
}) {
  const { db, ownerId, songId, authorUid } = params;
  await deleteDoc(doc(db, ...songHandNotesPath(ownerId, songId), authorUid));
}
