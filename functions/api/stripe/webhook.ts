/// <reference types="@cloudflare/workers-types" />
import Stripe from 'stripe';
import {
  getStripeClient,
  updateUserPlan,
  planTierFromPriceId,
  mapStripeStatus,
} from '../../_helpers/stripe';

interface Env {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRO_MONTHLY_PRICE_ID?: string;
  STRIPE_PRO_ANNUAL_PRICE_ID?: string;
  STRIPE_BAND_MONTHLY_PRICE_ID?: string;
  STRIPE_BAND_ANNUAL_PRICE_ID?: string;
}

/** Extract Firebase UID from subscription or customer metadata. */
function getUid(
  sub: Stripe.Subscription,
  customer: Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  const subUid = sub.metadata?.firebaseUid;
  if (typeof subUid === 'string' && subUid) return subUid;
  if (customer && customer.object === 'customer' && !customer.deleted) {
    const custUid = (customer as Stripe.Customer).metadata?.firebaseUid;
    if (typeof custUid === 'string' && custUid) return custUid;
  }
  return null;
}

export const onRequestPost: PagesFunction<Env, never, Record<string, unknown>> = async (ctx) => {
  const secretKey = ctx.env.STRIPE_SECRET_KEY;
  const webhookSecret = ctx.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    return new Response('Webhook not configured', { status: 503 });
  }

  const signature = ctx.request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  const rawBody = await ctx.request.text();
  const stripe = getStripeClient(secretKey);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid signature';
    console.error('Stripe webhook signature verification failed:', msg);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  const env = ctx.env as unknown as Record<string, string | undefined>;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription' || !session.subscription) break;

        const subId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;

        const sub = await stripe.subscriptions.retrieve(subId, { expand: ['customer'] });
        const uid = getUid(sub, sub.customer as Stripe.Customer | Stripe.DeletedCustomer | null);
        if (!uid) {
          console.error('checkout.session.completed: no firebaseUid in metadata', { subId });
          break;
        }

        const priceId = sub.items.data[0]?.price.id ?? '';
        const plan = planTierFromPriceId(priceId, env);
        const status = mapStripeStatus(sub.status);
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
        const currentPeriodEnd = sub.items.data[0]?.current_period_end ?? null;

        await updateUserPlan(env, uid, {
          plan,
          subscriptionStatus: status,
          currentPeriodEnd: currentPeriodEnd ?? null,
          stripeCustomerId: customerId,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const expandedSub = await stripe.subscriptions.retrieve(sub.id, { expand: ['customer'] });
        const uid = getUid(expandedSub, expandedSub.customer as Stripe.Customer | Stripe.DeletedCustomer | null);
        if (!uid) {
          console.error('customer.subscription.updated: no firebaseUid', { subId: sub.id });
          break;
        }

        const priceId = expandedSub.items.data[0]?.price.id ?? '';
        const plan = planTierFromPriceId(priceId, env);
        const status = mapStripeStatus(expandedSub.status);
        const customerId = typeof expandedSub.customer === 'string'
          ? expandedSub.customer
          : (expandedSub.customer as Stripe.Customer)?.id ?? null;
        const currentPeriodEnd = expandedSub.items.data[0]?.current_period_end ?? null;

        await updateUserPlan(env, uid, {
          plan,
          subscriptionStatus: status,
          currentPeriodEnd: currentPeriodEnd ?? null,
          stripeCustomerId: customerId,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const expandedSub = await stripe.subscriptions.retrieve(sub.id, { expand: ['customer'] });
        const uid = getUid(expandedSub, expandedSub.customer as Stripe.Customer | Stripe.DeletedCustomer | null);
        if (!uid) {
          console.error('customer.subscription.deleted: no firebaseUid', { subId: sub.id });
          break;
        }

        const customerId = typeof expandedSub.customer === 'string'
          ? expandedSub.customer
          : (expandedSub.customer as Stripe.Customer)?.id ?? null;

        await updateUserPlan(env, uid, {
          plan: 'free',
          subscriptionStatus: 'canceled',
          currentPeriodEnd: null,
          stripeCustomerId: customerId,
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.subscription;
        if (!subRef) break;

        const subId = typeof subRef === 'string' ? subRef : subRef.id;
        const sub = await stripe.subscriptions.retrieve(subId, { expand: ['customer'] });
        const uid = getUid(sub, sub.customer as Stripe.Customer | Stripe.DeletedCustomer | null);
        if (!uid) break;

        // Mark as past_due without downgrading the plan immediately.
        await updateUserPlan(env, uid, {
          plan: planTierFromPriceId(sub.items.data[0]?.price.id ?? '', env),
          subscriptionStatus: 'past_due',
          currentPeriodEnd: sub.items.data[0]?.current_period_end ?? null,
          stripeCustomerId: typeof sub.customer === 'string'
            ? sub.customer
            : (sub.customer as Stripe.Customer)?.id ?? null,
        });
        break;
      }

      default:
        // Ignore other event types
        break;
    }
  } catch (err) {
    console.error('Error processing Stripe webhook event:', event.type, err);
    return new Response('Internal error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
};
