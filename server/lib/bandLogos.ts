import type { Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import type { bandLogos } from '../db/schema.js';
import type { localStorageAdapter } from '../storage/localStorageAdapter.js';
import { removeNullish } from './serialize.js';

export const BAND_LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const BAND_LOGO_ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const BAND_LOGO_THUMB_MIME_TYPE = 'image/webp';
const THUMB_MAX_EDGE_PX = 320;

type BandLogoRow = typeof bandLogos.$inferSelect;

/** multer config: single `file` field, memory storage — thumbnail is generated server-side via sharp. */
export const bandLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BAND_LOGO_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!BAND_LOGO_ACCEPTED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

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

/** Generates a WebP thumbnail (longest edge capped at 320px) from an uploaded logo image via sharp. */
export async function createLogoThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize({ width: THUMB_MAX_EDGE_PX, height: THUMB_MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
}

/** Maps a DB row to the wire shape `BandLogoAsset` (src/lib/bandLogos.ts) expects. */
export function bandLogoToApi(row: BandLogoRow, urlBase: string) {
  return removeNullish({
    id: row.id,
    url: `${urlBase}/${row.id}/download`,
    thumbUrl: `${urlBase}/${row.id}/thumb`,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    thumbSizeBytes: row.thumbSizeBytes,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy ?? undefined,
  });
}

/** Streams a stored band logo asset (full or thumb) to the response, or 404s. */
export async function streamBandLogoFile(
  res: Response,
  storageAdapter: typeof localStorageAdapter,
  storageKey: string,
  mimeType: string,
): Promise<void> {
  const file = await storageAdapter.read(storageKey);
  if (!file) {
    res.status(404).json({ error: 'Logo file not found.' });
    return;
  }
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', String(file.sizeBytes));
  file.stream.pipe(res);
}
