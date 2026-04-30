/// <reference types="@cloudflare/workers-types" />
import {
  getFirestoreDocument,
  listFirestoreDocuments,
  setFirestoreDocument,
} from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username: string) {
  return /^[a-z0-9](?:[a-z0-9_.-]{1,22}[a-z0-9])?$/.test(username);
}

function resourceCollectionForType(resourceType: unknown) {
  if (resourceType === 'song') return 'songs';
  if (resourceType === 'songlist') return 'songLists';
  if (resourceType === 'setlist') return 'setlists';
  return null;
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerEmail = ctx.request.headers.get('x-folio-user-email')?.trim() ?? '';
  const body = await ctx.request.json<{
    recipientQuery?: string;
    recipientEmail?: string;
    resourceType?: 'song' | 'songlist' | 'setlist';
    resourceId?: string;
    resourceName?: string;
    permission?: 'viewer' | 'editor';
  }>();

  const recipientQuery = body.recipientQuery?.trim() ?? body.recipientEmail?.trim() ?? '';
  const resourceType = body.resourceType;
  const resourceId = body.resourceId?.trim() ?? '';
  const resourceName = body.resourceName?.trim() ?? '';
  const permission = body.permission === 'editor' ? 'editor' : 'viewer';

  if (!recipientQuery || !resourceType || !resourceId || !resourceName) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  if (!['song', 'songlist', 'setlist'].includes(resourceType)) {
    return Response.json({ error: 'Invalid resource type.' }, { status: 400 });
  }

  const normalizedRecipientQuery = recipientQuery.toLowerCase();
  const queryLooksLikeEmail = recipientQuery.includes('@');

  let recipientUid: string | null = null;
  let recipientUsername: string | null = null;
  let recipientUsernameLower: string | null = null;
  let recipientEmail = '';
  let recipientEmailLower = '';

  if (queryLooksLikeEmail) {
    if (!isValidEmail(recipientQuery)) {
      return Response.json({ error: 'Please provide a valid recipient email.' }, { status: 400 });
    }

    recipientEmail = recipientQuery;
    recipientEmailLower = normalizeEmail(recipientQuery);
  } else {
    if (!isValidUsername(normalizedRecipientQuery)) {
      return Response.json({ error: 'Please provide a valid username.' }, { status: 400 });
    }

    const usernameRecord = await getFirestoreDocument(ctx.env, ['usernames', normalizedRecipientQuery]);
    const resolvedUid = typeof usernameRecord?.userId === 'string' ? usernameRecord.userId : '';
    if (!resolvedUid) {
      return Response.json({ error: 'Username not found.' }, { status: 404 });
    }

    recipientUid = resolvedUid;
    recipientUsernameLower = normalizedRecipientQuery;
    recipientUsername = typeof usernameRecord?.username === 'string'
      ? usernameRecord.username
      : normalizedRecipientQuery;

    const profile = await getFirestoreDocument(ctx.env, ['users', recipientUid]);
    const profileEmail = typeof profile?.email === 'string' ? profile.email.trim() : '';
    if (profileEmail && isValidEmail(profileEmail)) {
      recipientEmail = profileEmail;
      recipientEmailLower = normalizeEmail(profileEmail);
    }
  }

  if (recipientUid === userId) {
    return Response.json({ error: 'You cannot invite yourself.' }, { status: 409 });
  }

  if (ownerEmail && recipientEmailLower && normalizeEmail(ownerEmail) === recipientEmailLower) {
    return Response.json({ error: 'You cannot invite yourself.' }, { status: 409 });
  }

  const resourceCollection = resourceCollectionForType(resourceType);
  if (!resourceCollection) {
    return Response.json({ error: 'Invalid resource type.' }, { status: 400 });
  }

  const resourcePath = ['users', userId, resourceCollection, resourceId];
  const resource = await getFirestoreDocument(ctx.env, resourcePath);
  if (!resource) {
    return Response.json({ error: 'Shared resource not found.' }, { status: 404 });
  }

  const resourceOwnerId = typeof resource.ownerId === 'string' ? resource.ownerId : userId;
  if (resourceOwnerId !== userId) {
    return Response.json({ error: 'Only the owner can share this resource.' }, { status: 403 });
  }

  const invites = await listFirestoreDocuments(ctx.env, ['collaborationInvites']);
  const existingPendingInvite = invites.find((entry) => {
    const data = entry.data;
    return data.status === 'pending'
      && data.ownerId === userId
      && data.resourceType === resourceType
      && data.resourceId === resourceId
      && (
        (recipientUid && data.recipientUid === recipientUid)
        || (recipientEmailLower
          && typeof data.recipientEmailLower === 'string'
          && data.recipientEmailLower === recipientEmailLower)
        || (recipientUsernameLower
          && typeof data.recipientUsernameLower === 'string'
          && data.recipientUsernameLower === recipientUsernameLower)
      );
  });

  const inviteId = existingPendingInvite?.id ?? crypto.randomUUID();
  const createdAt = typeof existingPendingInvite?.data.createdAt === 'string'
    ? existingPendingInvite.data.createdAt
    : new Date().toISOString();

  await setFirestoreDocument(ctx.env, ['collaborationInvites', inviteId], {
    ownerId: userId,
    ownerEmail,
    recipientEmail,
    recipientEmailLower,
    ...(recipientUid ? { recipientUid } : {}),
    ...(recipientUsername ? { recipientUsername } : {}),
    ...(recipientUsernameLower ? { recipientUsernameLower } : {}),
    resourceType,
    resourceId,
    resourceName,
    permission,
    status: 'pending',
    createdAt,
  });

  return Response.json({ ok: true, inviteId });
};
