/// <reference types="@cloudflare/workers-types" />
import { getToken, getSession } from '../_helpers/auth';

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequest: PagesFunction<never, never, Data> = async (ctx) => {
  if (new URL(ctx.request.url).pathname.startsWith('/api/auth/')) return ctx.next();

  const token = getToken(ctx.request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await getSession(token);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  ctx.data.userId = session.user_id;
  return ctx.next();
};
