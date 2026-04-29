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
    recipientEmail?: string;
    resourceType?: 'song' | 'songlist' | 'setlist';
    resourceId?: string;
    resourceName?: string;
    permission?: 'viewer' | 'editor';
  }>();

  const recipientEmail = body.recipientEmail?.trim() ?? '';
  const resourceType = body.resourceType;
  const resourceId = body.resourceId?.trim() ?? '';
  const resourceName = body.resourceName?.trim() ?? '';
  const permission = body.permission === 'editor' ? 'editor' : 'viewer';

  if (!recipientEmail || !resourceType || !resourceId || !resourceName) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  if (!['song', 'songlist', 'setlist'].includes(resourceType)) {
    return Response.json({ error: 'Invalid resource type.' }, { status: 400 });
  }

  if (!isValidEmail(recipientEmail)) {
    return Response.json({ error: 'Please provide a valid recipient email.' }, { status: 400 });
  }

  const normalizedRecipientEmail = normalizeEmail(recipientEmail);
  if (ownerEmail && normalizeEmail(ownerEmail) === normalizedRecipientEmail) {
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
      && typeof data.recipientEmailLower === 'string'
      && data.recipientEmailLower === normalizedRecipientEmail;
  });

  const inviteId = existingPendingInvite?.id ?? crypto.randomUUID();
  const createdAt = typeof existingPendingInvite?.data.createdAt === 'string'
    ? existingPendingInvite.data.createdAt
    : new Date().toISOString();

  await setFirestoreDocument(ctx.env, ['collaborationInvites', inviteId], {
    ownerId: userId,
    ownerEmail,
    recipientEmail,
    recipientEmailLower: normalizedRecipientEmail,
    resourceType,
    resourceId,
    resourceName,
    permission,
    status: 'pending',
    createdAt,
  });

  return Response.json({ ok: true, inviteId });
};
