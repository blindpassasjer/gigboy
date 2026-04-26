/// <reference types="@cloudflare/workers-types" />
import { getToken, clearCookie } from '../../_helpers/auth';

interface Env {}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const token = getToken(ctx.request);
  if (token) {
    // Firebase session cleanup would go here
  }
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearCookie() } });
};
