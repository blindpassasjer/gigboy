/// <reference types="@cloudflare/workers-types" />
import { getToken, clearCookie } from '../../_helpers/auth';

interface Env { DB: D1Database }

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const token = getToken(ctx.request);
  if (token) {
    await ctx.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearCookie() } });
};
