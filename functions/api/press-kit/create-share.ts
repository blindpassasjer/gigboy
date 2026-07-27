/// <reference types="@cloudflare/workers-types" />
import { generateToken } from '../../_helpers/auth';
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';
import { resolveBandHasProOrCrew } from '../../_helpers/band-limits';

interface Data extends Record<string, unknown> {
  userId?: string;
}

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function asStringArray(value: unknown, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, maxLength);
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await ctx.request.json<Record<string, unknown>>().catch((err) => {
    console.error('Failed to parse request body:', err);
    return null;
  });
  if (!body) return Response.json({ error: 'Invalid request body.' }, { status: 400 });

  const bandId = cleanString(body.bandId, 120);
  if (!bandId) {
    return Response.json({ error: 'bandId is required.' }, { status: 400 });
  }

  const kitId = cleanString(body.kitId, 120);
  if (!kitId) {
    return Response.json({ error: 'kitId is required.' }, { status: 400 });
  }

  const bandDoc = await getFirestoreDocument(ctx.env, ['bands', bandId]);
  if (!bandDoc) {
    return Response.json({ error: 'Band not found.' }, { status: 404 });
  }

  const ownerId = typeof bandDoc.ownerId === 'string' ? bandDoc.ownerId : '';
  const memberRoles =
    typeof bandDoc.memberRoles === 'object' && bandDoc.memberRoles !== null
      ? (bandDoc.memberRoles as Record<string, unknown>)
      : {};
  const canEdit = ownerId === userId || memberRoles[userId] === 'editor';
  if (!canEdit) {
    return Response.json({ error: 'Only band editors can create a press kit share.' }, { status: 403 });
  }

  const kitDoc = await getFirestoreDocument(ctx.env, ['bands', bandId, 'pressKits', kitId]);
  if (!kitDoc) {
    return Response.json({ error: 'Press kit not found.' }, { status: 404 });
  }

  const hasProOrCrew = await resolveBandHasProOrCrew(ctx.env, ownerId, bandId);
  if (!hasProOrCrew) {
    return Response.json(
      { error: 'Shareable public links require a Pro or Crew plan for this band.' },
      { status: 403 }
    );
  }

  const selectedStageplotIds = asStringArray(body.selectedStageplotIds, 100);
  const selectedRiderIds = asStringArray(body.selectedRiderIds, 100);

  const token = generateToken();
  const now = new Date().toISOString();

  await setFirestoreDocument(ctx.env, ['pressKitShares', token], {
    token,
    status: 'active',
    bandId,
    kitId,
    selectedStageplotIds,
    selectedRiderIds,
    createdBy: userId,
    createdAt: now,
  });

  const url = new URL(ctx.request.url);
  const publicUrl = `${url.origin}/public/press-kit/${token}`;

  return Response.json({ ok: true, token, publicUrl });
};
