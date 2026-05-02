import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';

export interface SongRecording {
  id: string;
  name: string;
  storagePath: string;
  downloadUrl: string;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
}

function recordingsPath(ownerId: string, songId: string) {
  return ['users', ownerId, 'songs', songId, 'recordings'] as const;
}

export async function loadSongRecordings(
  db: Firestore,
  ownerId: string,
  songId: string,
): Promise<SongRecording[]> {
  const col = collection(db, ...recordingsPath(ownerId, songId));
  const q = query(col, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: typeof data.name === 'string' ? data.name : 'Untitled',
      storagePath: typeof data.storagePath === 'string' ? data.storagePath : '',
      downloadUrl: typeof data.downloadUrl === 'string' ? data.downloadUrl : '',
      durationMs: typeof data.durationMs === 'number' ? data.durationMs : 0,
      sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : 0,
      mimeType: typeof data.mimeType === 'string' ? data.mimeType : 'audio/webm',
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    };
  });
}

export async function uploadSongRecording(
  db: Firestore,
  storage: FirebaseStorage,
  ownerId: string,
  songId: string,
  blob: Blob,
  name: string,
  durationMs: number,
): Promise<SongRecording> {
  const id = crypto.randomUUID();
  const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
  const storagePath = `users/${ownerId}/songs/${songId}/recordings/${id}.${ext}`;
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
  };

  const docRef = doc(db, ...recordingsPath(ownerId, songId), id);
  await setDoc(docRef, recording);

  return recording;
}

export async function deleteSongRecording(
  db: Firestore,
  storage: FirebaseStorage,
  ownerId: string,
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
  const docRef = doc(db, ...recordingsPath(ownerId, songId), recording.id);
  await deleteDoc(docRef);
}
