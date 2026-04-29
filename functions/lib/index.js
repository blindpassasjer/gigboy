"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const https_1 = require("firebase-functions/v2/https");
const _middleware_1 = require("./api/_middleware");
const authLogin = __importStar(require("./api/auth/login"));
const authLogout = __importStar(require("./api/auth/logout"));
const authMe = __importStar(require("./api/auth/me"));
const bandsAccept = __importStar(require("./api/bands/accept"));
const bandsCreate = __importStar(require("./api/bands/create"));
const bandsDelete = __importStar(require("./api/bands/delete"));
const bandsInvite = __importStar(require("./api/bands/invite"));
const bandsRemoveMember = __importStar(require("./api/bands/remove-member"));
const healthFirebase = __importStar(require("./api/health/firebase"));
const shareAccept = __importStar(require("./api/share/accept"));
const shareEmailInvite = __importStar(require("./api/share/email-invite"));
const shareInvite = __importStar(require("./api/share/invite"));
const sharePdfEmail = __importStar(require("./api/share/pdf-email"));
const shareRevoke = __importStar(require("./api/share/revoke"));
const songsCollection = __importStar(require("./api/songs"));
const songsItem = __importStar(require("./api/songs/[id]"));
const routes = [
    { pattern: /^\/api\/auth\/login\/?$/, module: authLogin },
    { pattern: /^\/api\/auth\/logout\/?$/, module: authLogout },
    { pattern: /^\/api\/auth\/me\/?$/, module: authMe },
    { pattern: /^\/api\/bands\/accept\/?$/, module: bandsAccept },
    { pattern: /^\/api\/bands\/create\/?$/, module: bandsCreate },
    { pattern: /^\/api\/bands\/delete\/?$/, module: bandsDelete },
    { pattern: /^\/api\/bands\/invite\/?$/, module: bandsInvite },
    { pattern: /^\/api\/bands\/remove-member\/?$/, module: bandsRemoveMember },
    { pattern: /^\/api\/health\/firebase\/?$/, module: healthFirebase },
    { pattern: /^\/api\/share\/accept\/?$/, module: shareAccept },
    { pattern: /^\/api\/share\/email-invite\/?$/, module: shareEmailInvite },
    { pattern: /^\/api\/share\/invite\/?$/, module: shareInvite },
    { pattern: /^\/api\/share\/pdf-email\/?$/, module: sharePdfEmail },
    { pattern: /^\/api\/share\/revoke\/?$/, module: shareRevoke },
    { pattern: /^\/api\/songs\/?$/, module: songsCollection },
    {
        pattern: /^\/api\/songs\/([^/]+)\/?$/,
        module: songsItem,
        buildParams: (match) => ({ id: decodeURIComponent(match[1] ?? '') }),
    },
];
function resolveRoute(pathname) {
    for (const route of routes) {
        const match = route.pattern.exec(pathname);
        if (match) {
            return {
                module: route.module,
                params: route.buildParams ? route.buildParams(match) : {},
            };
        }
    }
    return null;
}
function getAllowedMethods(module) {
    const methods = [];
    if (module.onRequest)
        return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
    if (module.onRequestGet)
        methods.push('GET');
    if (module.onRequestPost)
        methods.push('POST');
    if (module.onRequestPut)
        methods.push('PUT');
    if (module.onRequestPatch)
        methods.push('PATCH');
    if (module.onRequestDelete)
        methods.push('DELETE');
    return methods;
}
async function runRouteHandler(module, ctx, method) {
    if (module.onRequest) {
        return module.onRequest(ctx);
    }
    if (method === 'GET' && module.onRequestGet)
        return module.onRequestGet(ctx);
    if (method === 'POST' && module.onRequestPost)
        return module.onRequestPost(ctx);
    if (method === 'PUT' && module.onRequestPut)
        return module.onRequestPut(ctx);
    if (method === 'PATCH' && module.onRequestPatch)
        return module.onRequestPatch(ctx);
    if (method === 'DELETE' && module.onRequestDelete)
        return module.onRequestDelete(ctx);
    const allow = getAllowedMethods(module);
    return new Response('Method Not Allowed', {
        status: 405,
        headers: {
            Allow: allow.join(', '),
        },
    });
}
function extractUrl(req) {
    const forwardedProtocol = req.header('x-forwarded-proto');
    const protocol = forwardedProtocol ? forwardedProtocol.split(',')[0].trim() : 'https';
    const host = req.header('host') ?? 'localhost';
    const requestPath = req.originalUrl ?? req.url;
    return `${protocol}://${host}${requestPath}`;
}
function toFetchRequest(req) {
    const url = extractUrl(req);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
            headers.set(key, value.join(', '));
        }
        else if (typeof value === 'string') {
            headers.set(key, value);
        }
    }
    if (!headers.has('content-type') && req.is('application/json')) {
        headers.set('content-type', 'application/json');
    }
    const method = req.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const rawBody = hasBody ? req.rawBody : undefined;
    const body = rawBody ? new Uint8Array(rawBody) : undefined;
    return new Request(url, {
        method,
        headers,
        body,
    });
}
async function writeExpressResponse(res, response) {
    res.status(response.status);
    response.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
            const existing = res.getHeader('set-cookie');
            if (!existing) {
                res.setHeader('set-cookie', [value]);
            }
            else if (Array.isArray(existing)) {
                res.setHeader('set-cookie', [...existing, value]);
            }
            else {
                res.setHeader('set-cookie', [String(existing), value]);
            }
            return;
        }
        res.setHeader(key, value);
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    res.send(bytes);
}
exports.api = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    const request = toFetchRequest(req);
    const pathname = new URL(request.url).pathname;
    const resolved = resolveRoute(pathname);
    if (!resolved) {
        await writeExpressResponse(res, Response.json({ error: `Not found: ${pathname}` }, { status: 404 }));
        return;
    }
    const env = process.env;
    const data = {};
    const baseCtx = {
        request,
        env,
        data,
        params: resolved.params,
        functionPath: '/api',
        waitUntil: (_promise) => undefined,
        passThroughOnException: () => undefined,
    };
    const response = await (0, _middleware_1.onRequest)({
        ...baseCtx,
        next: () => runRouteHandler(resolved.module, baseCtx, request.method.toUpperCase()),
    });
    await writeExpressResponse(res, response);
});
