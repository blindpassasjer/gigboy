/// <reference types="@cloudflare/workers-types" />
import { getToken, clearCookie } from '../../_helpers/auth';

export const onRequestPost: PagesFunction<never> = async (ctx) => {
  const token = getToken(ctx.request);
  if (token) {
    // Firebase session cleanup would go here
  }
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearCookie() } });
};
