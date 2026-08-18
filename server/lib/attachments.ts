import type { Response } from 'express';
import multer from 'multer';
import { attachments } from '../db/schema.js';
import type { localStorageAdapter } from '../storage/localStorageAdapter.js';

/** Mirrors src/lib/songAttachments.ts's ATTACHMENT_MAX_SIZE_BYTES / ATTACHMENT_ACCEPTED_MIME_TYPE. */
export const ATTACHMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_ACCEPTED_MIME_TYPE = 'application/pdf';

type AttachmentRow = typeof attachments.$inferSelect;

export interface UploaderIdentitySnapshot {
  userId: string;
  displayName: string;
  avatar: string | null;
}

/** multer config enforcing the PDF-only + 20MB limit before the handler even runs. */
export const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== ATTACHMENT_ACCEPTED_MIME_TYPE) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

/** Maps a DB row to the exact wire shape src/lib/songAttachments.ts's SongAttachment expects. */
export function attachmentToApi(row: AttachmentRow, downloadUrlBase: string) {
  const api: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    downloadUrl: `${downloadUrlBase}/${row.id}/download`,
    sizeBytes: row.sizeBytes,
    mimeType: row.mimeType,
    createdAt: row.createdAt.toISOString(),
  };
  if (row.uploaderUserId) {
    api.uploader = {
      userId: row.uploaderUserId,
      displayName: row.uploaderDisplayName ?? '',
      avatar: row.uploaderAvatar ?? null,
    };
  }
  return api;
}

/** Sanitizes a filename for use inside a Content-Disposition header (no quotes/newlines/control chars). */
export function sanitizeFilenameForHeader(name: string): string {
  return name.replace(/[\r\n"]/g, '').trim() || 'attachment.pdf';
}

/** Streams a resolved storage read result to the response with the right headers, or 404s. */
export async function streamAttachment(
  res: Response,
  storageAdapter: typeof localStorageAdapter,
  row: AttachmentRow,
): Promise<void> {
  const file = await storageAdapter.read(row.storageKey);
  if (!file) {
    res.status(404).json({ error: 'Attachment file not found.' });
    return;
  }
  res.setHeader('Content-Type', row.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${sanitizeFilenameForHeader(row.name)}"`,
  );
  res.setHeader('Content-Length', String(file.sizeBytes));
  file.stream.pipe(res);
}
