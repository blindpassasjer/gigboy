import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bandInvites, bandMembers, bands } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandEditor, requireBandMember } from '../middleware/bandAccess.js';
import { toBandApi } from '../lib/band.js';
import { resolveOrigin } from '../lib/http.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const bandsRouter = Router();
bandsRouter.use(requireAuth);

bandsRouter.get('/', async (req, res) => {
  try {
    const rows = await db
      .select({ band: bands })
      .from(bandMembers)
      .innerJoin(bands, eq(bandMembers.bandId, bands.id))
      .where(eq(bandMembers.userId, req.userId!));
    const result = await Promise.all(rows.map((r) => toBandApi(r.band)));
    res.json({ bands: result });
  } catch (err) {
    console.error('Failed to list bands:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandsRouter.post('/', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'Band name is required.' });
      return;
    }
    const id = crypto.randomUUID();
    const [row] = await db
      .insert(bands)
      .values({
        id,
        name,
        description: (body.description as string | undefined) ?? null,
        icon: (body.icon as string | undefined) ?? null,
        ownerId: req.userId!,
      })
      .returning();

    await db.insert(bandMembers).values({
      bandId: id,
      userId: req.userId!,
      role: 'editor',
    });

    res.json({ band: await toBandApi(row) });
  } catch (err) {
    console.error('Failed to create band:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandsRouter.put('/:id', requireBandEditor, async (req, res) => {
  try {
    const existing = await db.select().from(bands).where(eq(bands.id, req.params.id)).limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: 'Band not found.' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === 'string' && body.name.trim()) values.name = body.name.trim();
    if ('description' in body) values.description = (body.description as string | undefined) ?? null;
    if ('icon' in body) values.icon = (body.icon as string | undefined) ?? null;

    const [row] = await db.update(bands).set(values).where(eq(bands.id, req.params.id)).returning();
    res.json({ band: await toBandApi(row) });
  } catch (err) {
    console.error('Failed to update band:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandsRouter.delete('/:id', async (req, res) => {
  try {
    const existing = await db.select().from(bands).where(eq(bands.id, req.params.id)).limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: 'Band not found.' });
      return;
    }
    if (existing[0].ownerId !== req.userId) {
      res.status(403).json({ error: 'Only the band owner can delete the band.' });
      return;
    }
    // ON DELETE CASCADE removes band_members, band_invites, and any songs/song_lists/setlists with this band_id.
    await db.delete(bands).where(eq(bands.id, req.params.id));
    res.json({});
  } catch (err) {
    console.error('Failed to delete band:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandsRouter.post('/:id/invite-link', requireBandEditor, async (req, res) => {
  try {
    const bandId = req.params.id;
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await db.insert(bandInvites).values({
      id,
      bandId,
      inviterId: req.userId!,
      role: 'editor',
      status: 'pending',
      expiresAt,
    });

    const origin = resolveOrigin(req);
    res.json({
      inviteId: id,
      inviteUrl: `${origin}/profile/invites?bandInvite=${id}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('Failed to create invite link:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandsRouter.post('/invites/:inviteId/accept', async (req, res) => {
  try {
    const invites = await db
      .select()
      .from(bandInvites)
      .where(eq(bandInvites.id, req.params.inviteId))
      .limit(1);
    const invite = invites[0];
    if (!invite) {
      res.status(404).json({ error: 'Invite not found.' });
      return;
    }
    if (invite.status === 'revoked') {
      res.status(409).json({ error: 'This invite has been revoked.' });
      return;
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      res.status(410).json({ error: 'This invite has expired.' });
      return;
    }

    // Idempotent upsert: accepting twice is a no-op, not an error. Invite row is left untouched
    // (stays 'pending' and reusable) — intentional, matches current Firestore behavior.
    await db
      .insert(bandMembers)
      .values({ bandId: invite.bandId, userId: req.userId!, role: invite.role })
      .onConflictDoNothing();

    const bandRows = await db.select().from(bands).where(eq(bands.id, invite.bandId)).limit(1);
    if (!bandRows[0]) {
      res.status(404).json({ error: 'Band not found.' });
      return;
    }
    res.json({ band: await toBandApi(bandRows[0]) });
  } catch (err) {
    console.error('Failed to accept invite:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandsRouter.delete('/:id/members/:userId', requireBandMember, async (req, res) => {
  try {
    const bandId = req.params.id;
    const targetUserId = req.params.userId;

    const existing = await db.select().from(bands).where(eq(bands.id, bandId)).limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: 'Band not found.' });
      return;
    }
    const isOwner = existing[0].ownerId === req.userId;
    const isSelf = targetUserId === req.userId;

    if (targetUserId === existing[0].ownerId) {
      res.status(409).json({ error: 'The band owner cannot be removed.' });
      return;
    }
    if (!isOwner && !isSelf) {
      res.status(403).json({ error: 'Only the band owner can remove other members.' });
      return;
    }

    await db
      .delete(bandMembers)
      .where(and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, targetUserId)));
    res.json({});
  } catch (err) {
    console.error('Failed to remove band member:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
