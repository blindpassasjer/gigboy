"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRequestGet = void 0;
/// <reference types="@cloudflare/workers-types" />
const auth_1 = require("../../_helpers/auth");
const onRequestGet = async (ctx) => {
    const token = (0, auth_1.getToken)(ctx.request);
    if (!token)
        return Response.json(null);
    const session = await (0, auth_1.getSession)(token);
    if (!session)
        return Response.json(null);
    // Firebase user lookup would go here
    return Response.json(null);
};
exports.onRequestGet = onRequestGet;
