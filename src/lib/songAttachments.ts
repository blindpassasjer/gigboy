// Self-host attachment storage/metadata live entirely server-side (server/routes/attachments.ts,
// server/routes/bandAttachments.ts), fronted by src/lib/dataClient — see useSongAttachments.ts.
// This file now only holds the shared type/constant surface those call sites import.

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
