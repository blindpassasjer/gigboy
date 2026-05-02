/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = ctx.request.headers.get('x-folio-user-email')?.trim().toLowerCase() ?? '';
  const body = await ctx.request.json<{ inviteId?: string }>().catch(() => null);
  if (!body) return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  const inviteId = body.inviteId?.trim() ?? '';

  if (!inviteId) {
    return Response.json({ error: 'inviteId is required.' }, { status: 400 });
  }

  const invitePath = ['bandInvites', inviteId];
  const invite = await getFirestoreDocument(ctx.env, invitePath);
  if (!invite) {
    return Response.json({ error: 'Invite not found.' }, { status: 404 });
  }

  if (invite.status !== 'pending') {
    return Response.json({ error: 'Invite is no longer pending.' }, { status: 409 });
  }

  const inviteRecipientUid = typeof invite.recipientUid === 'string' ? invite.recipientUid : null;
  const inviteRecipientEmail = typeof invite.recipientEmailLower === 'string' ? invite.recipientEmailLower : null;
  const canAccept = inviteRecipientUid === userId || inviteRecipientEmail === userEmail;
  if (!canAccept) {
    return Response.json({ error: 'Invite does not belong to this user.' }, { status: 403 });
  }

  const bandId = typeof invite.bandId === 'string' ? invite.bandId : null;
  if (!bandId) {
    return Response.json({ error: 'Invite is missing band details.' }, { status: 400 });
  }

  const bandPath = ['bands', bandId];
  const [band, profile] = await Promise.all([
    getFirestoreDocument(ctx.env, bandPath),
    getFirestoreDocument(ctx.env, ['users', userId]),
  ]);
  if (!band) {
    return Response.json({ error: 'Band not found.' }, { status: 404 });
  }

  const memberIds = Array.isArray(band.memberIds)
    ? band.memberIds.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const nextMemberIds = memberIds.includes(userId) ? memberIds : [...memberIds, userId];

  const memberRoles = typeof band.memberRoles === 'object' && band.memberRoles !== null
    ? { ...(band.memberRoles as Record<string, unknown>) }
    : {};
  memberRoles[userId] = invite.role === 'editor' ? 'editor' : 'viewer';

  const memberEmails = typeof band.memberEmails === 'object' && band.memberEmails !== null
    ? { ...(band.memberEmails as Record<string, unknown>) }
    : {};
  if (userEmail) {
    memberEmails[userId] = userEmail;
  }

  const memberUsernames = typeof band.memberUsernames === 'object' && band.memberUsernames !== null
    ? { ...(band.memberUsernames as Record<string, unknown>) }
    : {};
  const memberFullNames = typeof band.memberFullNames === 'object' && band.memberFullNames !== null
    ? { ...(band.memberFullNames as Record<string, unknown>) }
    : {};
  const memberAvatars = typeof band.memberAvatars === 'object' && band.memberAvatars !== null
    ? { ...(band.memberAvatars as Record<string, unknown>) }
    : {};
  const profileUsername = typeof profile?.username === 'string' ? profile.username : null;
  const profileFullName = typeof profile?.fullName === 'string' ? profile.fullName : null;
  const profileAvatar = typeof profile?.avatar === 'string' ? profile.avatar : null;
  const inviteUsername = typeof invite.recipientUsername === 'string' ? invite.recipientUsername : null;
  if (profileUsername || inviteUsername) {
    memberUsernames[userId] = profileUsername ?? inviteUsername ?? userId;
  }
  if (profileFullName) {
    memberFullNames[userId] = profileFullName;
  }
  if (profileAvatar) {
    memberAvatars[userId] = profileAvatar;
  }

  const now = new Date().toISOString();

  await setFirestoreDocument(ctx.env, bandPath, {
    ...band,
    memberIds: nextMemberIds,
    memberRoles,
    memberEmails,
    memberUsernames,
    memberFullNames,
    memberAvatars,
    updatedAt: now,
  });

  await setFirestoreDocument(ctx.env, invitePath, {
    ...invite,
    recipientUid: userId,
    status: 'accepted',
    respondedAt: now,
  });

  return Response.json({ ok: true, bandId });
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