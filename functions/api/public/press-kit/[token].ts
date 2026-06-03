/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument } from '../../../_helpers/firebase-admin';

export const onRequestGet: PagesFunction<Record<string, string | undefined>> = async (ctx) => {
  const token = (ctx.params.token ?? '').trim();
  if (!token) {
    return Response.json({ error: 'Token is required.' }, { status: 400 });
  }

  const share = await getFirestoreDocument(ctx.env, ['pressKitShares', token]);
  if (!share || share.status !== 'active') {
    return Response.json({ error: 'Press kit not found.' }, { status: 404 });
  }

  if (typeof share.expiresAt === 'string') {
    const expiresAtMs = Date.parse(share.expiresAt);
    if (!Number.isNaN(expiresAtMs) && expiresAtMs < Date.now()) {
      return Response.json({ error: 'This press kit link has expired.' }, { status: 410 });
    }
  }

  const snapshot =
    typeof share.snapshot === 'object' && share.snapshot !== null
      ? (share.snapshot as Record<string, unknown>)
      : {};

  return Response.json({
    bandId: typeof share.bandId === 'string' ? share.bandId : '',
    bandName: typeof share.bandName === 'string' ? share.bandName : 'Band',
    bandLogo: typeof share.bandLogo === 'string' ? share.bandLogo : undefined,
    pressKitIcon: typeof share.pressKitIcon === 'string' ? share.pressKitIcon : undefined,
    createdAt: typeof share.createdAt === 'string' ? share.createdAt : undefined,
    stageplots: Array.isArray(snapshot.stageplots) ? snapshot.stageplots : [],
    riders: Array.isArray(snapshot.riders) ? snapshot.riders : [],
    texts: Array.isArray(snapshot.texts) ? snapshot.texts : [],
    images: Array.isArray(snapshot.images) ? snapshot.images : [],
    videoUrls: Array.isArray(snapshot.videoUrls) ? snapshot.videoUrls : [],
    generatedAt: typeof snapshot.generatedAt === 'string' ? snapshot.generatedAt : undefined,
  });
};
