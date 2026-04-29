"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRequestGet = void 0;
/// <reference types="@cloudflare/workers-types" />
const firebase_admin_1 = require("../../_helpers/firebase-admin");
const onRequestGet = async (ctx) => {
    const checkedAt = new Date().toISOString();
    const admin = (0, firebase_admin_1.initializeFirebaseAdmin)(ctx.env);
    if (!admin.isConfigured) {
        const payload = {
            ok: false,
            configured: false,
            checkedAt,
            error: admin.error,
        };
        return Response.json(payload, { status: 500 });
    }
    const start = Date.now();
    try {
        // Listing a collection verifies auth token retrieval and Firestore API access.
        await (0, firebase_admin_1.listFirestoreDocuments)(ctx.env, ['bands']);
        const payload = {
            ok: true,
            configured: true,
            projectId: admin.config.projectId,
            checkedAt,
            latencyMs: Date.now() - start,
        };
        return Response.json(payload);
    }
    catch (error) {
        const payload = {
            ok: false,
            configured: true,
            projectId: admin.config.projectId,
            checkedAt,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : 'Firebase health check failed.',
        };
        return Response.json(payload, { status: 500 });
    }
};
exports.onRequestGet = onRequestGet;
