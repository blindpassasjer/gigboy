/// <reference types="@cloudflare/workers-types" />
import { getToken, getSession } from '../../_helpers/auth';

interface Env { DB: D1Database }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const token = getToken(ctx.request);
  if (!token) return Response.json(null);

  const session = await getSession(ctx.env.DB, token);
  if (!session) return Response.json(null);

  const user = await ctx.env.DB
    .prepare('SELECT id, username FROM users WHERE id = ?')
    .bind(session.user_id)
    .first<{ id: string; username: string }>();

  return Response.json(user ?? null);
};
