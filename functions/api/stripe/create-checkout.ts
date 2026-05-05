/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';
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

export const onRequestPost: PagesFunction<Env, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const secretKey = ctx.env.STRIPE_SECRET_KEY;
  if (!secretKey) return Response.json({ error: 'Billing is not configured.' }, { status: 503 });

  const body = await ctx.request.json<{
    priceId?: string;
    successUrl?: string;
    cancelUrl?: string;
  }>().catch(() => null);

  if (!body?.priceId || !body?.successUrl || !body?.cancelUrl) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  if (!body.priceId.startsWith('price_')) {
    return Response.json(
      { error: 'Invalid Stripe price ID. Expected a value starting with "price_".' },
      { status: 400 }
    );
  }

  const userEmail = ctx.request.headers.get('x-gigboy-user-email')?.trim() ?? undefined;

  try {
    const stripe = getStripeClient(secretKey);

    // Retrieve or create Stripe Customer, storing the ID in Firestore.
    const profile = await getFirestoreDocument(ctx.env as Record<string, string | undefined>, ['users', userId]);
    let customerId = typeof profile?.stripeCustomerId === 'string' ? profile.stripeCustomerId : null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { firebaseUid: userId },
        ...(userEmail ? { email: userEmail } : {}),
      });
      customerId = customer.id;
      await setFirestoreDocument(ctx.env as Record<string, string | undefined>, ['users', userId], {
        stripeCustomerId: customerId,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: body.priceId, quantity: 1 }],
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { firebaseUid: userId },
      },
    });

    if (!session.url) {
      return Response.json({ error: 'Failed to create checkout session.' }, { status: 500 });
    }

    return Response.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown checkout error';
    console.error('create-checkout failed:', message);

    if (message.includes('No such price')) {
      return Response.json({ error: 'Stripe price ID is invalid for this environment.' }, { status: 400 });
    }

    if (message.includes('Firebase credentials not configured')) {
      return Response.json({ error: 'Billing backend is missing Firebase credentials.' }, { status: 503 });
    }

    return Response.json({ error: 'Failed to create checkout session.' }, { status: 500 });
  }
};
