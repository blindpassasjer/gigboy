/// <reference types="@cloudflare/workers-types" />
import { getToken, getSession } from '../../_helpers/auth';

export const onRequestGet: PagesFunction<never> = async (ctx) => {
  const token = getToken(ctx.request);
  if (!token) return Response.json(null);

  const session = await getSession(token);
  if (!session) return Response.json(null);

  // Firebase user lookup would go here
  return Response.json(null);
};
