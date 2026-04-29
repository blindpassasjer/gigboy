/// <reference types="@cloudflare/workers-types" />
import { setFirestoreDocument } from '../../_helpers/firebase-admin';

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

  const ownerEmail = ctx.request.headers.get('x-folio-user-email')?.trim() ?? '';
  const body = await ctx.request.json<{
    recipientEmail?: string;
    resourceType?: 'song' | 'songlist' | 'setlist';
    resourceId?: string;
    resourceName?: string;
    permission?: 'viewer' | 'editor';
  }>();

  const recipientEmail = body.recipientEmail?.trim() ?? '';
  const resourceType = body.resourceType;
  const resourceId = body.resourceId?.trim() ?? '';
  const resourceName = body.resourceName?.trim() ?? '';
  const permission = body.permission === 'editor' ? 'editor' : 'viewer';

  if (!recipientEmail || !resourceType || !resourceId || !resourceName) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  if (!['song', 'songlist', 'setlist'].includes(resourceType)) {
    return Response.json({ error: 'Invalid resource type.' }, { status: 400 });
  }

  const inviteId = crypto.randomUUID();
  await setFirestoreDocument(ctx.env, ['collaborationInvites', inviteId], {
    ownerId: userId,
    ownerEmail,
    recipientEmail,
    recipientEmailLower: normalizeEmail(recipientEmail),
    resourceType,
    resourceId,
    resourceName,
    permission,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  return Response.json({ ok: true, inviteId });
};
