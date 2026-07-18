/// <reference types="@cloudflare/workers-types" />
import Stripe from 'stripe';
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';
import {
  getStripeClient,
  updateUserPlan,
  planAndExtraMembersFromSubscription,
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
  STRIPE_CREW_MONTHLY_PRICE_ID?: string;
  STRIPE_CREW_ANNUAL_PRICE_ID?: string;
  STRIPE_CREW_MONTHLY_EXTRA_MEMBER_PRICE_ID?: string;
  STRIPE_CREW_ANNUAL_EXTRA_MEMBER_PRICE_ID?: string;
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

function isBandBasePriceId(priceId: string, env: Env): boolean {
  return priceId === env.STRIPE_CREW_MONTHLY_PRICE_ID || priceId === env.STRIPE_CREW_ANNUAL_PRICE_ID;
}

function isBandExtraPriceId(priceId: string, env: Env): boolean {
  return priceId === env.STRIPE_CREW_MONTHLY_EXTRA_MEMBER_PRICE_ID
    || priceId === env.STRIPE_CREW_ANNUAL_EXTRA_MEMBER_PRICE_ID;
}

function extractBandIdsFromSubscription(sub: Stripe.Subscription, env: Env): string[] {
  const ids = new Set<string>();
  sub.items.data.forEach((item) => {
    const priceId = item.price?.id ?? '';
    const isBandItem = isBandBasePriceId(priceId, env) || isBandExtraPriceId(priceId, env);
    if (!isBandItem) return;
    const bandId = item.metadata?.bandId;
    if (typeof bandId === 'string' && bandId.trim()) {
      ids.add(bandId.trim());
    }
  });
  return Array.from(ids);
}

async function writeBandBillingSnapshot(
  env: Record<string, string | undefined>,
  bandId: string,
  sub: Stripe.Subscription,
  envConfig: Env,
  overrideStatus?: ReturnType<typeof mapStripeStatus>
) {
  const status = overrideStatus ?? mapStripeStatus(sub.status);
  const baseItem = sub.items.data.find((item) => {
    const priceId = item.price?.id ?? '';
    return isBandBasePriceId(priceId, envConfig) && item.metadata?.bandId === bandId;
  }) ?? null;

  // Pro band: base price item is a Pro price ID (not a Crew/band price ID)
  const proBasePrices = new Set([envConfig.STRIPE_PRO_MONTHLY_PRICE_ID, envConfig.STRIPE_PRO_ANNUAL_PRICE_ID].filter(Boolean));
  const proItem = sub.items.data.find((item) => {
    const priceId = item.price?.id ?? '';
    return proBasePrices.has(priceId) && item.metadata?.bandId === bandId;
  }) ?? null;

  const extraItem = sub.items.data.find((item) => {
    const priceId = item.price?.id ?? '';
    return isBandExtraPriceId(priceId, envConfig) && item.metadata?.bandId === bandId;
  }) ?? null;

  const extraMembers = Math.max(0, Math.min(500, Math.trunc(extraItem?.quantity ?? 0)));
  const active = status === 'active' || status === 'trialing';
  const customerId = typeof sub.customer === 'string'
    ? sub.customer
    : (sub.customer as Stripe.Customer)?.id ?? null;

  // Determine the band's plan: 'crew' if Crew base item exists, 'pro' if Pro item exists, otherwise 'free'
  const bandBillingPlan = active && baseItem ? 'crew' : active && proItem ? 'pro' : 'free';
  const activeBandItem = baseItem ?? proItem;

  await setFirestoreDocument(env, ['bands', bandId], {
    billingPlan: bandBillingPlan,
    billingSubscriptionStatus: status,
    billingCurrentPeriodEnd: activeBandItem?.current_period_end ?? sub.items.data[0]?.current_period_end ?? null,
    billingExtraMembers: bandBillingPlan === 'crew' ? extraMembers : 0,
    billingMemberLimit: bandBillingPlan === 'crew' ? 5 + extraMembers : 1,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripeBandItemId: activeBandItem?.id ?? null,
    stripeExtraMembersItemId: extraItem?.id ?? null,
  });
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

        let sub = await stripe.subscriptions.retrieve(subId, { expand: ['customer'] });
        const uid = getUid(sub, sub.customer as Stripe.Customer | Stripe.DeletedCustomer | null);
        if (!uid) {
          console.error('checkout.session.completed: no firebaseUid in metadata', { subId });
          break;
        }

        const checkoutBandId = typeof session.metadata?.bandId === 'string'
          ? session.metadata.bandId.trim()
          : '';
        const pendingBandName = typeof session.metadata?.pendingBandName === 'string'
          ? session.metadata.pendingBandName.trim()
          : '';

        if (pendingBandName && checkoutBandId) {
          const existingBand = await getFirestoreDocument(env, ['bands', checkoutBandId]);
          if (!existingBand) {
            await setFirestoreDocument(env, ['bands', checkoutBandId], {
              id: checkoutBandId,
              name: pendingBandName,
              ownerId: uid,
              memberIds: [uid],
              memberRoles: { [uid]: 'editor' },
              createdAt: Math.floor(Date.now() / 1000),
            });
          }
        }

        // For band subscriptions, ensure items have bandId metadata
        if (checkoutBandId) {
          const baseItemWithoutBand = sub.items.data.find((item) => {
            const priceId = item.price?.id ?? '';
            return isBandBasePriceId(priceId, ctx.env) && !item.metadata?.bandId;
          }) ?? null;

          const extraItemWithoutBand = sub.items.data.find((item) => {
            const priceId = item.price?.id ?? '';
            return isBandExtraPriceId(priceId, ctx.env) && !item.metadata?.bandId;
          }) ?? null;

          if (baseItemWithoutBand || extraItemWithoutBand) {
            const items: Stripe.SubscriptionUpdateParams.Item[] = [];
            if (baseItemWithoutBand) {
              items.push({
                id: baseItemWithoutBand.id,
                metadata: {
                  ...(baseItemWithoutBand.metadata ?? {}),
                  bandId: checkoutBandId,
                  itemType: 'band_base',
                },
              });
            }
            if (extraItemWithoutBand) {
              items.push({
                id: extraItemWithoutBand.id,
                metadata: {
                  ...(extraItemWithoutBand.metadata ?? {}),
                  bandId: checkoutBandId,
                  itemType: 'band_extra_members',
                },
              });
            }

            sub = await stripe.subscriptions.update(sub.id, { items });
          }
        }

        const { plan, bandExtraMembers } = planAndExtraMembersFromSubscription(sub, env);
        const status = mapStripeStatus(sub.status);
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
        const currentPeriodEnd = sub.items.data[0]?.current_period_end ?? null;

        await updateUserPlan(env, uid, {
          plan,
          subscriptionStatus: status,
          currentPeriodEnd: currentPeriodEnd ?? null,
          stripeCustomerId: customerId,
          bandExtraMembers,
        });

        // Write band billing snapshot for band subscriptions
        // This handles both band_aggregate metadata mode and band item detection by checkoutBandId
        if (sub.metadata?.gigboyMode === 'band_aggregate' || checkoutBandId) {
          const bandIds = extractBandIdsFromSubscription(sub, ctx.env);
          if (bandIds.length > 0) {
            await Promise.all(
              bandIds.map((bandId) => writeBandBillingSnapshot(env, bandId, sub, ctx.env))
            );
          } else if (checkoutBandId) {
            // Fallback: if checkoutBandId exists but no bandIds were extracted, 
            // write the band subscription directly using checkoutBandId
            await writeBandBillingSnapshot(env, checkoutBandId, sub, ctx.env);
          }
        }
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

        const { plan, bandExtraMembers } = planAndExtraMembersFromSubscription(expandedSub, env);
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
          bandExtraMembers,
        });

        // Always sync band billing data if subscription contains band items
        if (expandedSub.metadata?.gigboyMode === 'band_aggregate') {
          const bandIds = extractBandIdsFromSubscription(expandedSub, ctx.env);
          if (bandIds.length > 0) {
            await Promise.all(
              bandIds.map((bandId) => writeBandBillingSnapshot(env, bandId, expandedSub, ctx.env))
            );
          }
        }
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
          bandExtraMembers: 0,
        });

        // Clear band subscription data when subscription is canceled/deleted
        if (expandedSub.metadata?.gigboyMode === 'band_aggregate') {
          const bandIds = extractBandIdsFromSubscription(expandedSub, ctx.env);
          if (bandIds.length > 0) {
            await Promise.all(
              bandIds.map((bandId) => writeBandBillingSnapshot(env, bandId, expandedSub, ctx.env, 'canceled'))
            );
          }
        }
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
          ...planAndExtraMembersFromSubscription(sub, env),
          subscriptionStatus: 'past_due',
          currentPeriodEnd: sub.items.data[0]?.current_period_end ?? null,
          stripeCustomerId: typeof sub.customer === 'string'
            ? sub.customer
            : (sub.customer as Stripe.Customer)?.id ?? null,
        });

        if (sub.metadata?.gigboyMode === 'band_aggregate') {
          const bandIds = extractBandIdsFromSubscription(sub, ctx.env);
          await Promise.all(
            bandIds.map((bandId) => writeBandBillingSnapshot(env, bandId, sub, ctx.env, 'past_due'))
          );
        }
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
