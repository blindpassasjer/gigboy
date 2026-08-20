import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bands, users } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { getBandStorageUsageBytes, resolveStorageQuotaBytes } from '../lib/storageQuota.js';

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
