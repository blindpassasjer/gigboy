/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
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

  const userEmail = ctx.request.headers.get('x-folio-user-email')?.trim().toLowerCase() ?? '';
  const body = await ctx.request.json<{ inviteId?: string }>();
  const inviteId = body.inviteId?.trim();

  if (!inviteId) {
    return Response.json({ error: 'inviteId is required.' }, { status: 400 });
  }

  const invitePath = ['collaborationInvites', inviteId];
  const invite = await getFirestoreDocument(ctx.env, invitePath);
  if (!invite) {
    return Response.json({ error: 'Invite not found.' }, { status: 404 });
  }

  if (invite.status !== 'pending') {
    return Response.json({ error: 'Invite is no longer pending.' }, { status: 409 });
  }

  const inviteRecipientUid = typeof invite.recipientUid === 'string' ? invite.recipientUid : null;
  const inviteRecipientEmail = typeof invite.recipientEmailLower === 'string'
    ? invite.recipientEmailLower
    : null;
  const canAccept = inviteRecipientUid === userId || (inviteRecipientEmail !== null && inviteRecipientEmail === userEmail);

  if (!canAccept) {
    return Response.json({ error: 'Invite does not belong to this user.' }, { status: 403 });
  }

  const resourceCollection = resourceCollectionForType(invite.resourceType);
  if (!resourceCollection) {
    return Response.json({ error: 'Invalid invite resource type.' }, { status: 400 });
  }

  const ownerId = typeof invite.ownerId === 'string' ? invite.ownerId : null;
  const resourceId = typeof invite.resourceId === 'string' ? invite.resourceId : null;
  const permission = invite.permission === 'editor' ? 'editor' : 'viewer';

  if (!ownerId || !resourceId) {
    return Response.json({ error: 'Invite is missing resource details.' }, { status: 400 });
  }

  const resourcePath = ['users', ownerId, resourceCollection, resourceId];
  const resource = await getFirestoreDocument(ctx.env, resourcePath);
  if (!resource) {
    return Response.json({ error: 'Shared resource not found.' }, { status: 404 });
  }

  const collaboratorIds = Array.isArray(resource.collaboratorIds)
    ? (resource.collaboratorIds.filter((entry): entry is string => typeof entry === 'string'))
    : [];
  const nextCollaboratorIds = collaboratorIds.includes(userId)
    ? collaboratorIds
    : [...collaboratorIds, userId];

  const collaborationPermissions =
    typeof resource.collaborationPermissions === 'object' && resource.collaborationPermissions !== null
      ? { ...(resource.collaborationPermissions as Record<string, unknown>) }
      : {};
  collaborationPermissions[userId] = permission;

  await setFirestoreDocument(ctx.env, resourcePath, {
    ...resource,
    collaboratorIds: nextCollaboratorIds,
    collaborationPermissions,
    updatedAt: new Date().toISOString(),
  });

  await setFirestoreDocument(ctx.env, invitePath, {
    ...invite,
    recipientUid: userId,
    status: 'accepted',
    respondedAt: new Date().toISOString(),
  });

  return Response.json({ ok: true });
};
