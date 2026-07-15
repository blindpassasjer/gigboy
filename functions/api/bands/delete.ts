/// <reference types="@cloudflare/workers-types" />
import {
  deleteFirestoreDocument,
  getFirestoreDocument,
  listFirestoreDocuments,
} from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  try {
    const userId = ctx.data.userId;
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await ctx.request.json<{ bandId?: string }>();
    const bandId = body.bandId?.trim() ?? '';

    if (!bandId) {
      return Response.json({ error: 'bandId is required.' }, { status: 400 });
    }

    const bandPath = ['bands', bandId];
    const band = await getFirestoreDocument(ctx.env, bandPath);
    if (!band) {
      return Response.json({ error: 'Band not found.' }, { status: 404 });
    }

    if (band.ownerId !== userId) {
      return Response.json({ error: 'Only the owner can delete this band.' }, { status: 403 });
    }

    const bandSongs = await listFirestoreDocuments(ctx.env, ['bands', bandId, 'songs']);
    await Promise.all(
      bandSongs.map((song) => deleteFirestoreDocument(ctx.env, ['bands', bandId, 'songs', song.id]))
    );

    await deleteFirestoreDocument(ctx.env, bandPath);

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete band.', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to delete band.',
      },
      { status: 500 }
    );
  }
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