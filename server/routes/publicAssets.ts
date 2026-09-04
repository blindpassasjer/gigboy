import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bandLogos, bandRiders, bands, pressKitImages, pressKitShares, pressKits } from '../db/schema.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';
import { PRESS_KIT_IMAGE_THUMB_MIME_TYPE, streamPressKitImageFile } from '../lib/pressKitImages.js';
import { streamBandLogoFile } from '../lib/bandLogos.js';

/**
 * Unauthenticated media serving for the public share pages. The press-kit and rider JSON
 * (publicPressKits.ts / publicRiders.ts) is reachable without a session, but the image/logo
 * URLs it used to hand out pointed at the band-scoped, auth-gated `/api/bands/:bandId/...`
 * routers — so an outside recipient saw nothing but broken images. These routes serve the
 * same bytes, scoped to a live public surface (an active share token / a shared rider).
 */
export const publicAssetsRouter = Router({ mergeParams: true });

/** Public URL for a band's currently-selected logo, or null when it has none. */
export function publicBandLogoUrl(bandId: string, logo: string | null | undefined): string | null {
  return logo ? `/api/public/bands/${bandId}/logo` : null;
}

/** Resolves an image id to its row iff it belongs to the kit behind an active share token. */
async function resolveSharedImage(token: string, imageId: string) {
  const shareRows = await db
    .select()
    .from(pressKitShares)
    .where(and(eq(pressKitShares.token, token), eq(pressKitShares.status, 'active')))
    .limit(1);
  const share = shareRows[0];
  if (!share) return null;

  const kitRows = await db.select().from(pressKits).where(eq(pressKits.id, share.kitId)).limit(1);
  const kit = kitRows[0];
  if (!kit) return null;

  const imageIds = Array.isArray(kit.imageIds) ? kit.imageIds : [];
  if (!imageIds.includes(imageId)) return null;

  const imageRows = await db
    .select()
    .from(pressKitImages)
    .where(and(eq(pressKitImages.id, imageId), eq(pressKitImages.bandId, kit.bandId)))
    .limit(1);
  return imageRows[0] ?? null;
}

publicAssetsRouter.get('/press-kits/:token/images/:id/download', async (req, res) => {
  try {
    const image = await resolveSharedImage(req.params.token, req.params.id);
    if (!image) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    await streamPressKitImageFile(res, localStorageAdapter, image.storageKey, image.mimeType);
  } catch (err) {
    console.error('Failed to serve public press kit image:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

publicAssetsRouter.get('/press-kits/:token/images/:id/thumb', async (req, res) => {
  try {
    const image = await resolveSharedImage(req.params.token, req.params.id);
    if (!image) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    await streamPressKitImageFile(res, localStorageAdapter, image.thumbStorageKey, PRESS_KIT_IMAGE_THUMB_MIME_TYPE);
  } catch (err) {
    console.error('Failed to serve public press kit image thumbnail:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/** True when the band has at least one live public surface (an active press-kit share or a shared rider). */
async function bandHasPublicSurface(bandId: string): Promise<boolean> {
  const shareRows = await db
    .select({ token: pressKitShares.token })
    .from(pressKitShares)
    .where(and(eq(pressKitShares.bandId, bandId), eq(pressKitShares.status, 'active')))
    .limit(1);
  if (shareRows[0]) return true;

  const riderRows = await db
    .select({ id: bandRiders.id })
    .from(bandRiders)
    .where(and(eq(bandRiders.bandId, bandId), eq(bandRiders.publicShareEnabled, true)))
    .limit(1);
  return Boolean(riderRows[0]);
}

publicAssetsRouter.get('/bands/:bandId/logo', async (req, res) => {
  try {
    const { bandId } = req.params;
    if (!(await bandHasPublicSurface(bandId))) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    const bandRows = await db.select({ logo: bands.logo }).from(bands).where(eq(bands.id, bandId)).limit(1);
    const logoId = bandRows[0]?.logo?.match(/\/logos\/([^/]+)\/download$/)?.[1];
    if (!logoId) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    const logoRows = await db
      .select()
      .from(bandLogos)
      .where(and(eq(bandLogos.id, logoId), eq(bandLogos.bandId, bandId)))
      .limit(1);
    if (!logoRows[0]) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    await streamBandLogoFile(res, localStorageAdapter, logoRows[0].storageKey, logoRows[0].mimeType);
  } catch (err) {
    console.error('Failed to serve public band logo:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
