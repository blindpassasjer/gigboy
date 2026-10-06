import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bandRiders, gigs, pressKits, setlists, tours } from '../db/schema.js';
import { buildBandCrudRouter } from './bandResources.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandEditor } from '../middleware/bandAccess.js';
import { removeNullish } from '../lib/serialize.js';

type GigRow = typeof gigs.$inferSelect;

const STATUSES = ['confirmed', 'tentative', 'cancelled'] as const;

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function optionalDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toApi(row: GigRow) {
  return removeNullish({
    id: row.id,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString(),
    getInAt: row.getInAt?.toISOString(),
    soundCheckAt: row.soundCheckAt?.toISOString(),
    timezone: row.timezone,
    venue: row.venue,
    address: row.address,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    notes: row.notes,
    tourId: row.tourId,
    setlistId: row.setlistId,
    pressKitId: row.pressKitId,
    riderId: row.riderId,
    status: row.status,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  });
}

function fromBody(body: Record<string, unknown>, id: string, bandId: string) {
  const status = STATUSES.find((s) => s === body.status) ?? 'confirmed';
  return {
    id,
    bandId,
    title: typeof body.title === 'string' ? body.title : '',
    // Validated non-null by validateGigBody; the fallback only satisfies the type.
    startsAt: optionalDate(body.startsAt) ?? new Date(),
    endsAt: optionalDate(body.endsAt),
    getInAt: optionalDate(body.getInAt),
    soundCheckAt: optionalDate(body.soundCheckAt),
    timezone: optionalString(body.timezone),
    venue: optionalString(body.venue),
    address: optionalString(body.address),
    contactName: optionalString(body.contactName),
    contactPhone: optionalString(body.contactPhone),
    contactEmail: optionalString(body.contactEmail),
    notes: optionalString(body.notes),
    tourId: optionalString(body.tourId),
    setlistId: optionalString(body.setlistId),
    pressKitId: optionalString(body.pressKitId),
    riderId: optionalString(body.riderId),
    status,
    updatedAt: new Date(),
  };
}

const crudRouter = buildBandCrudRouter({
  table: gigs,
  idColumn: gigs.id,
  bandIdColumn: gigs.bandId,
  resourceKey: 'gig',
  pluralKey: 'gigs',
  itemType: 'gig',
  toApi,
  fromBody,
});

/**
 * The FKs only guarantee the attached rows exist, not that they belong to this band — without this
 * check an editor could attach (and so expose via the gig) another band's tour/setlist/kit/rider by id.
 */
async function attachmentsBelongToBand(
  bandId: string,
  body: Record<string, unknown>,
): Promise<string | null> {
  const checks = [
    { key: 'tourId', table: tours, idCol: tours.id, bandCol: tours.bandId, label: 'Tour' },
    { key: 'setlistId', table: setlists, idCol: setlists.id, bandCol: setlists.bandId, label: 'Setlist' },
    { key: 'pressKitId', table: pressKits, idCol: pressKits.id, bandCol: pressKits.bandId, label: 'Press kit' },
    { key: 'riderId', table: bandRiders, idCol: bandRiders.id, bandCol: bandRiders.bandId, label: 'Technical rider' },
  ] as const;
  for (const { key, table, idCol, bandCol, label } of checks) {
    const id = optionalString(body[key]);
    if (!id) continue;
    const rows = await db.select({ id: idCol }).from(table).where(and(eq(idCol, id), eq(bandCol, bandId))).limit(1);
    if (!rows[0]) return `${label} not found in this band.`;
  }
  return null;
}

/** Rejects bad gig bodies before the CRUD handlers run (their fromBody() would otherwise paper over them). */
async function validateGigBody(req: Request, res: Response, next: NextFunction) {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.title !== 'string' || !body.title.trim()) {
      res.status(400).json({ error: 'title is required.' });
      return;
    }
    const startsAt = optionalDate(body.startsAt);
    if (startsAt === null) {
      res.status(400).json({ error: 'startsAt must be a valid date.' });
      return;
    }
    const endsAt = optionalDate(body.endsAt);
    if (endsAt !== null && endsAt.getTime() <= startsAt.getTime()) {
      res.status(400).json({ error: 'endsAt must be after startsAt.' });
      return;
    }
    const error = await attachmentsBelongToBand(req.params.bandId, body);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    next();
  } catch (err) {
    console.error('Failed to validate gig:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

// Auth and the editor check come first, so a non-member can't use the validation errors to probe which
// setlist/tour/kit/rider ids exist in someone else's band.
export const bandGigsRouter = Router({ mergeParams: true });
bandGigsRouter.use(requireAuth);
bandGigsRouter.post('/', requireBandEditor, validateGigBody);
bandGigsRouter.put('/:id', requireBandEditor, validateGigBody);
bandGigsRouter.use(crudRouter);
