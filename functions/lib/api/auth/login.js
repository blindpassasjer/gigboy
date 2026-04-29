"use strict";
/// <reference types="@cloudflare/workers-types" />
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRequestPost = void 0;
const onRequestPost = async (ctx) => {
    const { username, password } = await ctx.request.json();
    if (!username?.trim() || !password) {
        return Response.json({ error: 'Username and password required' }, { status: 400 });
    }
    // Firebase user lookup would go here
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
};
exports.onRequestPost = onRequestPost;
