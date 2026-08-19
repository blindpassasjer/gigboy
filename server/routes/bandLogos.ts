import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bandLogos, bands } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandEditor, requireBandMember } from '../middleware/bandAccess.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';
import {
  BAND_LOGO_ACCEPTED_MIME_TYPES,
  BAND_LOGO_THUMB_MIME_TYPE,
  bandLogoToApi,
  bandLogoUpload,
  createLogoThumbnail,
  extensionForImageMimeType,
  streamBandLogoFile,
} from '../lib/bandLogos.js';
import { toBandApi } from '../lib/band.js';

/** Reads :bandId via a widened Request type — route handlers on '/' otherwise infer params as {}. */
function bandIdFromReq(req: Request): string {
  return req.params.bandId;
}

function downloadUrlBase(req: Request): string {
  return `/api/bands/${bandIdFromReq(req)}/logos`;
}

function handleUploadErrors(err: unknown, res: Response): boolean {
  if (!err) return false;
  const asAny = err as { code?: string; message?: string };
  if (asAny.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'File is too large. Maximum size is 5MB.' });
    return true;
  }
  if (asAny.message === 'INVALID_FILE_TYPE') {
    res.status(400).json({ error: 'Only JPEG, PNG, WebP, or GIF images are accepted.' });
    return true;
  }
  console.error('Band logo upload failed:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
  return true;
}

async function loadLogo(req: Request, res: Response) {
  const existing = await db
    .select()
    .from(bandLogos)
    .where(and(eq(bandLogos.id, req.params.id), eq(bandLogos.bandId, req.params.bandId)))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: 'Logo not found.' });
    return null;
  }
  return existing[0];
}

export const bandLogosRouter = Router({ mergeParams: true });
bandLogosRouter.use(requireAuth, requireBandMember);

bandLogosRouter.get('/', async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(bandLogos)
      .where(eq(bandLogos.bandId, bandIdFromReq(req)))
      .orderBy(desc(bandLogos.createdAt));
    res.json({ logos: rows.map((row) => bandLogoToApi(row, downloadUrlBase(req))) });
  } catch (err) {
    console.error('Failed to list band logos:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandLogosRouter.post(
  '/',
  requireBandEditor,
  (req: Request, res: Response, next: NextFunction) => {
    bandLogoUpload.single('file')(req, res, (err) => {
      if (handleUploadErrors(err, res)) return;
      next();
    });
  },
  async (req, res) => {
    try {
      const bandId = bandIdFromReq(req);
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file was uploaded.' });
        return;
      }
      if (!BAND_LOGO_ACCEPTED_MIME_TYPES.includes(file.mimetype)) {
        res.status(400).json({ error: 'Only JPEG, PNG, WebP, or GIF images are accepted.' });
        return;
      }

      const thumbBuffer = await createLogoThumbnail(file.buffer);

      const id = crypto.randomUUID();
      const ext = extensionForImageMimeType(file.mimetype);
      const storageKey = `${bandId}/logos/${id}.${ext}`;
      const thumbStorageKey = `${bandId}/logos/${id}-thumb.webp`;
      await localStorageAdapter.save(storageKey, file.buffer, file.mimetype);
      await localStorageAdapter.save(thumbStorageKey, thumbBuffer, BAND_LOGO_THUMB_MIME_TYPE);

      const [row] = await db
        .insert(bandLogos)
        .values({
          id,
          bandId,
          storageKey,
          thumbStorageKey,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          thumbSizeBytes: thumbBuffer.byteLength,
          createdBy: req.userId!,
        })
        .returning();

      res.json({ logo: bandLogoToApi(row, downloadUrlBase(req)) });
    } catch (err) {
      console.error('Failed to save band logo:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  },
);

bandLogosRouter.delete('/:id', requireBandEditor, async (req, res) => {
  try {
    const bandId = bandIdFromReq(req);
    const logo = await loadLogo(req, res);
    if (!logo) return;

    // If this asset is the band's currently-selected logo, clear the selection.
    const url = `${downloadUrlBase(req)}/${logo.id}/download`;
    const bandRows = await db.select().from(bands).where(eq(bands.id, bandId)).limit(1);
    if (bandRows[0]?.logo === url) {
      await db.update(bands).set({ logo: null, updatedAt: new Date() }).where(eq(bands.id, bandId));
    }

    await db.delete(bandLogos).where(eq(bandLogos.id, logo.id));
    await localStorageAdapter.delete(logo.storageKey);
    await localStorageAdapter.delete(logo.thumbStorageKey);
    res.json({});
  } catch (err) {
    console.error('Failed to delete band logo:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandLogosRouter.get('/:id/download', async (req, res) => {
  try {
    const logo = await loadLogo(req, res);
    if (!logo) return;
    await streamBandLogoFile(res, localStorageAdapter, logo.storageKey, logo.mimeType);
  } catch (err) {
    console.error('Failed to download band logo:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandLogosRouter.get('/:id/thumb', async (req, res) => {
  try {
    const logo = await loadLogo(req, res);
    if (!logo) return;
    await streamBandLogoFile(res, localStorageAdapter, logo.thumbStorageKey, BAND_LOGO_THUMB_MIME_TYPE);
  } catch (err) {
    console.error('Failed to download band logo thumbnail:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/** Sets (or clears) the band's currently-selected logo. Body: { logoId: string | null }. */
bandLogosRouter.put('/selected', requireBandEditor, async (req, res) => {
  try {
    const bandId = bandIdFromReq(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const logoId = typeof body.logoId === 'string' ? body.logoId : null;

    let url: string | null = null;
    if (logoId) {
      const logoRows = await db
        .select()
        .from(bandLogos)
        .where(and(eq(bandLogos.id, logoId), eq(bandLogos.bandId, bandId)))
        .limit(1);
      if (!logoRows[0]) {
        res.status(404).json({ error: 'Logo not found.' });
        return;
      }
      url = `${downloadUrlBase(req)}/${logoId}/download`;
    }

    const [row] = await db
      .update(bands)
      .set({ logo: url, updatedAt: new Date() })
      .where(eq(bands.id, bandId))
      .returning();
    if (!row) {
      res.status(404).json({ error: 'Band not found.' });
      return;
    }
    res.json({ band: await toBandApi(row) });
  } catch (err) {
    console.error('Failed to update band logo selection:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
