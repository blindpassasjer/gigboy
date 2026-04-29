"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRequestPost = void 0;
/// <reference types="@cloudflare/workers-types" />
const auth_1 = require("../../_helpers/auth");
const onRequestPost = async (ctx) => {
    const token = (0, auth_1.getToken)(ctx.request);
    if (token) {
        // Firebase session cleanup would go here
    }
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': (0, auth_1.clearCookie)() } });
};
exports.onRequestPost = onRequestPost;
