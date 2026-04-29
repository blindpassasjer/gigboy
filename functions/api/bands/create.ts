/// <reference types="@cloudflare/workers-types" />
import { setFirestoreDocument } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = ctx.request.headers.get('x-folio-user-email')?.trim() ?? '';
  const body = await ctx.request.json<{ name?: string; description?: string }>();
  const name = body.name?.trim() ?? '';
  const description = body.description?.trim() || undefined;

  if (!name) {
    return Response.json({ error: 'Band name is required.' }, { status: 400 });
  }

  const bandId = crypto.randomUUID();
  const now = new Date().toISOString();

  await setFirestoreDocument(ctx.env, ['bands', bandId], {
    name,
    description,
    ownerId: userId,
    memberIds: [userId],
    memberRoles: {
      [userId]: 'editor',
    },
    memberEmails: userEmail ? { [userId]: userEmail } : {},
    createdAt: now,
    updatedAt: now,
  });

  return Response.json({ ok: true, bandId });
};