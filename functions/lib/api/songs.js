"use strict";
/// <reference types="@cloudflare/workers-types" />
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRequestPost = exports.onRequestGet = void 0;
const onRequestGet = async () => {
    // Firebase query would go here
    return Response.json([]);
};
exports.onRequestGet = onRequestGet;
const onRequestPost = async (ctx) => {
    await ctx.request.json();
    // Firebase insert would go here
    return Response.json({ ok: true }, { status: 201 });
};
exports.onRequestPost = onRequestPost;
