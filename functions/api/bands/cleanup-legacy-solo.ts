/// <reference types="@cloudflare/workers-types" />
import {
  deleteFirestoreDocument,
  listFirestoreDocuments,
} from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

const BAND_SUBCOLLECTIONS = ['songs', 'songLists', 'setlists', 'stageplots', 'technicalRiders', 'trashItems'] as const;
const USER_SOLO_SUBCOLLECTIONS = ['songs', 'songLists', 'setlists', 'stageplots', 'technicalRiders', 'trashItems', 'songListCategories'] as const;

async function deleteCollectionDocs(env: Record<string, string | undefined>, segments: string[]) {
  const docs = await listFirestoreDocuments(env, segments);
  await Promise.all(docs.map(async (entry) => {
    await deleteFirestoreDocument(env, [...segments, entry.id]);
  }));
  return docs.length;
}

async function deleteBandCollectionWithNested(env: Record<string, string | undefined>, bandId: string) {
  let deletedDocs = 0;

  for (const collectionName of BAND_SUBCOLLECTIONS) {
    const docs = await listFirestoreDocuments(env, ['bands', bandId, collectionName]);
    for (const entry of docs) {
      if (collectionName === 'songs') {
        deletedDocs += await deleteCollectionDocs(env, ['bands', bandId, collectionName, entry.id, 'recordings']);
      }
      await deleteFirestoreDocument(env, ['bands', bandId, collectionName, entry.id]);
      deletedDocs += 1;
    }
  }

  await deleteFirestoreDocument(env, ['bands', bandId]);
  deletedDocs += 1;
  return deletedDocs;
}

async function deleteUserSoloCollections(env: Record<string, string | undefined>, userId: string) {
  let deletedDocs = 0;

  for (const collectionName of USER_SOLO_SUBCOLLECTIONS) {
    const docs = await listFirestoreDocuments(env, ['users', userId, collectionName]);
    for (const entry of docs) {
      if (collectionName === 'songs') {
        deletedDocs += await deleteCollectionDocs(env, ['users', userId, collectionName, entry.id, 'recordings']);
        deletedDocs += await deleteCollectionDocs(env, ['users', userId, collectionName, entry.id, 'handNotes']);
      }
      await deleteFirestoreDocument(env, ['users', userId, collectionName, entry.id]);
      deletedDocs += 1;
    }
  }

  return deletedDocs;
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const allBands = await listFirestoreDocuments(ctx.env, ['bands']);
    const soloBands = allBands.filter((entry) => {
      const name = typeof entry.data.name === 'string' ? entry.data.name.trim().toLowerCase() : '';
      const ownerId = typeof entry.data.ownerId === 'string' ? entry.data.ownerId : '';
      return ownerId === userId && name === 'solo';
    });

    let deletedBandDocs = 0;
    for (const band of soloBands) {
      deletedBandDocs += await deleteBandCollectionWithNested(ctx.env, band.id);
    }

    const deletedUserDocs = await deleteUserSoloCollections(ctx.env, userId);

    return Response.json({
      ok: true,
      deletedSoloBands: soloBands.length,
      deletedBandDocs,
      deletedUserDocs,
    });
  } catch (error) {
    console.error('Failed to cleanup legacy solo data.', error);
    return Response.json({
      error: error instanceof Error ? error.message : 'Failed to cleanup legacy solo data.',
    }, { status: 500 });
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
