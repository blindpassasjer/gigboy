"use strict";
/// <reference types="@cloudflare/workers-types" />
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRequestDelete = void 0;
const onRequestDelete = async () => {
    // Firebase delete would go here
    return Response.json({ ok: true });
};
exports.onRequestDelete = onRequestDelete;
