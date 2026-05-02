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

  const body = await ctx.request.json<{ bandId?: string; memberId?: string; role?: string }>().catch(() => null);
  if (!body) return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  const bandId = body.bandId?.trim() ?? '';
  const memberId = body.memberId?.trim() ?? '';
  const role = body.role?.trim() ?? '';

  if (!bandId || !memberId || !role) {
    return Response.json({ error: 'bandId, memberId, and role are required.' }, { status: 400 });
  }

  if (role !== 'viewer' && role !== 'editor') {
    return Response.json({ error: 'Role must be "viewer" or "editor".' }, { status: 400 });
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

  if (ownerId !== userId) {
    return Response.json({ error: 'Only the band owner can change member roles.' }, { status: 403 });
  }

  if (memberId === ownerId) {
    return Response.json({ error: 'The band owner role cannot be changed.' }, { status: 409 });
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

  memberRoles[memberId] = role;

  await setFirestoreDocument(ctx.env, bandPath, {
    ...band,
    memberRoles,
    updatedAt: new Date().toISOString(),
  });

  return Response.json({ ok: true });
};
