/// <reference types="@cloudflare/workers-types" />
import {
  deleteFirebaseAuthUser,
  deleteFirebaseStorageObject,
  deleteFirebaseStoragePrefix,
  deleteFirestoreDocument,
  getFirestoreDocument,
  listFirestoreDocuments,
  setFirestoreDocument,
} from '../../_helpers/firebase-admin';
import { getStripeClient } from '../../_helpers/stripe';

interface Data extends Record<string, unknown> {
  userId?: string;
}

const BAND_SUBCOLLECTIONS = ['songs', 'songLists', 'setlists', 'stageplots', 'technicalRiders', 'trashItems', 'pressKits', 'pressKitImages'] as const;
const USER_SUBCOLLECTIONS = ['songs', 'songLists', 'setlists', 'stageplots', 'technicalRiders', 'trashItems', 'songListCategories'] as const;

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readRecorderUserId(recording: Record<string, unknown>): string | null {
  const recorder = recording.recorder;
  if (!recorder || typeof recorder !== 'object') return null;
  const recorderData = recorder as Record<string, unknown>;
  return asNonEmptyString(recorderData.userId);
}

async function deleteStoragePathsFromData(
  env: Record<string, string | undefined>,
  data: Record<string, unknown>,
  preferredBucket?: string,
) {
  let deletedStorageObjects = 0;
  let bucketName = preferredBucket ?? '';

  const candidates = [
    asNonEmptyString(data.storagePath),
    asNonEmptyString(data.thumbStoragePath),
    asNonEmptyString(data.logoStoragePath),
  ].filter((value): value is string => Boolean(value));

  for (const objectPath of candidates) {
    const result = await deleteFirebaseStorageObject(env, objectPath, bucketName || undefined);
    bucketName = result.bucketName;
    if (result.deleted) deletedStorageObjects += 1;
  }

  return {
    deletedStorageObjects,
    bucketName,
  };
}

async function deleteCollectionDocs(env: Record<string, string | undefined>, segments: string[]) {
  const docs = await listFirestoreDocuments(env, segments);
  await Promise.all(docs.map(async (entry) => {
    await deleteFirestoreDocument(env, [...segments, entry.id]);
  }));
  return docs.length;
}

async function deleteBandWithSubcollections(
  env: Record<string, string | undefined>,
  bandId: string,
  preferredBucket?: string,
) {
  let deletedDocs = 0;
  const prefixResult = await deleteFirebaseStoragePrefix(env, `bands/${bandId}/`, preferredBucket);
  const deletedStorageObjects = prefixResult.deletedCount;
  const bucketName = prefixResult.bucketName;

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
  return {
    deletedDocs,
    deletedStorageObjects,
    bucketName,
  };
}

async function deleteUserSubcollections(
  env: Record<string, string | undefined>,
  userId: string,
  preferredBucket?: string,
) {
  let deletedDocs = 0;
  const prefixResult = await deleteFirebaseStoragePrefix(env, `users/${userId}/`, preferredBucket);
  const deletedStorageObjects = prefixResult.deletedCount;
  const bucketName = prefixResult.bucketName;

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

  return {
    deletedDocs,
    deletedStorageObjects,
    bucketName,
  };
}

async function deleteUserArtifactsFromSurvivingBand(
  env: Record<string, string | undefined>,
  bandId: string,
  userId: string,
  preferredBucket?: string,
) {
  let deletedDocs = 0;
  let deletedStorageObjects = 0;
  let bucketName = preferredBucket ?? '';

  const removedImageIds = new Set<string>();
  const pressKitImages = await listFirestoreDocuments(env, ['bands', bandId, 'pressKitImages']);
  for (const image of pressKitImages) {
    const createdBy = asNonEmptyString(image.data.createdBy);
    if (createdBy !== userId) continue;

    const storageResult = await deleteStoragePathsFromData(env, image.data, bucketName || undefined);
    deletedStorageObjects += storageResult.deletedStorageObjects;
    bucketName = storageResult.bucketName || bucketName;

    await deleteFirestoreDocument(env, ['bands', bandId, 'pressKitImages', image.id]);
    removedImageIds.add(image.id);
    deletedDocs += 1;
  }

  if (removedImageIds.size > 0) {
    const pressKits = await listFirestoreDocuments(env, ['bands', bandId, 'pressKits']);
    for (const pressKit of pressKits) {
      const imageIds = Array.isArray(pressKit.data.imageIds)
        ? pressKit.data.imageIds.filter((entry): entry is string => typeof entry === 'string')
        : [];
      const nextImageIds = imageIds.filter((id) => !removedImageIds.has(id));
      if (nextImageIds.length === imageIds.length) continue;

      await setFirestoreDocument(env, ['bands', bandId, 'pressKits', pressKit.id], {
        imageIds: nextImageIds,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const songs = await listFirestoreDocuments(env, ['bands', bandId, 'songs']);
  for (const song of songs) {
    const recordings = await listFirestoreDocuments(env, ['bands', bandId, 'songs', song.id, 'recordings']);
    for (const recording of recordings) {
      if (readRecorderUserId(recording.data) !== userId) continue;

      const storageResult = await deleteStoragePathsFromData(env, recording.data, bucketName || undefined);
      deletedStorageObjects += storageResult.deletedStorageObjects;
      bucketName = storageResult.bucketName || bucketName;

      await deleteFirestoreDocument(env, ['bands', bandId, 'songs', song.id, 'recordings', recording.id]);
      deletedDocs += 1;
    }
  }

  return {
    deletedDocs,
    deletedStorageObjects,
    bucketName,
  };
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
    try {
      await deleteFirebaseAuthUser(ctx.env, userId);
    } catch (authErr) {
      console.error('Failed to delete Firebase Auth user:', authErr);
      return Response.json({
        error: authErr instanceof Error
          ? `Failed to delete Firebase Auth account: ${authErr.message}`
          : 'Failed to delete Firebase Auth account.',
      }, { status: 500 });
    }

    const userProfile = await getFirestoreDocument(ctx.env, ['users', userId]);
    const usernameLower = typeof userProfile?.usernameLower === 'string' ? userProfile.usernameLower : null;

    const stripeCustomerId = typeof userProfile?.stripeCustomerId === 'string' && userProfile.stripeCustomerId.trim()
      ? userProfile.stripeCustomerId.trim()
      : null;

    if (stripeCustomerId && ctx.env.STRIPE_SECRET_KEY) {
      const stripe = getStripeClient(ctx.env.STRIPE_SECRET_KEY);
      const subscriptions = await stripe.subscriptions.list({ customer: stripeCustomerId, limit: 20 });
      await Promise.all(subscriptions.data.map((sub) => stripe.subscriptions.cancel(sub.id)));
    }

    const allBands = await listFirestoreDocuments(ctx.env, ['bands']);
    const ownedBands = allBands.filter((entry) => entry.data.ownerId === userId);
    const memberBands = allBands.filter((entry) => {
      const memberIds = Array.isArray(entry.data.memberIds)
        ? entry.data.memberIds.filter((value): value is string => typeof value === 'string')
        : [];
      return memberIds.includes(userId);
    });

    let deletedBandDocs = 0;
    let deletedStorageObjects = 0;
    let deletedUserBandArtifacts = 0;
    let storageBucketName = '';

    for (const band of ownedBands) {
      const result = await deleteBandWithSubcollections(ctx.env, band.id, storageBucketName || undefined);
      deletedBandDocs += result.deletedDocs;
      deletedStorageObjects += result.deletedStorageObjects;
      storageBucketName = result.bucketName;
    }

    const survivingMemberBands = memberBands.filter((entry) => !ownedBands.some((owned) => owned.id === entry.id));
    for (const band of survivingMemberBands) {
      const cleanupResult = await deleteUserArtifactsFromSurvivingBand(
        ctx.env,
        band.id,
        userId,
        storageBucketName || undefined,
      );
      deletedUserBandArtifacts += cleanupResult.deletedDocs;
      deletedStorageObjects += cleanupResult.deletedStorageObjects;
      if (cleanupResult.bucketName) {
        storageBucketName = cleanupResult.bucketName;
      }
    }

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

    const [bandInvites, collaborationInvites, pressKitShares] = await Promise.all([
      listFirestoreDocuments(ctx.env, ['bandInvites']),
      listFirestoreDocuments(ctx.env, ['collaborationInvites']),
      listFirestoreDocuments(ctx.env, ['pressKitShares']),
    ]);

    const ownedBandIds = new Set(ownedBands.map((band) => band.id));

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

    const pressKitSharesToDelete = pressKitShares.filter((entry) => {
      const createdBy = asNonEmptyString(entry.data.createdBy);
      if (createdBy === userId) return true;

      const bandId = asNonEmptyString(entry.data.bandId);
      return Boolean(bandId && ownedBandIds.has(bandId));
    });

    await Promise.all([
      ...bandInvitesToDelete.map((entry) => deleteFirestoreDocument(ctx.env, ['bandInvites', entry.id])),
      ...collaborationInvitesToDelete.map((entry) => deleteFirestoreDocument(ctx.env, ['collaborationInvites', entry.id])),
      ...pressKitSharesToDelete.map((entry) => deleteFirestoreDocument(ctx.env, ['pressKitShares', entry.id])),
    ]);

    const userCleanup = await deleteUserSubcollections(ctx.env, userId, storageBucketName || undefined);
    deletedStorageObjects += userCleanup.deletedStorageObjects;
    if (userCleanup.bucketName) {
      storageBucketName = userCleanup.bucketName;
    }
    const deletedUserDocs = userCleanup.deletedDocs;

    await deleteFirestoreDocument(ctx.env, ['users', userId]);
    if (usernameLower) {
      await deleteFirestoreDocument(ctx.env, ['usernames', usernameLower]);
    }

    return Response.json({
      ok: true,
      deletedBands: ownedBands.length,
      deletedBandDocs,
      deletedUserDocs,
      deletedUserBandArtifacts,
      deletedStorageObjects,
      storageBucketName,
      updatedMemberships: survivingMemberBands.length,
      deletedBandInvites: bandInvitesToDelete.length,
      deletedCollaborationInvites: collaborationInvitesToDelete.length,
      deletedPressKitShares: pressKitSharesToDelete.length,
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
