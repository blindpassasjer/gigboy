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
import {
  compareTrashByDeletedAtDesc,
  createTrashPayload,
  createTrashTimestamps,
  isTrashExpired,
  parseAttachmentTrashRecord,
  TRASH_COLLECTION,
} from './trash';

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

function trashCollectionRef(db: Firestore, scope: AttachmentsScope) {
  if (scope.type === 'band') {
    return collection(db, 'bands', scope.bandId, TRASH_COLLECTION);
  }
  return collection(db, 'users', scope.ownerId, TRASH_COLLECTION);
}

function trashDocRef(db: Firestore, scope: AttachmentsScope, trashId: string) {
  if (scope.type === 'band') {
    return doc(db, 'bands', scope.bandId, TRASH_COLLECTION, trashId);
  }
  return doc(db, 'users', scope.ownerId, TRASH_COLLECTION, trashId);
}

export interface TrashedSongAttachment {
  trashId: string;
  deletedAt: string;
  purgeAt: string;
  songId: string;
  songTitle: string;
  attachment: SongAttachment;
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

export async function moveSongAttachmentToTrash(
  db: Firestore,
  scope: AttachmentsScope,
  songId: string,
  songTitle: string,
  attachment: SongAttachment,
): Promise<TrashedSongAttachment> {
  const trashId = crypto.randomUUID();
  const { deletedAt, purgeAt } = createTrashTimestamps();

  await Promise.all([
    setDoc(
      trashDocRef(db, scope, trashId),
      createTrashPayload('attachment', deletedAt, purgeAt, { songId, songTitle, attachment }),
    ),
    deleteDoc(attachmentDocRef(db, scope, songId, attachment.id)),
  ]);

  return { trashId, deletedAt, purgeAt, songId, songTitle, attachment };
}

export async function restoreSongAttachmentFromTrash(
  db: Firestore,
  scope: AttachmentsScope,
  trashed: TrashedSongAttachment,
): Promise<void> {
  await Promise.all([
    setDoc(attachmentDocRef(db, scope, trashed.songId, trashed.attachment.id), trashed.attachment),
    deleteDoc(trashDocRef(db, scope, trashed.trashId)),
  ]);
}

export async function deleteSongAttachmentPermanently(
  db: Firestore,
  storage: FirebaseStorage,
  scope: AttachmentsScope,
  trashed: TrashedSongAttachment,
): Promise<void> {
  if (trashed.attachment.storagePath) {
    try {
      await deleteObject(ref(storage, trashed.attachment.storagePath));
    } catch {
      // File may already be gone; continue to remove Firestore docs
    }
  }

  await Promise.all([
    deleteDoc(attachmentDocRef(db, scope, trashed.songId, trashed.attachment.id)).catch(() => undefined),
    deleteDoc(trashDocRef(db, scope, trashed.trashId)),
  ]);
}

export async function loadTrashedSongAttachments(
  db: Firestore,
  storage: FirebaseStorage | null,
  scope: AttachmentsScope,
): Promise<TrashedSongAttachment[]> {
  const snapshot = await getDocs(trashCollectionRef(db, scope));
  const now = Date.now();

  const parsed = snapshot.docs
    .map((entry) => parseAttachmentTrashRecord(entry.id, entry.data() as Record<string, unknown>))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const expired = parsed.filter((entry) => isTrashExpired(entry.purgeAt, now));
  const active = parsed.filter((entry) => !isTrashExpired(entry.purgeAt, now));

  if (expired.length > 0) {
    void Promise.all(
      expired.map((entry) => {
        const storagePath = entry.data.attachment.storagePath;
        const storageDelete = storagePath && storage
          ? deleteObject(ref(storage, storagePath)).catch(() => undefined)
          : Promise.resolve();
        return Promise.all([storageDelete, deleteDoc(trashDocRef(db, scope, entry.id))]);
      })
    ).catch((error) => {
      console.warn('Failed to purge expired attachment trash items.', error);
    });
  }

  return active
    .map((entry) => ({
      trashId: entry.id,
      deletedAt: entry.deletedAt,
      purgeAt: entry.purgeAt,
      songId: entry.data.songId,
      songTitle: entry.data.songTitle,
      attachment: entry.data.attachment,
    }))
    .sort(compareTrashByDeletedAtDesc);
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
