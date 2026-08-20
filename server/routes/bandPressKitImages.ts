import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pressKitImages, pressKits } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandEditor, requireBandMember } from '../middleware/bandAccess.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';
import {
  extensionForImageMimeType,
  PRESS_KIT_IMAGE_ACCEPTED_MIME_TYPES,
  PRESS_KIT_IMAGE_THUMB_MIME_TYPE,
  pressKitImageToApi,
  pressKitImageUpload,
  streamPressKitImageFile,
} from '../lib/pressKitImages.js';
import { insertTrashItem } from '../lib/trash.js';
import { assertUploadWithinQuota } from '../lib/storageQuota.js';

function downloadUrlBase(req: Request): string {
  return `/api/bands/${bandIdFromReq(req)}/press-kit-images`;
}

/** Reads :bandId via a widened Request type — route handlers on '/' otherwise infer params as {}. */
function bandIdFromReq(req: Request): string {
  return req.params.bandId;
}

function handleUploadErrors(err: unknown, res: Response): boolean {
  if (!err) return false;
  const asAny = err as { code?: string; message?: string };
  if (asAny.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'File is too large. Maximum size is 10MB.' });
    return true;
  }
  if (asAny.message === 'INVALID_FILE_TYPE') {
    res.status(400).json({ error: 'Only JPEG, PNG, WebP, or GIF images are accepted.' });
    return true;
  }
  if (asAny.message === 'INVALID_THUMB_TYPE') {
    res.status(400).json({ error: 'Thumbnail must be a WebP image.' });
    return true;
  }
  console.error('Press kit image upload failed:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
  return true;
}

/** Loads a press-kit image row scoped to :bandId, 404ing if missing. */
async function loadImage(req: Request, res: Response) {
  const existing = await db
    .select()
    .from(pressKitImages)
    .where(and(eq(pressKitImages.id, req.params.id), eq(pressKitImages.bandId, req.params.bandId)))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: 'Image not found.' });
    return null;
  }
  return existing[0];
}

export const bandPressKitImagesRouter = Router({ mergeParams: true });
bandPressKitImagesRouter.use(requireAuth, requireBandMember);

bandPressKitImagesRouter.get('/', async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(pressKitImages)
      .where(eq(pressKitImages.bandId, bandIdFromReq(req)))
      .orderBy(desc(pressKitImages.createdAt));
    res.json({ images: rows.map((row) => pressKitImageToApi(row, downloadUrlBase(req))) });
  } catch (err) {
    console.error('Failed to list press kit images:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandPressKitImagesRouter.post(
  '/',
  requireBandEditor,
  (req: Request, res: Response, next: NextFunction) => {
    pressKitImageUpload(req, res, (err) => {
      if (handleUploadErrors(err, res)) return;
      next();
    });
  },
  async (req, res) => {
    try {
      const bandId = req.params.bandId;
      const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      const file = files.file?.[0];
      const thumb = files.thumb?.[0];
      if (!file || !thumb) {
        res.status(400).json({ error: 'Both file and thumb are required.' });
        return;
      }
      if (!PRESS_KIT_IMAGE_ACCEPTED_MIME_TYPES.includes(file.mimetype)) {
        res.status(400).json({ error: 'Only JPEG, PNG, WebP, or GIF images are accepted.' });
        return;
      }
      if (thumb.mimetype !== PRESS_KIT_IMAGE_THUMB_MIME_TYPE) {
        res.status(400).json({ error: 'Thumbnail must be a WebP image.' });
        return;
      }

      const quotaCheck = await assertUploadWithinQuota(req.userId!, bandId, file.size + thumb.size);
      if (!quotaCheck.ok) {
        res.status(413).json({ error: quotaCheck.message });
        return;
      }

      const id = crypto.randomUUID();
      const ext = extensionForImageMimeType(file.mimetype);
      const storageKey = `${bandId}/press-kit/${id}.${ext}`;
      const thumbStorageKey = `${bandId}/press-kit/${id}-thumb.webp`;
      await localStorageAdapter.save(storageKey, file.buffer, file.mimetype);
      await localStorageAdapter.save(thumbStorageKey, thumb.buffer, thumb.mimetype);

      const title = file.originalname || 'image';
      const [row] = await db
        .insert(pressKitImages)
        .values({
          id,
          bandId,
          title,
          storageKey,
          thumbStorageKey,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          thumbSizeBytes: thumb.size,
          createdBy: req.userId!,
        })
        .returning();

      res.json({ image: pressKitImageToApi(row, downloadUrlBase(req)) });
    } catch (err) {
      console.error('Failed to save press kit image:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  },
);

bandPressKitImagesRouter.delete('/:id', requireBandEditor, async (req, res) => {
  try {
    const bandId = req.params.bandId;
    const image = await loadImage(req, res);
    if (!image) return;

    // Strip this image id from any kit that references it, recording which kits so restore can re-link.
    const kits = await db.select().from(pressKits).where(eq(pressKits.bandId, bandId));
    const linkedPressKitIds: string[] = [];
    for (const kit of kits) {
      const imageIds = Array.isArray(kit.imageIds) ? kit.imageIds : [];
      if (imageIds.includes(image.id)) {
        linkedPressKitIds.push(kit.id);
        await db
          .update(pressKits)
          .set({ imageIds: imageIds.filter((imgId) => imgId !== image.id) })
          .where(eq(pressKits.id, kit.id));
      }
    }

    await insertTrashItem({ bandId }, 'pressKitImage', {
      id: image.id,
      title: image.title,
      storageKey: image.storageKey,
      thumbStorageKey: image.thumbStorageKey,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      thumbSizeBytes: image.thumbSizeBytes,
      createdAt: image.createdAt.toISOString(),
      createdBy: image.createdBy,
      linkedPressKitIds,
    });
    await db.delete(pressKitImages).where(eq(pressKitImages.id, image.id));
    res.json({});
  } catch (err) {
    console.error('Failed to delete press kit image:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandPressKitImagesRouter.get('/:id/download', async (req, res) => {
  try {
    const image = await loadImage(req, res);
    if (!image) return;
    await streamPressKitImageFile(res, localStorageAdapter, image.storageKey, image.mimeType);
  } catch (err) {
    console.error('Failed to download press kit image:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandPressKitImagesRouter.get('/:id/thumb', async (req, res) => {
  try {
    const image = await loadImage(req, res);
    if (!image) return;
    await streamPressKitImageFile(res, localStorageAdapter, image.thumbStorageKey, PRESS_KIT_IMAGE_THUMB_MIME_TYPE);
  } catch (err) {
    console.error('Failed to download press kit image thumbnail:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
