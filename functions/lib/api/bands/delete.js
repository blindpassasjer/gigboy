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
    if (!bandId) {
        return Response.json({ error: 'bandId is required.' }, { status: 400 });
    }
    const bandPath = ['bands', bandId];
    const band = await (0, firebase_admin_1.getFirestoreDocument)(ctx.env, bandPath);
    if (!band) {
        return Response.json({ error: 'Band not found.' }, { status: 404 });
    }
    if (band.ownerId !== userId) {
        return Response.json({ error: 'Only the owner can delete this band.' }, { status: 403 });
    }
    const bandSongs = await (0, firebase_admin_1.listFirestoreDocuments)(ctx.env, ['bands', bandId, 'songs']);
    await Promise.all(bandSongs.map((song) => (0, firebase_admin_1.deleteFirestoreDocument)(ctx.env, ['bands', bandId, 'songs', song.id])));
    await (0, firebase_admin_1.deleteFirestoreDocument)(ctx.env, bandPath);
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
