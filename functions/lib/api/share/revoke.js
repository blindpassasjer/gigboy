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
    const ownerId = typeof invite.ownerId === 'string' ? invite.ownerId : null;
    if (!ownerId || ownerId !== userId) {
        return Response.json({ error: 'Only the owner can revoke this invite.' }, { status: 403 });
    }
    const resourceCollection = resourceCollectionForType(invite.resourceType);
    const resourceId = typeof invite.resourceId === 'string' ? invite.resourceId : null;
    const recipientUid = typeof invite.recipientUid === 'string' ? invite.recipientUid : null;
    if (resourceCollection && resourceId) {
        const resourcePath = ['users', ownerId, resourceCollection, resourceId];
        const resource = await (0, firebase_admin_1.getFirestoreDocument)(ctx.env, resourcePath);
        if (resource) {
            const collaboratorIds = Array.isArray(resource.collaboratorIds)
                ? (resource.collaboratorIds.filter((entry) => typeof entry === 'string'))
                : [];
            const nextCollaboratorIds = recipientUid
                ? collaboratorIds.filter((entry) => entry !== recipientUid)
                : collaboratorIds;
            const currentPermissions = typeof resource.collaborationPermissions === 'object' && resource.collaborationPermissions !== null
                ? { ...resource.collaborationPermissions }
                : {};
            if (recipientUid) {
                delete currentPermissions[recipientUid];
            }
            await (0, firebase_admin_1.setFirestoreDocument)(ctx.env, resourcePath, {
                ...resource,
                collaboratorIds: nextCollaboratorIds,
                collaborationPermissions: currentPermissions,
                updatedAt: new Date().toISOString(),
            });
        }
    }
    await (0, firebase_admin_1.setFirestoreDocument)(ctx.env, invitePath, {
        ...invite,
        status: 'revoked',
        respondedAt: new Date().toISOString(),
    });
    return Response.json({ ok: true });
};
exports.onRequestPost = onRequestPost;
