import { Router } from 'express';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bands, users } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { getBandStorageKeys, getBandStorageUsageBytes, resolveStorageQuotaBytes } from '../lib/storageQuota.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';

/** Admin-only user management (listing + storage quota assignment), mounted at /api/admin/users. */
export const adminUsersRouter = Router();
adminUsersRouter.use(requireAuth, requireAdmin);

adminUsersRouter.get('/', async (_req, res) => {
  try {
    const userRows = await db.select().from(users);
    const bandRows = await db.select({ id: bands.id, ownerId: bands.ownerId }).from(bands);

    const bandsByOwner = new Map<string, string[]>();
    for (const band of bandRows) {
      const list = bandsByOwner.get(band.ownerId) ?? [];
      list.push(band.id);
      bandsByOwner.set(band.ownerId, list);
    }

    const list = await Promise.all(
      userRows.map(async (row) => {
        const ownedBandIds = bandsByOwner.get(row.id) ?? [];
        const usageByBand = await Promise.all(ownedBandIds.map((id) => getBandStorageUsageBytes(id)));
        const usedBytes = usageByBand.reduce((sum, n) => sum + n, 0);

        return {
          id: row.id,
          email: row.email,
          username: row.username,
          fullName: row.fullName,
          role: row.role,
          createdAt: row.createdAt.toISOString(),
          storageQuotaBytes: resolveStorageQuotaBytes(row.storageQuotaBytes),
          hasCustomQuota: row.storageQuotaBytes != null,
          usedBytes,
          ownedBandCount: ownedBandIds.length,
        };
      }),
    );

    res.json({ users: list });
  } catch (err) {
    console.error('Failed to list users:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

adminUsersRouter.patch('/:id/quota', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    // null clears the override (falls back to the default); otherwise must be a positive integer byte count.
    let storageQuotaBytes: number | null;
    if (body.storageQuotaBytes === null) {
      storageQuotaBytes = null;
    } else if (typeof body.storageQuotaBytes === 'number' && Number.isInteger(body.storageQuotaBytes) && body.storageQuotaBytes > 0) {
      storageQuotaBytes = body.storageQuotaBytes;
    } else {
      res.status(400).json({ error: 'storageQuotaBytes must be a positive integer, or null to reset to the default.' });
      return;
    }

    const [row] = await db.update(users).set({ storageQuotaBytes }).where(eq(users.id, req.params.id)).returning();
    if (!row) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({
      id: row.id,
      storageQuotaBytes: resolveStorageQuotaBytes(row.storageQuotaBytes),
      hasCustomQuota: row.storageQuotaBytes != null,
    });
  } catch (err) {
    console.error('Failed to update user quota:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/**
 * Promotes or demotes a user's site-wide admin role. Separate from band ownership, which is
 * unconditional (whoever creates a band owns it — see bands.ts) and unaffected by this. Guards
 * against self-service role changes and against demoting the last remaining admin, since either
 * would risk locking the instance out of its own admin panel.
 */
adminUsersRouter.patch('/:id/role', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.role !== 'member' && body.role !== 'admin') {
      res.status(400).json({ error: 'role must be "member" or "admin".' });
      return;
    }

    if (req.params.id === req.userId) {
      res.status(400).json({ error: 'You cannot change your own admin role. Ask another admin.' });
      return;
    }

    if (body.role === 'member') {
      const otherAdminRows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'admin'), ne(users.id, req.params.id)))
        .limit(1);
      if (!otherAdminRows[0]) {
        res.status(400).json({ error: 'At least one admin must remain.' });
        return;
      }
    }

    const [row] = await db.update(users).set({ role: body.role }).where(eq(users.id, req.params.id)).returning();
    if (!row) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({ id: row.id, role: row.role });
  } catch (err) {
    console.error('Failed to update user role:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/**
 * Deletes a user and every file they're solely responsible for: bands they own cascade-delete
 * in the DB via FK (songs, attachments, recordings, press kit images, logos, invites, etc.),
 * but the underlying files in ATTACHMENTS_DIR don't disappear on their own — those are removed
 * here first, before the DB row (and its cascade) goes. Bands the user merely belongs to (not
 * owns) are untouched; only their membership row is removed.
 */
adminUsersRouter.delete('/:id', async (req, res) => {
  try {
    if (req.params.id === req.userId) {
      res.status(400).json({ error: 'Use account deletion in your profile to delete your own account.' });
      return;
    }

    const userRows = await db.select({ id: users.id }).from(users).where(eq(users.id, req.params.id)).limit(1);
    if (!userRows[0]) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const ownedBandRows = await db.select({ id: bands.id }).from(bands).where(eq(bands.ownerId, req.params.id));
    const keysByBand = await Promise.all(ownedBandRows.map((band) => getBandStorageKeys(band.id)));
    const allKeys = keysByBand.flat();

    await Promise.all(allKeys.map((key) => localStorageAdapter.delete(key)));

    await db.delete(users).where(eq(users.id, req.params.id));

    res.json({});
  } catch (err) {
    console.error('Failed to delete user:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
