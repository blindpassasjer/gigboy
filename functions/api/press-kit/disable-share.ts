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

  const body = await ctx.request.json<Record<string, unknown>>().catch(() => null);
  if (!body) return Response.json({ error: 'Invalid request body.' }, { status: 400 });

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const bandId = typeof body.bandId === 'string' ? body.bandId.trim() : '';
  if (!token || !bandId) {
    return Response.json({ error: 'token and bandId are required.' }, { status: 400 });
  }

  const [band, share] = await Promise.all([
    getFirestoreDocument(ctx.env, ['bands', bandId]),
    getFirestoreDocument(ctx.env, ['pressKitShares', token]),
  ]);
  if (!band) return Response.json({ error: 'Band not found.' }, { status: 404 });

  const ownerId = typeof band.ownerId === 'string' ? band.ownerId : '';
  const memberRoles = (band.memberRoles ?? {}) as Record<string, string>;
  const canEdit = ownerId === userId || memberRoles[userId] === 'editor';
  if (!canEdit) {
    return Response.json({ error: 'Only band editors can disable a press kit share.' }, { status: 403 });
  }

  if (!share || share.bandId !== bandId) {
    return Response.json({ error: 'Share not found.' }, { status: 404 });
  }

  await setFirestoreDocument(ctx.env, ['pressKitShares', token], { status: 'revoked' });

  return Response.json({ ok: true });
};
