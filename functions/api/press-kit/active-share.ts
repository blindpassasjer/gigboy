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

  const band = await getFirestoreDocument(ctx.env, ['bands', bandId]);
  if (!band) return Response.json({ error: 'Band not found.' }, { status: 404 });

  const ownerId = typeof band.ownerId === 'string' ? band.ownerId : '';
  const memberRoles = (band.memberRoles ?? {}) as Record<string, string>;
  const canView = ownerId === userId || memberRoles[userId] !== undefined;
  if (!canView) return Response.json({ error: 'Forbidden.' }, { status: 403 });

  const shares = await queryFirestoreDocumentsByField(ctx.env, 'pressKitShares', 'bandId', bandId);

  const now = Date.now();
  const active = shares
    .filter((s) => {
      const expiresAt = typeof s.data.expiresAt === 'string' ? Date.parse(s.data.expiresAt) : 0;
      return expiresAt > now;
    })
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
      expiresAt: active.data.expiresAt,
      createdAt: active.data.createdAt,
    },
  });
};
