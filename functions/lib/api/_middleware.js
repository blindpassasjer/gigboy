"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRequest = void 0;
/// <reference types="@cloudflare/workers-types" />
const auth_1 = require("../_helpers/auth");
const onRequest = async (ctx) => {
    const path = new URL(ctx.request.url).pathname;
    if (path.startsWith('/api/auth/') || path.startsWith('/api/health/'))
        return ctx.next();
    const token = (0, auth_1.getToken)(ctx.request);
    if (token) {
        const session = await (0, auth_1.getSession)(token);
        if (session) {
            ctx.data.userId = session.user_id;
            return ctx.next();
        }
    }
    const fallbackEnabled = (ctx.env.ALLOW_HEADER_AUTH ?? '').toLowerCase() === 'true';
    const fallbackUserId = ctx.request.headers.get('x-folio-user-id')?.trim();
    if (fallbackEnabled && fallbackUserId) {
        ctx.data.userId = fallbackUserId;
        return ctx.next();
    }
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
};
exports.onRequest = onRequest;
