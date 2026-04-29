"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRequest = exports.onRequestPost = void 0;
/// <reference types="@cloudflare/workers-types" />
const email_1 = require("../../_helpers/email");
const firebase_admin_1 = require("../../_helpers/firebase-admin");
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
const onRequestPost = async (ctx) => {
    const userId = ctx.data.userId;
    if (!userId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const inviterEmail = ctx.request.headers.get('x-folio-user-email')?.trim() ?? '';
    const body = await ctx.request.json();
    const bandId = body.bandId?.trim() ?? '';
    const recipientEmail = body.recipientEmail?.trim() ?? '';
    const role = body.role === 'editor' ? 'editor' : 'viewer';
    if (!bandId || !recipientEmail) {
        return Response.json({ error: 'Missing required fields.' }, { status: 400 });
    }
    if (!isValidEmail(recipientEmail)) {
        return Response.json({ error: 'Please provide a valid recipient email.' }, { status: 400 });
    }
    if (inviterEmail && normalizeEmail(inviterEmail) === normalizeEmail(recipientEmail)) {
        return Response.json({ error: 'You cannot invite yourself to a band.' }, { status: 409 });
    }
    const band = await (0, firebase_admin_1.getFirestoreDocument)(ctx.env, ['bands', bandId]);
    if (!band) {
        return Response.json({ error: 'Band not found.' }, { status: 404 });
    }
    const bandName = typeof band.name === 'string' && band.name.trim() ? band.name.trim() : 'Untitled band';
    const memberIds = Array.isArray(band.memberIds)
        ? band.memberIds.filter((entry) => typeof entry === 'string')
        : [];
    const memberRoles = typeof band.memberRoles === 'object' && band.memberRoles !== null
        ? band.memberRoles
        : {};
    const memberEmails = typeof band.memberEmails === 'object' && band.memberEmails !== null
        ? band.memberEmails
        : {};
    const inviterRole = band.ownerId === userId ? 'editor' : memberRoles[userId];
    if (!memberIds.includes(userId) || inviterRole !== 'editor') {
        return Response.json({ error: 'You do not have permission to invite members to this band.' }, { status: 403 });
    }
    const normalizedRecipientEmail = normalizeEmail(recipientEmail);
    const existingMemberEmail = Object.values(memberEmails)
        .filter((entry) => typeof entry === 'string')
        .map((entry) => normalizeEmail(entry));
    if (existingMemberEmail.includes(normalizedRecipientEmail)) {
        return Response.json({ error: 'That user is already a member of this band.' }, { status: 409 });
    }
    const existingInvites = await (0, firebase_admin_1.listFirestoreDocuments)(ctx.env, ['bandInvites']);
    const duplicatePendingInvite = existingInvites.find((entry) => {
        const data = entry.data;
        return data.status === 'pending'
            && data.bandId === bandId
            && typeof data.recipientEmailLower === 'string'
            && data.recipientEmailLower === normalizedRecipientEmail;
    });
    if (duplicatePendingInvite) {
        return Response.json({ error: 'A pending invite already exists for this email.' }, { status: 409 });
    }
    const inviteId = crypto.randomUUID();
    const now = new Date().toISOString();
    await (0, firebase_admin_1.setFirestoreDocument)(ctx.env, ['bandInvites', inviteId], {
        bandId,
        bandName,
        inviterId: userId,
        inviterEmail,
        recipientEmail,
        recipientEmailLower: normalizedRecipientEmail,
        role,
        status: 'pending',
        createdAt: now,
    });
    const appUrl = ctx.env.APP_URL ?? new URL(ctx.request.url).origin;
    const invitesUrl = `${appUrl}/profile/invites`;
    try {
        await (0, email_1.sendEmail)({
            env: ctx.env,
            to: recipientEmail,
            subject: `Folio band invite: ${bandName}`,
            html: `
        <p>You received a Folio band invitation.</p>
        <p><strong>${inviterEmail || 'A band member'}</strong> invited you to join <strong>${bandName}</strong> as <strong>${role}</strong>.</p>
        <p>Open your invites page to accept: <a href="${invitesUrl}">${invitesUrl}</a></p>
        <p>Invite ID: ${inviteId}</p>
      `,
        });
    }
    catch (error) {
        await (0, firebase_admin_1.setFirestoreDocument)(ctx.env, ['bandInvites', inviteId], {
            bandId,
            bandName,
            inviterId: userId,
            inviterEmail,
            recipientEmail,
            recipientEmailLower: normalizedRecipientEmail,
            role,
            status: 'revoked',
            createdAt: now,
            respondedAt: now,
        });
        return Response.json({ error: error instanceof Error ? error.message : 'Failed to send invite email.' }, { status: 500 });
    }
    return Response.json({ ok: true, inviteId });
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
