/// <reference types="@cloudflare/workers-types" />
import {
  deleteFirestoreDocument,
  getFirestoreDocument,
  listFirestoreDocuments,
  setFirestoreDocument,
} from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

const BAND_SUBCOLLECTIONS = ['songs', 'songLists', 'setlists', 'stageplots', 'technicalRiders', 'trashItems'] as const;
const USER_SUBCOLLECTIONS = ['songs', 'songLists', 'setlists', 'stageplots', 'technicalRiders', 'trashItems', 'songListCategories'] as const;

async function deleteCollectionDocs(env: Record<string, string | undefined>, segments: string[]) {
  const docs = await listFirestoreDocuments(env, segments);
  await Promise.all(docs.map(async (entry) => {
    await deleteFirestoreDocument(env, [...segments, entry.id]);
  }));
  return docs.length;
}

async function deleteBandWithSubcollections(env: Record<string, string | undefined>, bandId: string) {
  let deletedDocs = 0;

  for (const collectionName of BAND_SUBCOLLECTIONS) {
    const docs = await listFirestoreDocuments(env, ['bands', bandId, collectionName]);
    for (const entry of docs) {
      if (collectionName === 'songs') {
        deletedDocs += await deleteCollectionDocs(env, ['bands', bandId, collectionName, entry.id, 'recordings']);
        deletedDocs += await deleteCollectionDocs(env, ['bands', bandId, collectionName, entry.id, 'handNotes']);
      }
      await deleteFirestoreDocument(env, ['bands', bandId, collectionName, entry.id]);
      deletedDocs += 1;
    }
  }

  await deleteFirestoreDocument(env, ['bands', bandId]);
  deletedDocs += 1;
  return deletedDocs;
}

async function deleteUserSubcollections(env: Record<string, string | undefined>, userId: string) {
  let deletedDocs = 0;

  for (const collectionName of USER_SUBCOLLECTIONS) {
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

function stripUserFromBandMaps(record: Record<string, unknown>, userId: string) {
  const next = { ...record };
  delete next[userId];
  return next;
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userProfile = await getFirestoreDocument(ctx.env, ['users', userId]);
    const usernameLower = typeof userProfile?.usernameLower === 'string' ? userProfile.usernameLower : null;

    const allBands = await listFirestoreDocuments(ctx.env, ['bands']);
    const ownedBands = allBands.filter((entry) => entry.data.ownerId === userId);
    const memberBands = allBands.filter((entry) => {
      const memberIds = Array.isArray(entry.data.memberIds)
        ? entry.data.memberIds.filter((value): value is string => typeof value === 'string')
        : [];
      return memberIds.includes(userId);
    });

    let deletedBandDocs = 0;
    for (const band of ownedBands) {
      deletedBandDocs += await deleteBandWithSubcollections(ctx.env, band.id);
    }

    const survivingMemberBands = memberBands.filter((entry) => !ownedBands.some((owned) => owned.id === entry.id));
    await Promise.all(survivingMemberBands.map(async (band) => {
      const memberIds = Array.isArray(band.data.memberIds)
        ? band.data.memberIds.filter((value): value is string => typeof value === 'string' && value !== userId)
        : [];

      const memberRoles = typeof band.data.memberRoles === 'object' && band.data.memberRoles !== null
        ? stripUserFromBandMaps(band.data.memberRoles as Record<string, unknown>, userId)
        : {};
      const memberEmails = typeof band.data.memberEmails === 'object' && band.data.memberEmails !== null
        ? stripUserFromBandMaps(band.data.memberEmails as Record<string, unknown>, userId)
        : {};
      const memberUsernames = typeof band.data.memberUsernames === 'object' && band.data.memberUsernames !== null
        ? stripUserFromBandMaps(band.data.memberUsernames as Record<string, unknown>, userId)
        : {};
      const memberFullNames = typeof band.data.memberFullNames === 'object' && band.data.memberFullNames !== null
        ? stripUserFromBandMaps(band.data.memberFullNames as Record<string, unknown>, userId)
        : {};
      const memberAvatars = typeof band.data.memberAvatars === 'object' && band.data.memberAvatars !== null
        ? stripUserFromBandMaps(band.data.memberAvatars as Record<string, unknown>, userId)
        : {};

      await setFirestoreDocument(ctx.env, ['bands', band.id], {
        memberIds,
        memberRoles,
        memberEmails,
        memberUsernames,
        memberFullNames,
        memberAvatars,
        updatedAt: new Date().toISOString(),
      });
    }));

    const [bandInvites, collaborationInvites] = await Promise.all([
      listFirestoreDocuments(ctx.env, ['bandInvites']),
      listFirestoreDocuments(ctx.env, ['collaborationInvites']),
    ]);

    const bandInvitesToDelete = bandInvites.filter((entry) => {
      const inviteBandId = typeof entry.data.bandId === 'string' ? entry.data.bandId : '';
      const recipientUid = typeof entry.data.recipientUid === 'string' ? entry.data.recipientUid : '';
      return ownedBands.some((band) => band.id === inviteBandId) || recipientUid === userId;
    });

    const collaborationInvitesToDelete = collaborationInvites.filter((entry) => {
      const ownerId = typeof entry.data.ownerId === 'string' ? entry.data.ownerId : '';
      const recipientUid = typeof entry.data.recipientUid === 'string' ? entry.data.recipientUid : '';
      return ownerId === userId || recipientUid === userId;
    });

    await Promise.all([
      ...bandInvitesToDelete.map((entry) => deleteFirestoreDocument(ctx.env, ['bandInvites', entry.id])),
      ...collaborationInvitesToDelete.map((entry) => deleteFirestoreDocument(ctx.env, ['collaborationInvites', entry.id])),
    ]);

    const deletedUserDocs = await deleteUserSubcollections(ctx.env, userId);

    await deleteFirestoreDocument(ctx.env, ['users', userId]);
    if (usernameLower) {
      await deleteFirestoreDocument(ctx.env, ['usernames', usernameLower]);
    }

    return Response.json({
      ok: true,
      deletedBands: ownedBands.length,
      deletedBandDocs,
      deletedUserDocs,
      updatedMemberships: survivingMemberBands.length,
      deletedBandInvites: bandInvitesToDelete.length,
      deletedCollaborationInvites: collaborationInvitesToDelete.length,
    });
  } catch (error) {
    console.error('Failed to delete account data.', error);
    return Response.json({
      error: error instanceof Error ? error.message : 'Failed to delete account data.',
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
