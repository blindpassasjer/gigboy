/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument } from '../../_helpers/firebase-admin';
import { getStripeClient } from '../../_helpers/stripe';

interface Env {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  STRIPE_SECRET_KEY?: string;
}

interface Data extends Record<string, unknown> {
  userId?: string;
}

function isAllowedReturnUrl(url: string, requestOrigin: string): boolean {
  try {
    return new URL(url).origin === requestOrigin;
  } catch {
    return false;
  }
}

export const onRequestPost: PagesFunction<Env, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const secretKey = ctx.env.STRIPE_SECRET_KEY;
  if (!secretKey) return Response.json({ error: 'Billing is not configured.' }, { status: 503 });

  const body = await ctx.request.json<{ returnUrl?: string }>().catch(() => null);
  if (!body?.returnUrl) {
    return Response.json({ error: 'Missing returnUrl.' }, { status: 400 });
  }

  const requestOrigin = new URL(ctx.request.url).origin;
  if (!isAllowedReturnUrl(body.returnUrl, requestOrigin)) {
    return Response.json({ error: 'Invalid returnUrl.' }, { status: 400 });
  }

  const profile = await getFirestoreDocument(ctx.env as Record<string, string | undefined>, ['users', userId]);
  const customerId = typeof profile?.stripeCustomerId === 'string' ? profile.stripeCustomerId : null;
  if (!customerId) {
    return Response.json({ error: 'No billing account found. Please subscribe first.' }, { status: 404 });
  }

  const stripe = getStripeClient(secretKey);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: body.returnUrl,
  });

  return Response.json({ url: session.url });
};
