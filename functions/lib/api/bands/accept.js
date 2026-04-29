"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRequest = exports.onRequestPost = void 0;
/// <reference types="@cloudflare/workers-types" />
const firebase_admin_1 = require("../../_helpers/firebase-admin");
const onRequestPost = async (ctx) => {
    const userId = ctx.data.userId;
    if (!userId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userEmail = ctx.request.headers.get('x-folio-user-email')?.trim().toLowerCase() ?? '';
    const body = await ctx.request.json();
    const inviteId = body.inviteId?.trim() ?? '';
    if (!inviteId) {
        return Response.json({ error: 'inviteId is required.' }, { status: 400 });
    }
    const invitePath = ['bandInvites', inviteId];
    const invite = await (0, firebase_admin_1.getFirestoreDocument)(ctx.env, invitePath);
    if (!invite) {
        return Response.json({ error: 'Invite not found.' }, { status: 404 });
    }
    if (invite.status !== 'pending') {
        return Response.json({ error: 'Invite is no longer pending.' }, { status: 409 });
    }
    const inviteRecipientUid = typeof invite.recipientUid === 'string' ? invite.recipientUid : null;
    const inviteRecipientEmail = typeof invite.recipientEmailLower === 'string' ? invite.recipientEmailLower : null;
    const canAccept = inviteRecipientUid === userId || inviteRecipientEmail === userEmail;
    if (!canAccept) {
        return Response.json({ error: 'Invite does not belong to this user.' }, { status: 403 });
    }
    const bandId = typeof invite.bandId === 'string' ? invite.bandId : null;
    if (!bandId) {
        return Response.json({ error: 'Invite is missing band details.' }, { status: 400 });
    }
    const bandPath = ['bands', bandId];
    const band = await (0, firebase_admin_1.getFirestoreDocument)(ctx.env, bandPath);
    if (!band) {
        return Response.json({ error: 'Band not found.' }, { status: 404 });
    }
    const memberIds = Array.isArray(band.memberIds)
        ? band.memberIds.filter((entry) => typeof entry === 'string')
        : [];
    const nextMemberIds = memberIds.includes(userId) ? memberIds : [...memberIds, userId];
    const memberRoles = typeof band.memberRoles === 'object' && band.memberRoles !== null
        ? { ...band.memberRoles }
        : {};
    memberRoles[userId] = invite.role === 'editor' ? 'editor' : 'viewer';
    const memberEmails = typeof band.memberEmails === 'object' && band.memberEmails !== null
        ? { ...band.memberEmails }
        : {};
    if (userEmail) {
        memberEmails[userId] = userEmail;
    }
    const now = new Date().toISOString();
    await (0, firebase_admin_1.setFirestoreDocument)(ctx.env, bandPath, {
        ...band,
        memberIds: nextMemberIds,
        memberRoles,
        memberEmails,
        updatedAt: now,
    });
    await (0, firebase_admin_1.setFirestoreDocument)(ctx.env, invitePath, {
        ...invite,
        recipientUid: userId,
        status: 'accepted',
        respondedAt: now,
    });
    return Response.json({ ok: true, bandId });
};
exports.onRequestPost = onRequestPost;
const onRequest = async (ctx) => {
    if (ctx.request.method !== 'POST') {
        return new Response('Method Not Allowed', {
            status: 405,
            headers: {
                Allow: 'POST',
            },
        });
    }
    return (0, exports.onRequestPost)(ctx);
};
exports.onRequest = onRequest;
