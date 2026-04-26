/// <reference types="@cloudflare/workers-types" />

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestDelete: PagesFunction<never, 'id', Data> = async (ctx) => {
  // Firebase delete would go here
  return Response.json({ ok: true });
};
