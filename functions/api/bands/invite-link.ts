/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

const LINK_INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  try {
    const userId = ctx.data.userId;
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const inviterEmail = ctx.request.headers.get('x-folio-user-email')?.trim() ?? '';
    const body = await ctx.request.json<{
      bandId?: string;
      role?: 'viewer' | 'editor';
    }>().catch(() => null);
    if (!body) return Response.json({ error: 'Invalid request body.' }, { status: 400 });

    const bandId = body.bandId?.trim() ?? '';
    const role = body.role === 'editor' ? 'editor' : 'viewer';

    if (!bandId) {
      return Response.json({ error: 'bandId is required.' }, { status: 400 });
    }

    const band = await getFirestoreDocument(ctx.env, ['bands', bandId]);
    if (!band) {
      return Response.json({ error: 'Band not found.' }, { status: 404 });
    }

    const memberIds = Array.isArray(band.memberIds)
      ? band.memberIds.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const memberRoles = typeof band.memberRoles === 'object' && band.memberRoles !== null
      ? band.memberRoles as Record<string, unknown>
      : {};

    const inviterRole = band.ownerId === userId ? 'editor' : memberRoles[userId];
    if (!memberIds.includes(userId) || inviterRole !== 'editor') {
      return Response.json({ error: 'You do not have permission to create invite links for this band.' }, { status: 403 });
    }

    const bandName = typeof band.name === 'string' && band.name.trim() ? band.name.trim() : 'Untitled band';
    const inviteId = crypto.randomUUID();
    const nowMs = Date.now();
    const createdAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + LINK_INVITE_TTL_MS).toISOString();

    await setFirestoreDocument(ctx.env, ['bandInvites', inviteId], {
      bandId,
      bandName,
      inviterId: userId,
      inviterEmail,
      recipientUid: '',
      recipientUsername: '',
      recipientUsernameLower: '',
      recipientEmail: '',
      recipientEmailLower: '',
      role,
      status: 'pending',
      linkInvite: true,
      createdAt,
      expiresAt,
    });

    const origin = new URL(ctx.request.url).origin;
    const inviteUrl = `${origin}/profile/invites?bandInvite=${encodeURIComponent(inviteId)}`;

    return Response.json({ ok: true, inviteId, inviteUrl, expiresAt });
  } catch (error) {
    console.error('Failed to create band invite link.', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create band invite link.',
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
