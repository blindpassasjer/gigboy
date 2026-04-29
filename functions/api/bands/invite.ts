/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, listFirestoreDocuments, setFirestoreDocument } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const inviterEmail = ctx.request.headers.get('x-folio-user-email')?.trim() ?? '';
  const body = await ctx.request.json<{
    bandId?: string;
    recipientUsername?: string;
    role?: 'viewer' | 'editor';
  }>();

  const bandId = body.bandId?.trim() ?? '';
  const recipientUsername = body.recipientUsername?.trim() ?? '';
  const role = body.role === 'editor' ? 'editor' : 'viewer';

  if (!bandId || !recipientUsername) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const normalizedRecipientUsername = normalizeEmail(recipientUsername);
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

  const existingMemberUsername = Object.values(memberUsernames)
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => normalizeEmail(entry));
  if (memberIds.includes(recipientUid) || existingMemberUsername.includes(normalizedRecipientUsername)) {
    return Response.json({ error: 'That user is already a member of this band.' }, { status: 409 });
  }

  const existingInvites = await listFirestoreDocuments(ctx.env, ['bandInvites']);
  const duplicatePendingInvite = existingInvites.find((entry) => {
    const data = entry.data;
    return data.status === 'pending'
      && data.bandId === bandId
      && (
        data.recipientUid === recipientUid
        || (typeof data.recipientUsernameLower === 'string' && data.recipientUsernameLower === normalizedRecipientUsername)
      );
  });

  if (duplicatePendingInvite) {
    return Response.json({ error: 'A pending invite already exists for this username.' }, { status: 409 });
  }

  const inviteId = crypto.randomUUID();
  const now = new Date().toISOString();

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
    createdAt: now,
  });

  return Response.json({ ok: true, inviteId });
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