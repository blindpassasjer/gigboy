import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  type Firestore,
  updateDoc,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';

export interface RecorderIdentity {
  userId: string;
  displayName: string;
  avatar: string | null;
}

export interface SongRecording {
  id: string;
  name: string;
  storagePath: string;
  downloadUrl: string;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  recorder?: RecorderIdentity;
  waveformBars?: number[];
}

export type RecordingsScope =
  | { type: 'user'; ownerId: string }
  | { type: 'band'; bandId: string };

function recordingsCollectionRef(db: Firestore, scope: RecordingsScope, songId: string) {
  if (scope.type === 'band') {
    return collection(db, 'bands', scope.bandId, 'songs', songId, 'recordings');
  }
  return collection(db, 'users', scope.ownerId, 'songs', songId, 'recordings');
}

function recordingDocRef(db: Firestore, scope: RecordingsScope, songId: string, id: string) {
  if (scope.type === 'band') {
    return doc(db, 'bands', scope.bandId, 'songs', songId, 'recordings', id);
  }
  return doc(db, 'users', scope.ownerId, 'songs', songId, 'recordings', id);
}

function storageBasePath(scope: RecordingsScope, songId: string) {
  if (scope.type === 'band') {
    return `bands/${scope.bandId}/songs/${songId}/recordings`;
  }
  return `users/${scope.ownerId}/songs/${songId}/recordings`;
}

function readStringField(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return '';
}

export async function loadSongRecordings(
  db: Firestore,
  storage: FirebaseStorage | null,
  scope: RecordingsScope,
  songId: string,
): Promise<SongRecording[]> {
  const col = recordingsCollectionRef(db, scope, songId);
  const q = query(col, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  const recordings = await Promise.all(snap.docs.map(async (d) => {
    const data = d.data();
    const rawRecorder = data.recorder as Record<string, unknown> | undefined;
    const storagePath = readStringField(data, ['storagePath', 'path']);
    let downloadUrl = readStringField(data, ['downloadUrl', 'downloadURL', 'audioUrl', 'url']);

    if (!downloadUrl && storage && storagePath) {
      try {
        downloadUrl = await getDownloadURL(ref(storage, storagePath));
      } catch {
        // Leave empty if file no longer exists or caller cannot read it.
      }
    }
  const rawWaveform = data.waveformBars;
    const waveformBars = Array.isArray(rawWaveform)
      ? rawWaveform
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
          .map((value) => Math.min(1, Math.max(0, value)))
      : undefined;

    return {
      id: d.id,
      name: typeof data.name === 'string' ? data.name : 'Untitled',
      storagePath,
      downloadUrl,
      durationMs: typeof data.durationMs === 'number' ? data.durationMs : 0,
      sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : (typeof data.size === 'number' ? data.size : 0),
      mimeType: typeof data.mimeType === 'string' ? data.mimeType : (typeof data.contentType === 'string' ? data.contentType : 'audio/webm'),
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
      recorder: rawRecorder && typeof rawRecorder.userId === 'string'
        ? {
            userId: rawRecorder.userId,
            displayName: typeof rawRecorder.displayName === 'string' ? rawRecorder.displayName : 'Unknown',
            avatar: typeof rawRecorder.avatar === 'string' ? rawRecorder.avatar : null,
          }
        : undefined,
      waveformBars: waveformBars && waveformBars.length > 0 ? waveformBars : undefined,
    };
  }));

  return recordings;
}

export async function uploadSongRecording(
  db: Firestore,
  storage: FirebaseStorage,
  scope: RecordingsScope,
  songId: string,
  blob: Blob,
  name: string,
  durationMs: number,
  recorder: RecorderIdentity,
  waveformBars?: number[],
): Promise<SongRecording> {
  const id = crypto.randomUUID();
  const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
  const storagePath = `${storageBasePath(scope, songId)}/${id}.${ext}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, blob, { contentType: blob.type });
  const downloadUrl = await getDownloadURL(storageRef);

  const recording: SongRecording = {
    id,
    name,
    storagePath,
    downloadUrl,
    durationMs,
    sizeBytes: blob.size,
    mimeType: blob.type,
    createdAt: new Date().toISOString(),
    recorder,
    waveformBars: waveformBars && waveformBars.length > 0 ? waveformBars : undefined,
  };

  const docRef = recordingDocRef(db, scope, songId, id);
  await setDoc(docRef, recording);

  return recording;
}

export async function deleteSongRecording(
  db: Firestore,
  storage: FirebaseStorage,
  scope: RecordingsScope,
  songId: string,
  recording: SongRecording,
): Promise<void> {
  if (recording.storagePath) {
    try {
      await deleteObject(ref(storage, recording.storagePath));
    } catch {
      // File may already be gone; continue to remove Firestore doc
    }
  }
  const docRef = recordingDocRef(db, scope, songId, recording.id);
  await deleteDoc(docRef);
}

export async function renameSongRecording(
  db: Firestore,
  scope: RecordingsScope,
  songId: string,
  recording: SongRecording,
  newName: string,
): Promise<void> {
  const docRef = recordingDocRef(db, scope, songId, recording.id);
  await updateDoc(docRef, { name: newName });
}
