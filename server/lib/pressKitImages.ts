import type { Response } from 'express';
import multer from 'multer';
import type { pressKitImages } from '../db/schema.js';
import type { localStorageAdapter } from '../storage/localStorageAdapter.js';
import { removeNullish } from './serialize.js';

/** Client generates the thumbnail (see src/utils/imageThumbnail.ts's createWebpThumbnail) — no server-side resizing. */
export const PRESS_KIT_IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const PRESS_KIT_IMAGE_ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const PRESS_KIT_IMAGE_THUMB_MIME_TYPE = 'image/webp';

type PressKitImageRow = typeof pressKitImages.$inferSelect;

/** multer config: two fields (`file` + `thumb`), memory storage, mime-type validated per field below. */
export const pressKitImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PRESS_KIT_IMAGE_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'file') {
      if (!PRESS_KIT_IMAGE_ACCEPTED_MIME_TYPES.includes(file.mimetype)) {
        cb(new Error('INVALID_FILE_TYPE'));
        return;
      }
    } else if (file.fieldname === 'thumb') {
      if (file.mimetype !== PRESS_KIT_IMAGE_THUMB_MIME_TYPE) {
        cb(new Error('INVALID_THUMB_TYPE'));
        return;
      }
    }
    cb(null, true);
  },
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumb', maxCount: 1 },
]);

/** Extension to use for a full-image storage key, derived from its (already-validated) mime type. */
export function extensionForImageMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'bin';
  }
}

/** Maps a DB row to the exact wire shape `PressKitImage` (src/lib/dataClient/types.ts) expects. */
export function pressKitImageToApi(row: PressKitImageRow, urlBase: string) {
  return removeNullish({
    id: row.id,
    title: row.title,
    url: `${urlBase}/${row.id}/download`,
    thumbUrl: `${urlBase}/${row.id}/thumb`,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    thumbSizeBytes: row.thumbSizeBytes,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy ?? undefined,
  });
}

/** Streams a stored press-kit image (full or thumb) to the response, or 404s. */
export async function streamPressKitImageFile(
  res: Response,
  storageAdapter: typeof localStorageAdapter,
  storageKey: string,
  mimeType: string,
): Promise<void> {
  const file = await storageAdapter.read(storageKey);
  if (!file) {
    res.status(404).json({ error: 'Image file not found.' });
    return;
  }
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', String(file.sizeBytes));
  file.stream.pipe(res);
}
