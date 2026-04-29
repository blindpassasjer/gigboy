/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  try {
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

    if (name.length > 80) {
      return Response.json({ error: 'Band name must be 80 characters or fewer.' }, { status: 400 });
    }

    if (description && description.length > 240) {
      return Response.json({ error: 'Band description must be 240 characters or fewer.' }, { status: 400 });
    }

    const bandId = crypto.randomUUID();
    const now = new Date().toISOString();
    const profile = await getFirestoreDocument(ctx.env, ['users', userId]);
    const username = typeof profile?.username === 'string' ? profile.username : '';

    await setFirestoreDocument(ctx.env, ['bands', bandId], {
      name,
      description,
      ownerId: userId,
      memberIds: [userId],
      memberRoles: {
        [userId]: 'editor',
      },
      memberEmails: userEmail ? { [userId]: userEmail } : {},
      memberUsernames: username ? { [userId]: username } : {},
      createdAt: now,
      updatedAt: now,
    });

    return Response.json({ ok: true, bandId });
  } catch (error) {
    console.error('Failed to create band.', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create band.',
      },
      { status: 500 }
    );
  }
};

export const onRequest: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  if (ctx.request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: {
        Allow: 'POST',
      },
    });
  }

  return onRequestPost(ctx);
};