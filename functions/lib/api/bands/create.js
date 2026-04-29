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
    const userEmail = ctx.request.headers.get('x-folio-user-email')?.trim() ?? '';
    const body = await ctx.request.json();
    const name = body.name?.trim() ?? '';
    const description = body.description?.trim() || undefined;
    if (!name) {
        return Response.json({ error: 'Band name is required.' }, { status: 400 });
    }
    if (name.length > 80) {
        return Response.json({ error: 'Band name must be 80 characters or fewer.' }, { status: 400 });
    }
    if (description && description.length > 240) {
        return Response.json({ error: 'Band description must be 240 characters or fewer.' }, { status: 400 });
    }
    const bandId = crypto.randomUUID();
    const now = new Date().toISOString();
    await (0, firebase_admin_1.setFirestoreDocument)(ctx.env, ['bands', bandId], {
        name,
        description,
        ownerId: userId,
        memberIds: [userId],
        memberRoles: {
            [userId]: 'editor',
        },
        memberEmails: userEmail ? { [userId]: userEmail } : {},
        createdAt: now,
        updatedAt: now,
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
