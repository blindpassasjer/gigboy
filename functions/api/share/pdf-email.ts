/// <reference types="@cloudflare/workers-types" />

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestPost: PagesFunction<Record<string, string>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json(
    { error: 'Email functionality has been removed from this deployment.' },
    { status: 410 }
  );
};
