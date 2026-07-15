/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, queryFirestoreDocumentsByField } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestGet: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(ctx.request.url);
  const bandId = url.searchParams.get('bandId');
  if (!bandId) return Response.json({ error: 'bandId is required.' }, { status: 400 });

  const [band, shares] = await Promise.all([
    getFirestoreDocument(ctx.env, ['bands', bandId]),
    queryFirestoreDocumentsByField(ctx.env, 'pressKitShares', 'bandId', bandId),
  ]);
  if (!band) return Response.json({ error: 'Band not found.' }, { status: 404 });

  const ownerId = typeof band.ownerId === 'string' ? band.ownerId : '';
  const memberRoles = (band.memberRoles ?? {}) as Record<string, string>;
  const canView = ownerId === userId || memberRoles[userId] !== undefined;
  if (!canView) return Response.json({ error: 'Forbidden.' }, { status: 403 });

  const active = shares
    .filter((s) => s.data.status === 'active')
    .sort((a, b) => {
      const aCreated = typeof a.data.createdAt === 'string' ? Date.parse(a.data.createdAt) : 0;
      const bCreated = typeof b.data.createdAt === 'string' ? Date.parse(b.data.createdAt) : 0;
      return bCreated - aCreated;
    })[0] ?? null;

  if (!active) return Response.json({ share: null });

  const origin = new URL(ctx.request.url).origin;
  const publicUrl = `${origin}/public/press-kit/${active.id}`;

  return Response.json({
    share: {
      token: active.id,
      publicUrl,
      createdAt: active.data.createdAt,
    },
  });
};
