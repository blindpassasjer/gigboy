/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await ctx.request.json<{ bandId?: string; memberId?: string }>();
  const bandId = body.bandId?.trim() ?? '';
  const memberId = body.memberId?.trim() ?? '';

  if (!bandId || !memberId) {
    return Response.json({ error: 'bandId and memberId are required.' }, { status: 400 });
  }

  const bandPath = ['bands', bandId];
  const band = await getFirestoreDocument(ctx.env, bandPath);
  if (!band) {
    return Response.json({ error: 'Band not found.' }, { status: 404 });
  }

  const ownerId = typeof band.ownerId === 'string' ? band.ownerId : null;
  if (!ownerId) {
    return Response.json({ error: 'Band owner is missing.' }, { status: 400 });
  }

  const actingAsOwner = ownerId === userId;
  const leavingSelf = memberId === userId;
  if (!actingAsOwner && !leavingSelf) {
    return Response.json({ error: 'Only the owner can remove other members.' }, { status: 403 });
  }

  if (memberId === ownerId) {
    return Response.json({ error: 'The band owner cannot be removed.' }, { status: 409 });
  }

  const memberIds = Array.isArray(band.memberIds)
    ? band.memberIds.filter((entry): entry is string => typeof entry === 'string')
    : [];
  if (!memberIds.includes(memberId)) {
    return Response.json({ error: 'Member not found in this band.' }, { status: 404 });
  }

  const memberRoles = typeof band.memberRoles === 'object' && band.memberRoles !== null
    ? { ...(band.memberRoles as Record<string, unknown>) }
    : {};
  const memberEmails = typeof band.memberEmails === 'object' && band.memberEmails !== null
    ? { ...(band.memberEmails as Record<string, unknown>) }
    : {};

  delete memberRoles[memberId];
  delete memberEmails[memberId];

  await setFirestoreDocument(ctx.env, bandPath, {
    ...band,
    memberIds: memberIds.filter((entry) => entry !== memberId),
    memberRoles,
    memberEmails,
    updatedAt: new Date().toISOString(),
  });

  return Response.json({ ok: true });
};

export const onRequest: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  if (ctx.request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: {
        Allow: 'POST',
      },
    });
  }

  return onRequestPost(ctx);
};