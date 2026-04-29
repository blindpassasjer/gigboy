"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRequestPost = void 0;
/// <reference types="@cloudflare/workers-types" />
const firebase_admin_1 = require("../../_helpers/firebase-admin");
function resourceCollectionForType(resourceType) {
    if (resourceType === 'song')
        return 'songs';
    if (resourceType === 'songlist')
        return 'songLists';
    if (resourceType === 'setlist')
        return 'setlists';
    return null;
}
const onRequestPost = async (ctx) => {
    const userId = ctx.data.userId;
    if (!userId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userEmail = ctx.request.headers.get('x-folio-user-email')?.trim().toLowerCase() ?? '';
    const body = await ctx.request.json();
    const inviteId = body.inviteId?.trim();
    if (!inviteId) {
        return Response.json({ error: 'inviteId is required.' }, { status: 400 });
    }
    const invitePath = ['collaborationInvites', inviteId];
    const invite = await (0, firebase_admin_1.getFirestoreDocument)(ctx.env, invitePath);
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
    const resource = await (0, firebase_admin_1.getFirestoreDocument)(ctx.env, resourcePath);
    if (!resource) {
        return Response.json({ error: 'Shared resource not found.' }, { status: 404 });
    }
    const resourceOwnerId = typeof resource.ownerId === 'string' ? resource.ownerId : ownerId;
    if (resourceOwnerId !== ownerId) {
        return Response.json({ error: 'Invite owner no longer matches this resource.' }, { status: 409 });
    }
    if (ownerId === userId) {
        return Response.json({ error: 'You cannot accept your own invite.' }, { status: 409 });
    }
    const collaboratorIds = Array.isArray(resource.collaboratorIds)
        ? (resource.collaboratorIds.filter((entry) => typeof entry === 'string'))
        : [];
    const nextCollaboratorIds = collaboratorIds.includes(userId)
        ? collaboratorIds
        : [...collaboratorIds, userId];
    const collaborationPermissions = typeof resource.collaborationPermissions === 'object' && resource.collaborationPermissions !== null
        ? { ...resource.collaborationPermissions }
        : {};
    collaborationPermissions[userId] = permission;
    await (0, firebase_admin_1.setFirestoreDocument)(ctx.env, resourcePath, {
        ...resource,
        collaboratorIds: nextCollaboratorIds,
        collaborationPermissions,
        updatedAt: new Date().toISOString(),
    });
    await (0, firebase_admin_1.setFirestoreDocument)(ctx.env, invitePath, {
        ...invite,
        recipientUid: userId,
        status: 'accepted',
        respondedAt: new Date().toISOString(),
    });
    return Response.json({ ok: true });
};
exports.onRequestPost = onRequestPost;
