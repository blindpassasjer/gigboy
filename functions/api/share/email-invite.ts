/// <reference types="@cloudflare/workers-types" />
import { sendEmail } from '../../_helpers/email';

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestPost: PagesFunction<Record<string, string>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await ctx.request.json<{
    recipientEmail: string;
    resourceType: string;
    resourceName: string;
    permission: string;
    inviteId: string;
    userEmail?: string;
  }>();

  if (!body.recipientEmail || !body.resourceType || !body.resourceName || !body.permission || !body.inviteId) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const appUrl = ctx.env.APP_URL ?? new URL(ctx.request.url).origin;
  const invitesUrl = `${appUrl}/profile/invites`;

  try {
    await sendEmail({
      env: ctx.env,
      to: body.recipientEmail,
      subject: `Folio invite: ${body.resourceName}`,
      html: `
        <p>You received a Folio collaboration invite.</p>
        <p><strong>${body.userEmail ?? 'A collaborator'}</strong> invited you to <strong>${body.resourceName}</strong> as <strong>${body.permission}</strong>.</p>
        <p>Open your invites page to accept: <a href="${invitesUrl}">${invitesUrl}</a></p>
        <p>Invite ID: ${body.inviteId}</p>
      `,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to send invite email.' },
      { status: 500 }
    );
  }
};
