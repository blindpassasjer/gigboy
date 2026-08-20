import type { Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bandMembers, bands } from '../db/schema.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- standard Express request-augmentation pattern
  namespace Express {
    interface Request {
      bandRole?: string;
    }
  }
}

/** Resolves the band id from the request's `:bandId` or `:id` route param. */
function bandIdParam(req: Request): string | undefined {
  return req.params.bandId ?? req.params.id;
}

async function lookupRole(bandId: string, userId: string): Promise<string | null> {
  const rows = await db
    .select({ role: bandMembers.role })
    .from(bandMembers)
    .where(and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

/** Requires the caller to have any band_members row (owner or editor) for the route's band. */
export async function requireBandMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const bandId = bandIdParam(req);
    if (!bandId) {
      res.status(404).json({ error: 'Band not found.' });
      return;
    }
    const role = await lookupRole(bandId, req.userId!);
    if (!role) {
      res.status(403).json({ error: 'You are not a member of this band.' });
      return;
    }
    req.bandRole = role;
    next();
  } catch (err) {
    console.error('Band membership check failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

/** Requires the caller to have an 'editor' band_members row for the route's band. */
export async function requireBandEditor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const bandId = bandIdParam(req);
    if (!bandId) {
      res.status(404).json({ error: 'Band not found.' });
      return;
    }
    const role = await lookupRole(bandId, req.userId!);
    if (!role) {
      res.status(403).json({ error: 'You are not a member of this band.' });
      return;
    }
    if (role !== 'editor') {
      res.status(403).json({ error: 'Editor role required.' });
      return;
    }
    req.bandRole = role;
    next();
  } catch (err) {
    console.error('Band editor check failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

/** Requires the caller to be the owning user of the route's band — stricter than editor. */
export async function requireBandOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const bandId = bandIdParam(req);
    if (!bandId) {
      res.status(404).json({ error: 'Band not found.' });
      return;
    }
    const rows = await db.select({ ownerId: bands.ownerId }).from(bands).where(eq(bands.id, bandId)).limit(1);
    if (!rows[0]) {
      res.status(404).json({ error: 'Band not found.' });
      return;
    }
    if (rows[0].ownerId !== req.userId) {
      res.status(403).json({ error: 'Only the band owner can do this.' });
      return;
    }
    next();
  } catch (err) {
    console.error('Band owner check failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
