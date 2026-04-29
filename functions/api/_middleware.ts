/// <reference types="@cloudflare/workers-types" />
import { getToken, getSession } from '../_helpers/auth';

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequest: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const path = new URL(ctx.request.url).pathname;
  if (path.startsWith('/api/auth/') || path.startsWith('/api/health/')) return ctx.next();

  const token = getToken(ctx.request);
  if (token) {
    const session = await getSession(token);
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
