/// <reference types="@cloudflare/workers-types" />

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestPost: PagesFunction<never, never, Data> = async (ctx) => {
  if (!ctx.data.userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The client currently writes invite documents directly to Firestore.
  // This endpoint is kept as a stable API surface for server-side invite writes.
  return Response.json({ ok: true, message: 'Invite endpoint ready.' });
};
