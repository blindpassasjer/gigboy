/// <reference types="@cloudflare/workers-types" />
import { listFirestoreDocuments } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function includesQuery(value: unknown, query: string) {
  return typeof value === 'string' && value.toLowerCase().includes(query);
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await ctx.request.json<{ query?: string }>();
  const query = normalize(body.query ?? '');
  if (query.length < 2) {
    return Response.json({ recipients: [] });
  }

  const users = await listFirestoreDocuments(ctx.env, ['users']);

  const recipients = users
    .filter((entry) => entry.id !== userId)
    .map((entry) => {
      const username = typeof entry.data.username === 'string' ? entry.data.username.trim() : '';
      const fullName = typeof entry.data.fullName === 'string' ? entry.data.fullName.trim() : '';
      const email = typeof entry.data.email === 'string' ? entry.data.email.trim() : '';
      const avatar = typeof entry.data.avatar === 'string' ? entry.data.avatar.trim() : '';
      const usernameLower = typeof entry.data.usernameLower === 'string'
        ? entry.data.usernameLower
        : username.toLowerCase();

      return {
        userId: entry.id,
        username,
        usernameLower,
        fullName,
        email,
        avatar,
      };
    })
    .filter((entry) => entry.username)
    .filter((entry) => (
      includesQuery(entry.username, query)
      || includesQuery(entry.usernameLower, query)
      || includesQuery(entry.fullName, query)
      || includesQuery(entry.email, query)
    ))
    .sort((a, b) => {
      const aName = a.fullName || a.username;
      const bName = b.fullName || b.username;
      return aName.localeCompare(bName);
    })
    .slice(0, 12)
    .map((entry) => ({
      userId: entry.userId,
      username: entry.username,
      ...(entry.fullName ? { fullName: entry.fullName } : {}),
      ...(entry.email ? { email: entry.email } : {}),
      ...(entry.avatar ? { avatar: entry.avatar } : {}),
    }));

  return Response.json({ recipients });
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
