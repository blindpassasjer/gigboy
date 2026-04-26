/// <reference types="@cloudflare/workers-types" />

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestGet: PagesFunction<never, never, Data> = async (ctx) => {
  // Firebase query would go here
  return Response.json([]);
};

export const onRequestPost: PagesFunction<never, never, Data> = async (ctx) => {
  type Body = {
    id: string; title: string; artist?: string; language: string;
    secondaryLanguages?: string[]; tags?: string[]; chordpro: string;
    capo?: number; key?: string; tempo?: number; timeSignature?: string; createdAt?: string;
  };
  const s = await ctx.request.json<Body>();
  const now = new Date().toISOString();

  // Firebase insert would go here
  return Response.json({ ok: true }, { status: 201 });
};
