/// <reference types="@cloudflare/workers-types" />
import { verifyFirebaseIdToken } from '../_helpers/auth';
import { checkRateLimit } from '../_helpers/rateLimiter';

interface Env {
  FIREBASE_PROJECT_ID?: string;
  RATE_LIMITER: DurableObjectNamespace;
}

interface Data extends Record<string, unknown> {
  userId?: string;
  userEmail?: string;
}

const RATE_LIMIT_RULES: Array<{
  test: (path: string) => boolean;
  limit: number;
  windowMs: number;
}> = [
  { test: (p) => p === '/api/users/delete-account',      limit: 2,  windowMs: 600_000 },
  { test: (p) => p === '/api/bands/repair-membership',   limit: 2,  windowMs: 600_000 },
  { test: (p) => p.startsWith('/api/stripe/') && p !== '/api/stripe/webhook', limit: 5, windowMs: 60_000 },
  { test: (p) => p.startsWith('/api/bands/invite'),      limit: 20, windowMs: 60_000 },
  { test: (p) => p.startsWith('/api/share/invite'),      limit: 20, windowMs: 60_000 },
  { test: (p) => p.startsWith('/api/auth/'),             limit: 10, windowMs: 60_000 },
  { test: (p) => p.startsWith('/api/public/press-kit/'), limit: 60, windowMs: 60_000 },
];

// Applies to any /api/* path that didn't match a rule above, so nothing is
// left unlimited by omission.
const DEFAULT_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

export const onRequest: PagesFunction<Env, never, Data> = async (ctx) => {
  const path = new URL(ctx.request.url).pathname;

  const ip = ctx.request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rule = RATE_LIMIT_RULES.find((r) => r.test(path)) ?? DEFAULT_RATE_LIMIT;
  const allowed = await checkRateLimit(ctx.env.RATE_LIMITER, `${ip}:${path}`, rule.limit, rule.windowMs);
  if (!allowed) {
    return new Response('Too Many Requests', { status: 429 });
  }

  if (
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/health/') ||
    path.startsWith('/api/public/') ||
    path === '/api/stripe/webhook'
  ) return ctx.next();

  const authHeader = ctx.request.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!bearerToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = ctx.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error('FIREBASE_PROJECT_ID is not configured');
    return Response.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const result = await verifyFirebaseIdToken(bearerToken, projectId);
  if (!result) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  ctx.data.userId = result.uid;
  if (result.email) ctx.data.userEmail = result.email;
  return ctx.next();
};
