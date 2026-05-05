/// <reference types="@cloudflare/workers-types" />
import { verifyFirebaseIdToken } from '../_helpers/auth';

interface Env {
  FIREBASE_PROJECT_ID?: string;
}

interface Data extends Record<string, unknown> {
  userId?: string;
  userEmail?: string;
}

export const onRequest: PagesFunction<Env, never, Data> = async (ctx) => {
  const path = new URL(ctx.request.url).pathname;
  if (
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/health/') ||
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
