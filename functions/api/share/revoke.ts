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

  const body = await ctx.request.json<{ inviteId?: string }>().catch(() => null);
  if (!body) return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  const inviteId = body.inviteId?.trim();

  if (!inviteId) {
    return Response.json({ error: 'inviteId is required.' }, { status: 400 });
  }

  const invitePath = ['collaborationInvites', inviteId];
  const invite = await getFirestoreDocument(ctx.env, invitePath);
  if (!invite) {
    return Response.json({ error: 'Invite not found.' }, { status: 404 });
  }

  const ownerId = typeof invite.ownerId === 'string' ? invite.ownerId : null;
  if (!ownerId || ownerId !== userId) {
    return Response.json({ error: 'Only the owner can revoke this invite.' }, { status: 403 });
  }

  const resourceCollection = resourceCollectionForType(invite.resourceType);
  const resourceId = typeof invite.resourceId === 'string' ? invite.resourceId : null;
  const recipientUid = typeof invite.recipientUid === 'string' ? invite.recipientUid : null;

  if (resourceCollection && resourceId) {
    const resourcePath = ['users', ownerId, resourceCollection, resourceId];
    const resource = await getFirestoreDocument(ctx.env, resourcePath);

    if (resource) {
      const collaboratorIds = Array.isArray(resource.collaboratorIds)
        ? (resource.collaboratorIds.filter((entry): entry is string => typeof entry === 'string'))
        : [];

      const nextCollaboratorIds = recipientUid
        ? collaboratorIds.filter((entry) => entry !== recipientUid)
        : collaboratorIds;

      const currentPermissions =
        typeof resource.collaborationPermissions === 'object' && resource.collaborationPermissions !== null
          ? { ...(resource.collaborationPermissions as Record<string, unknown>) }
          : {};
      if (recipientUid) {
        delete currentPermissions[recipientUid];
      }

      await setFirestoreDocument(ctx.env, resourcePath, {
        ...resource,
        collaboratorIds: nextCollaboratorIds,
        collaborationPermissions: currentPermissions,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  await setFirestoreDocument(ctx.env, invitePath, {
    ...invite,
    status: 'revoked',
    respondedAt: new Date().toISOString(),
  });

  return Response.json({ ok: true });
};
