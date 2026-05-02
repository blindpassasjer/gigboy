/// <reference types="@cloudflare/workers-types" />

export const onRequestGet: PagesFunction<never> = async (_ctx) => {
  // Auth is handled via Firebase ID tokens verified in the middleware.
  return Response.json(null);
};
