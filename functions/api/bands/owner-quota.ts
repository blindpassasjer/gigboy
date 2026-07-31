/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

// Storage quotas mirrored from src/lib/planLimits.ts (can't import front-end modules here)
const STORAGE_QUOTA: Record<string, number> = {
  free: 100 * 1024 * 1024,
  pro: 1024 * 1024 * 1024,
  crew: 5 * 1024 * 1024 * 1024,
};

function isPaidPlanActive(status: unknown): boolean {
  return status === 'active' || status === 'trialing';
}

function resolveUserQuotaBytes(userData: Record<string, unknown> | undefined): number {
  const explicitQuota = userData?.storageQuotaBytes;
  if (typeof explicitQuota === 'number' && Number.isFinite(explicitQuota) && explicitQuota >= 0) {
    return explicitQuota;
  }

  const plan = userData?.plan === 'crew' ? 'crew' : userData?.plan === 'pro' ? 'pro' : 'free';
  const planOverride = userData?.planOverride === true;
  const active = planOverride || plan === 'free' || isPaidPlanActive(userData?.subscriptionStatus);
  const effectivePlan = active ? plan : 'free';
  return STORAGE_QUOTA[effectivePlan] ?? STORAGE_QUOTA.free;
}

// Returns the storage quota for a band's owner, so non-owner band members can
// display remaining storage without being able to read the owner's full user
// profile (which is otherwise locked to isOwner() in firestore.rules).
export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await ctx.request.json<{ bandId?: string }>().catch(() => null);
  const bandId = body?.bandId?.trim() ?? '';
  if (!bandId) {
    return Response.json({ error: 'bandId is required.' }, { status: 400 });
  }

  const band = await getFirestoreDocument(ctx.env, ['bands', bandId]);
  if (!band) {
    return Response.json({ error: 'Band not found.' }, { status: 404 });
  }

  const ownerId = typeof band.ownerId === 'string' ? band.ownerId : '';
  const memberIds = Array.isArray(band.memberIds)
    ? band.memberIds.filter((entry): entry is string => typeof entry === 'string')
    : [];
  if (ownerId !== userId && !memberIds.includes(userId)) {
    return Response.json({ error: 'Not a member of this band.' }, { status: 403 });
  }

  if (!ownerId) {
    return Response.json({ quotaBytes: STORAGE_QUOTA.free });
  }

  const ownerProfile = await getFirestoreDocument(ctx.env, ['users', ownerId]);
  return Response.json({ quotaBytes: resolveUserQuotaBytes(ownerProfile) });
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
