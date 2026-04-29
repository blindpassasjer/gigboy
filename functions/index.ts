import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { onRequest } from 'firebase-functions/v2/https';

import { onRequest as authMiddleware } from './api/_middleware';

import * as authLogin from './api/auth/login';
import * as authLogout from './api/auth/logout';
import * as authMe from './api/auth/me';
import * as bandsAccept from './api/bands/accept';
import * as bandsCreate from './api/bands/create';
import * as bandsDelete from './api/bands/delete';
import * as bandsInvite from './api/bands/invite';
import * as bandsRemoveMember from './api/bands/remove-member';
import * as healthFirebase from './api/health/firebase';
import * as shareAccept from './api/share/accept';
import * as shareEmailInvite from './api/share/email-invite';
import * as shareInvite from './api/share/invite';
import * as sharePdfEmail from './api/share/pdf-email';
import * as shareRevoke from './api/share/revoke';
import * as songsCollection from './api/songs';
import * as songsItem from './api/songs/[id]';

type Env = Record<string, string | undefined>;
type Data = Record<string, unknown>;
type Params = Record<string, string>;

type RouteModule = {
  onRequest?: (ctx: unknown) => Response | Promise<Response>;
  onRequestGet?: (ctx: unknown) => Response | Promise<Response>;
  onRequestPost?: (ctx: unknown) => Response | Promise<Response>;
  onRequestPut?: (ctx: unknown) => Response | Promise<Response>;
  onRequestDelete?: (ctx: unknown) => Response | Promise<Response>;
  onRequestPatch?: (ctx: unknown) => Response | Promise<Response>;
};

interface RouteDefinition {
  pattern: RegExp;
  module: RouteModule;
  buildParams?: (match: RegExpExecArray) => Params;
}

const routes: RouteDefinition[] = [
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

function resolveRoute(pathname: string): { module: RouteModule; params: Params } | null {
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

function getAllowedMethods(module: RouteModule): string[] {
  const methods: string[] = [];
  if (module.onRequest) return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
  if (module.onRequestGet) methods.push('GET');
  if (module.onRequestPost) methods.push('POST');
  if (module.onRequestPut) methods.push('PUT');
  if (module.onRequestPatch) methods.push('PATCH');
  if (module.onRequestDelete) methods.push('DELETE');
  return methods;
}

async function runRouteHandler(module: RouteModule, ctx: unknown, method: string): Promise<Response> {
  if (module.onRequest) {
    return module.onRequest(ctx);
  }

  if (method === 'GET' && module.onRequestGet) return module.onRequestGet(ctx);
  if (method === 'POST' && module.onRequestPost) return module.onRequestPost(ctx);
  if (method === 'PUT' && module.onRequestPut) return module.onRequestPut(ctx);
  if (method === 'PATCH' && module.onRequestPatch) return module.onRequestPatch(ctx);
  if (method === 'DELETE' && module.onRequestDelete) return module.onRequestDelete(ctx);

  const allow = getAllowedMethods(module);
  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      Allow: allow.join(', '),
    },
  });
}

function extractUrl(req: ExpressRequest): string {
  const forwardedProtocol = req.header('x-forwarded-proto');
  const protocol = forwardedProtocol ? forwardedProtocol.split(',')[0].trim() : 'https';
  const host = req.header('host') ?? 'localhost';
  const requestPath = req.originalUrl ?? req.url;
  return `${protocol}://${host}${requestPath}`;
}

function toFetchRequest(req: ExpressRequest): Request {
  const url = extractUrl(req);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  if (!headers.has('content-type') && req.is('application/json')) {
    headers.set('content-type', 'application/json');
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const rawBody = hasBody ? (req as { rawBody?: Buffer }).rawBody : undefined;
  const body = rawBody ? new Uint8Array(rawBody) : undefined;

  return new Request(url, {
    method,
    headers,
    body,
  });
}

async function writeExpressResponse(res: ExpressResponse, response: Response): Promise<void> {
  res.status(response.status);

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      const existing = res.getHeader('set-cookie');
      if (!existing) {
        res.setHeader('set-cookie', [value]);
      } else if (Array.isArray(existing)) {
        res.setHeader('set-cookie', [...existing, value]);
      } else {
        res.setHeader('set-cookie', [String(existing), value]);
      }
      return;
    }

    res.setHeader(key, value);
  });

  const bytes = Buffer.from(await response.arrayBuffer());
  res.send(bytes);
}

export const api = onRequest({ cors: true }, async (req, res) => {
  const request = toFetchRequest(req);
  const pathname = new URL(request.url).pathname;
  const resolved = resolveRoute(pathname);

  if (!resolved) {
    await writeExpressResponse(
      res,
      Response.json({ error: `Not found: ${pathname}` }, { status: 404 }),
    );
    return;
  }

  const env: Env = process.env as Env;
  const data: Data = {};
  const baseCtx = {
    request,
    env,
    data,
    params: resolved.params,
    functionPath: '/api',
    waitUntil: (_promise: Promise<unknown>) => undefined,
    passThroughOnException: () => undefined,
  };

  const response = await authMiddleware({
    ...baseCtx,
    next: () => runRouteHandler(resolved.module, baseCtx, request.method.toUpperCase()),
  } as any);

  await writeExpressResponse(res, response);
});
