import { Router } from 'express';
import type { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pressKitShares } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandEditor, requireBandMember } from '../middleware/bandAccess.js';
import { loadBandPressKit } from './bandPressKits.js';
import { resolveOrigin } from '../lib/http.js';

type ShareRow = typeof pressKitShares.$inferSelect;

function shareToApi(req: Request, row: ShareRow) {
  const origin = resolveOrigin(req);
  return {
    token: row.token,
    publicUrl: `${origin}/public/press-kit/${row.token}`,
  };
}

async function findActiveShare(bandId: string, kitId: string): Promise<ShareRow | null> {
  const rows = await db
    .select()
    .from(pressKitShares)
    .where(
      and(
        eq(pressKitShares.bandId, bandId),
        eq(pressKitShares.kitId, kitId),
        eq(pressKitShares.status, 'active'),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export const bandPressKitSharesRouter = Router({ mergeParams: true });
bandPressKitSharesRouter.use(requireAuth);

bandPressKitSharesRouter.get('/:id/share', requireBandMember, async (req, res) => {
  try {
    const kit = await loadBandPressKit(req.params.bandId, req.params.id);
    if (!kit) {
      res.status(404).json({ error: 'Press kit not found.' });
      return;
    }
    const share = await findActiveShare(req.params.bandId, req.params.id);
    res.json({ share: share ? shareToApi(req, share) : null });
  } catch (err) {
    console.error('Failed to load press kit share:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandPressKitSharesRouter.post('/:id/share', requireBandEditor, async (req, res) => {
  try {
    const kit = await loadBandPressKit(req.params.bandId, req.params.id);
    if (!kit) {
      res.status(404).json({ error: 'Press kit not found.' });
      return;
    }
    const existing = await findActiveShare(req.params.bandId, req.params.id);
    if (existing) {
      res.json({ share: shareToApi(req, existing) });
      return;
    }
    const [row] = await db
      .insert(pressKitShares)
      .values({
        token: crypto.randomUUID(),
        bandId: req.params.bandId,
        kitId: req.params.id,
        status: 'active',
        createdBy: req.userId!,
      })
      .returning();
    res.json({ share: shareToApi(req, row) });
  } catch (err) {
    console.error('Failed to create press kit share:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandPressKitSharesRouter.post('/:id/share/disable', requireBandEditor, async (req, res) => {
  try {
    const kit = await loadBandPressKit(req.params.bandId, req.params.id);
    if (!kit) {
      res.status(404).json({ error: 'Press kit not found.' });
      return;
    }
    const existing = await findActiveShare(req.params.bandId, req.params.id);
    if (existing) {
      await db.update(pressKitShares).set({ status: 'revoked' }).where(eq(pressKitShares.token, existing.token));
    }
    res.json({});
  } catch (err) {
    console.error('Failed to disable press kit share:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
