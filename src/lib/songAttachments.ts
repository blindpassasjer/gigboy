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

export const ATTACHMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_ACCEPTED_MIME_TYPE = 'application/pdf';

export interface UploaderIdentity {
  userId: string;
  displayName: string;
  avatar: string | null;
}

export interface SongAttachment {
  id: string;
  name: string;
  storagePath: string;
  downloadUrl: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  uploader?: UploaderIdentity;
}

export type AttachmentsScope =
  | { type: 'user'; ownerId: string }
  | { type: 'band'; bandId: string };

function attachmentsCollectionRef(db: Firestore, scope: AttachmentsScope, songId: string) {
  if (scope.type === 'band') {
    return collection(db, 'bands', scope.bandId, 'songs', songId, 'attachments');
  }
  return collection(db, 'users', scope.ownerId, 'songs', songId, 'attachments');
}

function attachmentDocRef(db: Firestore, scope: AttachmentsScope, songId: string, id: string) {
  if (scope.type === 'band') {
    return doc(db, 'bands', scope.bandId, 'songs', songId, 'attachments', id);
  }
  return doc(db, 'users', scope.ownerId, 'songs', songId, 'attachments', id);
}

function storageBasePath(scope: AttachmentsScope, songId: string) {
  if (scope.type === 'band') {
    return `bands/${scope.bandId}/songs/${songId}/attachments`;
  }
  return `users/${scope.ownerId}/songs/${songId}/attachments`;
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

export async function loadSongAttachments(
  db: Firestore,
  storage: FirebaseStorage | null,
  scope: AttachmentsScope,
  songId: string,
): Promise<SongAttachment[]> {
  const col = attachmentsCollectionRef(db, scope, songId);
  const q = query(col, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  const attachments = await Promise.all(snap.docs.map(async (d) => {
    const data = d.data();
    const rawUploader = data.uploader as Record<string, unknown> | undefined;
    const storagePath = readStringField(data, ['storagePath', 'path']);
    let downloadUrl = readStringField(data, ['downloadUrl', 'downloadURL', 'url']);

    if (!downloadUrl && storage && storagePath) {
      try {
        downloadUrl = await getDownloadURL(ref(storage, storagePath));
      } catch {
        // Leave empty if file no longer exists or caller cannot read it.
      }
    }

    return {
      id: d.id,
      name: typeof data.name === 'string' ? data.name : 'Untitled.pdf',
      storagePath,
      downloadUrl,
      sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : (typeof data.size === 'number' ? data.size : 0),
      mimeType: typeof data.mimeType === 'string' ? data.mimeType : ATTACHMENT_ACCEPTED_MIME_TYPE,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
      uploader: rawUploader && typeof rawUploader.userId === 'string'
        ? {
            userId: rawUploader.userId,
            displayName: typeof rawUploader.displayName === 'string' ? rawUploader.displayName : 'Unknown',
            avatar: typeof rawUploader.avatar === 'string' ? rawUploader.avatar : null,
          }
        : undefined,
    };
  }));

  return attachments;
}

export async function uploadSongAttachment(
  db: Firestore,
  storage: FirebaseStorage,
  scope: AttachmentsScope,
  songId: string,
  file: File,
  uploader: UploaderIdentity,
): Promise<SongAttachment> {
  if (file.type !== ATTACHMENT_ACCEPTED_MIME_TYPE) {
    throw new Error('Only PDF files can be attached to a song');
  }
  if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
    throw new Error(`PDF is too large. Max size is ${Math.round(ATTACHMENT_MAX_SIZE_BYTES / (1024 * 1024))} MB`);
  }

  const id = crypto.randomUUID();
  const storagePath = `${storageBasePath(scope, songId)}/${id}.pdf`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, { contentType: ATTACHMENT_ACCEPTED_MIME_TYPE });
  const downloadUrl = await getDownloadURL(storageRef);

  const attachment: SongAttachment = {
    id,
    name: file.name,
    storagePath,
    downloadUrl,
    sizeBytes: file.size,
    mimeType: ATTACHMENT_ACCEPTED_MIME_TYPE,
    createdAt: new Date().toISOString(),
    uploader,
  };

  const docRef = attachmentDocRef(db, scope, songId, id);
  await setDoc(docRef, attachment);

  return attachment;
}

export async function deleteSongAttachment(
  db: Firestore,
  storage: FirebaseStorage,
  scope: AttachmentsScope,
  songId: string,
  attachment: SongAttachment,
): Promise<void> {
  if (attachment.storagePath) {
    try {
      await deleteObject(ref(storage, attachment.storagePath));
    } catch {
      // File may already be gone; continue to remove Firestore doc
    }
  }
  const docRef = attachmentDocRef(db, scope, songId, attachment.id);
  await deleteDoc(docRef);
}

export async function renameSongAttachment(
  db: Firestore,
  scope: AttachmentsScope,
  songId: string,
  attachment: SongAttachment,
  newName: string,
): Promise<void> {
  const docRef = attachmentDocRef(db, scope, songId, attachment.id);
  await updateDoc(docRef, { name: newName });
}
