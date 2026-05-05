/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';
import { resolveOwnerBandMemberLimit } from '../../_helpers/band-limits';

interface Data extends Record<string, unknown> {
  userId?: string;
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  try {
    const userId = ctx.data.userId;
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const inviterEmail = ctx.request.headers.get('x-gigboy-user-email')?.trim() ?? '';
    const body = await ctx.request.json<{
      bandId?: string;
      recipientUsername?: string;
      role?: 'viewer' | 'editor';
    }>().catch((err) => {
      console.error('Failed to parse request body:', err);
      return null;
    });
    if (!body) return Response.json({ error: 'Invalid request body.' }, { status: 400 });

    const bandId = body.bandId?.trim() ?? '';
    const recipientUsername = body.recipientUsername?.trim() ?? '';
    const role = body.role === 'editor' ? 'editor' : 'viewer';

    if (!bandId || !recipientUsername) {
      return Response.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const normalizedRecipientUsername = normalizeUsername(recipientUsername);
    if (!/^[a-z0-9](?:[a-z0-9_.-]{1,22}[a-z0-9])?$/.test(normalizedRecipientUsername)) {
      return Response.json({ error: 'Please provide a valid username.' }, { status: 400 });
    }

    const usernameRecord = await getFirestoreDocument(ctx.env, ['usernames', normalizedRecipientUsername]);
    const recipientUid = typeof usernameRecord?.userId === 'string' ? usernameRecord.userId : '';
    const canonicalRecipientUsername = typeof usernameRecord?.username === 'string'
      ? usernameRecord.username
      : normalizedRecipientUsername;
    if (!recipientUid) {
      return Response.json({ error: 'Username not found.' }, { status: 404 });
    }

    if (recipientUid === userId) {
      return Response.json({ error: 'You cannot invite yourself to a band.' }, { status: 409 });
    }

    const band = await getFirestoreDocument(ctx.env, ['bands', bandId]);
    if (!band) {
      return Response.json({ error: 'Band not found.' }, { status: 404 });
    }

    const bandName = typeof band.name === 'string' && band.name.trim() ? band.name.trim() : 'Untitled band';

    const memberIds = Array.isArray(band.memberIds)
      ? band.memberIds.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const memberRoles = typeof band.memberRoles === 'object' && band.memberRoles !== null
      ? band.memberRoles as Record<string, unknown>
      : {};
    const memberUsernames = typeof band.memberUsernames === 'object' && band.memberUsernames !== null
      ? band.memberUsernames as Record<string, unknown>
      : {};

    const inviterRole = band.ownerId === userId ? 'editor' : memberRoles[userId];
    if (!memberIds.includes(userId) || inviterRole !== 'editor') {
      return Response.json({ error: 'You do not have permission to invite members to this band.' }, { status: 403 });
    }

    const ownerId = typeof band.ownerId === 'string' ? band.ownerId : '';
    if (!ownerId) {
      return Response.json({ error: 'Band owner is missing.' }, { status: 400 });
    }

    const { memberLimit, isBandEligible } = await resolveOwnerBandMemberLimit(ctx.env, ownerId);
    if (!isBandEligible) {
      return Response.json({ error: 'Adding members requires an active Band subscription.' }, { status: 403 });
    }

    if (memberIds.length >= memberLimit) {
      return Response.json(
        {
          error: `This band has reached its member limit (${memberLimit}). Add extra members in billing to invite more people.`,
        },
        { status: 409 }
      );
    }

    const existingMemberUsername = Object.values(memberUsernames)
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => normalizeUsername(entry));
    if (memberIds.includes(recipientUid) || existingMemberUsername.includes(normalizedRecipientUsername)) {
      return Response.json({ error: 'That user is already a member of this band.' }, { status: 409 });
    }

    const inviteId = `${bandId}__${recipientUid}`;
    const existingInvite = await getFirestoreDocument(ctx.env, ['bandInvites', inviteId]);
    if (existingInvite?.status === 'pending') {
      return Response.json({ error: 'A pending invite already exists for this username.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const createdAt = typeof existingInvite?.createdAt === 'string' ? existingInvite.createdAt : now;

    await setFirestoreDocument(ctx.env, ['bandInvites', inviteId], {
      bandId,
      bandName,
      inviterId: userId,
      inviterEmail,
      recipientUid,
      recipientUsername: canonicalRecipientUsername,
      recipientUsernameLower: normalizedRecipientUsername,
      recipientEmail: '',
      recipientEmailLower: '',
      role,
      status: 'pending',
      createdAt,
    });

    return Response.json({ ok: true, inviteId });
  } catch (error) {
    console.error('Failed to invite band member.', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to invite band member.',
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