/// <reference types="@cloudflare/workers-types" />

interface Env { DB: D1Database }
interface Data { userId: string }

export const onRequestDelete: PagesFunction<Env, 'id', Data> = async (ctx) => {
  await ctx.env.DB
    .prepare('DELETE FROM songs WHERE id = ?')
    .bind(ctx.params.id)
    .run();
  return Response.json({ ok: true });
};
