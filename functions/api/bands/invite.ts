/// <reference types="@cloudflare/workers-types" />
import { sendEmail } from '../../_helpers/email';
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';

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
    bandName?: string;
    recipientEmail?: string;
    role?: 'viewer' | 'editor';
  }>();

  const bandId = body.bandId?.trim() ?? '';
  const bandName = body.bandName?.trim() ?? '';
  const recipientEmail = body.recipientEmail?.trim() ?? '';
  const role = body.role === 'editor' ? 'editor' : 'viewer';

  if (!bandId || !bandName || !recipientEmail) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 });
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
  const memberEmails = typeof band.memberEmails === 'object' && band.memberEmails !== null
    ? band.memberEmails as Record<string, unknown>
    : {};

  const inviterRole = band.ownerId === userId ? 'editor' : memberRoles[userId];
  if (!memberIds.includes(userId) || inviterRole !== 'editor') {
    return Response.json({ error: 'You do not have permission to invite members to this band.' }, { status: 403 });
  }

  const normalizedRecipientEmail = normalizeEmail(recipientEmail);
  const existingMemberEmail = Object.values(memberEmails)
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => normalizeEmail(entry));
  if (existingMemberEmail.includes(normalizedRecipientEmail)) {
    return Response.json({ error: 'That user is already a member of this band.' }, { status: 409 });
  }

  const inviteId = crypto.randomUUID();
  const now = new Date().toISOString();

  await setFirestoreDocument(ctx.env, ['bandInvites', inviteId], {
    bandId,
    bandName,
    inviterId: userId,
    inviterEmail,
    recipientEmail,
    recipientEmailLower: normalizedRecipientEmail,
    role,
    status: 'pending',
    createdAt: now,
  });

  const appUrl = ctx.env.APP_URL ?? new URL(ctx.request.url).origin;
  const invitesUrl = `${appUrl}/profile/invites`;

  try {
    await sendEmail({
      env: ctx.env,
      to: recipientEmail,
      subject: `Folio band invite: ${bandName}`,
      html: `
        <p>You received a Folio band invitation.</p>
        <p><strong>${inviterEmail || 'A band member'}</strong> invited you to join <strong>${bandName}</strong> as <strong>${role}</strong>.</p>
        <p>Open your invites page to accept: <a href="${invitesUrl}">${invitesUrl}</a></p>
        <p>Invite ID: ${inviteId}</p>
      `,
    });
  } catch (error) {
    await setFirestoreDocument(ctx.env, ['bandInvites', inviteId], {
      bandId,
      bandName,
      inviterId: userId,
      inviterEmail,
      recipientEmail,
      recipientEmailLower: normalizedRecipientEmail,
      role,
      status: 'revoked',
      createdAt: now,
      respondedAt: now,
    });

    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to send invite email.' },
      { status: 500 }
    );
  }

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