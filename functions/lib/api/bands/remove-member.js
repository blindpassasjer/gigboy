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
    const body = await ctx.request.json();
    const bandId = body.bandId?.trim() ?? '';
    const memberId = body.memberId?.trim() ?? '';
    if (!bandId || !memberId) {
        return Response.json({ error: 'bandId and memberId are required.' }, { status: 400 });
    }
    const bandPath = ['bands', bandId];
    const band = await (0, firebase_admin_1.getFirestoreDocument)(ctx.env, bandPath);
    if (!band) {
        return Response.json({ error: 'Band not found.' }, { status: 404 });
    }
    const ownerId = typeof band.ownerId === 'string' ? band.ownerId : null;
    if (!ownerId) {
        return Response.json({ error: 'Band owner is missing.' }, { status: 400 });
    }
    const actingAsOwner = ownerId === userId;
    const leavingSelf = memberId === userId;
    if (!actingAsOwner && !leavingSelf) {
        return Response.json({ error: 'Only the owner can remove other members.' }, { status: 403 });
    }
    if (memberId === ownerId) {
        return Response.json({ error: 'The band owner cannot be removed.' }, { status: 409 });
    }
    const memberIds = Array.isArray(band.memberIds)
        ? band.memberIds.filter((entry) => typeof entry === 'string')
        : [];
    if (!memberIds.includes(memberId)) {
        return Response.json({ error: 'Member not found in this band.' }, { status: 404 });
    }
    const memberRoles = typeof band.memberRoles === 'object' && band.memberRoles !== null
        ? { ...band.memberRoles }
        : {};
    const memberEmails = typeof band.memberEmails === 'object' && band.memberEmails !== null
        ? { ...band.memberEmails }
        : {};
    delete memberRoles[memberId];
    delete memberEmails[memberId];
    await (0, firebase_admin_1.setFirestoreDocument)(ctx.env, bandPath, {
        ...band,
        memberIds: memberIds.filter((entry) => entry !== memberId),
        memberRoles,
        memberEmails,
        updatedAt: new Date().toISOString(),
    });
    return Response.json({ ok: true });
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
