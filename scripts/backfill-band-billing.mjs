/**
 * backfill-band-billing.mjs
 *
 * Reads every band in Firestore, looks up the matching Stripe subscription
 * via the band's stripeSubscriptionId (or by scanning the customer's
 * subscriptions for a gigboyMode=band_aggregate sub whose items carry the
 * bandId in metadata), then writes the billing snapshot fields back to the
 * band document.
 *
 * Usage:
 *   node scripts/backfill-band-billing.mjs \
 *     --credentials config/firebase/<service-account>.json \
 *     --stripe-key sk_live_xxx \
 *     [--project <firebase-project-id>] \
 *     [--execute]
 *
 * Omit --execute for a dry-run that prints what would change.
 *
 * Env-var equivalents:
 *   FIREBASE_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS, STRIPE_SECRET_KEY
 */

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Arg / env parsing
// ---------------------------------------------------------------------------

async function readDefaultProjectFromFirebaserc() {
  try {
    const raw = await readFile('.firebaserc', 'utf8');
    return JSON.parse(raw)?.projects?.default ?? '';
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const args = {
    projectId: process.env.FIREBASE_PROJECT_ID ?? '',
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
    stripeKey: process.env.STRIPE_SECRET_KEY ?? '',
    bandsCollection: 'bands',
    execute: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') { args.projectId = argv[i + 1] ?? ''; i += 1; continue; }
    if (arg === '--credentials') { args.credentials = argv[i + 1] ?? ''; i += 1; continue; }
    if (arg === '--stripe-key') { args.stripeKey = argv[i + 1] ?? ''; i += 1; continue; }
    if (arg === '--bands') { args.bandsCollection = argv[i + 1] ?? 'bands'; i += 1; continue; }
    if (arg === '--execute') { args.execute = true; }
  }
    if (argv.includes('--debug')) { args.debug = true; }

    return args;
}

async function createCredential(credentialsPath) {
  if (!credentialsPath) {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.warn(
        'No --credentials provided. Falling back to Application Default Credentials.'
      );
    }
    return applicationDefault();
  }
  const raw = await readFile(credentialsPath, 'utf8');
  return cert(JSON.parse(raw));
}

// ---------------------------------------------------------------------------
// Stripe helpers
// ---------------------------------------------------------------------------

const ALLOWED_STATUSES = new Set([
  'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete',
]);

function mapStatus(stripeStatus) {
  return ALLOWED_STATUSES.has(stripeStatus) ? stripeStatus : null;
}

function isActive(status) {
  return status === 'active' || status === 'trialing';
}

/**
 * Given a Stripe subscription and a bandId, find the base band item and the
 * optional extra-members item for that band, based on item.metadata.bandId.
 *
 * Falls back to the first subscription item when no item has bandId metadata
 * (covers older or manually-created subscriptions not tagged via checkout).
 */
function extractBandItems(sub, bandId) {
  // Primary: exact metadata match by itemType + bandId
  let base = sub.items.data.find(
    (item) => item.metadata?.itemType === 'band_base' && item.metadata?.bandId === bandId
  ) ?? sub.items.data.find(
    (item) => item.metadata?.bandId === bandId && item.metadata?.itemType !== 'band_extra_members'
  ) ?? null;

  // Fallback: subscription has no bandId-tagged items at all — treat first item as base.
  // Only applies when there is exactly one non-extra-members item (unambiguous).
  if (!base) {
    const anyBandIdSet = sub.items.data.some((item) => item.metadata?.bandId);
    if (!anyBandIdSet) {
      base = sub.items.data[0] ?? null;
      if (base) {
        console.warn(
          `    [WARN] No bandId metadata found on subscription ${sub.id} items — using first item (${base.id}) as base for band ${bandId}.`
        );
      }
    }
  }

  const extra = sub.items.data.find(
    (item) => item.metadata?.itemType === 'band_extra_members' && item.metadata?.bandId === bandId
  ) ?? null;

  return { base, extra };
}

/**
 * Build the Firestore billing snapshot from a Stripe subscription + bandId.
 */
function buildSnapshot(sub, bandId, customerId) {
  const status = mapStatus(sub.status);
  const active = isActive(status);
  const { base, extra } = extractBandItems(sub, bandId);
  const extraQty = Math.max(0, Math.min(500, Math.trunc(extra?.quantity ?? 0)));

  return {
    billingPlan: active && base ? 'crew' : 'free',
    billingSubscriptionStatus: status,
    billingCurrentPeriodEnd:
      base?.current_period_end
      ?? sub.items.data[0]?.current_period_end
      ?? null,
    billingExtraMembers: active && base ? extraQty : 0,
    billingMemberLimit: active && base ? 5 + extraQty : 1,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripeBandItemId: base?.id ?? null,
    stripeExtraMembersItemId: extra?.id ?? null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Find the best subscription for a customer/band combination.
 *
 * Priority:
 * 1. band_aggregate sub with an item whose metadata.bandId matches
 * 2. Any active/trialing sub for the customer (last resort for legacy subs)
 *
 * Returns null if nothing found.
 */
async function findSubscriptionForBand(stripe, customerId, bandId) {
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 25,
    expand: ['data.items'],
  });

  // First pass: proper aggregate sub with matching bandId item
  if (list.data.length === 0) return null;

  for (const sub of list.data) {
    if (sub.metadata?.gigboyMode !== 'band_aggregate') continue;
    const hasBand = sub.items.data.some((item) => item.metadata?.bandId === bandId);
    if (hasBand) return sub;
  }

  // Second pass: any aggregate sub (items may lack bandId metadata — will use first-item fallback)
  for (const sub of list.data) {
    if (sub.metadata?.gigboyMode !== 'band_aggregate') continue;
    if (sub.status === 'active' || sub.status === 'trialing') {
      console.warn(
        `    [WARN] Sub ${sub.id} is aggregate but no item has bandId=${bandId}. Will attempt first-item fallback.`
      );
      return sub;
    }
  }

  // Third pass: any active/trialing subscription at all (legacy, one-band accounts)
  const activeSub = list.data.find(
    (sub) => sub.status === 'active' || sub.status === 'trialing'
  );
  if (activeSub) {
    console.warn(
      `    [WARN] No band_aggregate sub found for band ${bandId}. Falling back to first active sub ${activeSub.id}.`
    );
    return activeSub;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.projectId) args.projectId = await readDefaultProjectFromFirebaserc();
  if (!args.projectId) {
    throw new Error(
      'Missing Firebase project ID. Pass --project <id> or set FIREBASE_PROJECT_ID.'
    );
  }
  if (!args.stripeKey) {
    throw new Error(
      'Missing Stripe secret key. Pass --stripe-key sk_xxx or set STRIPE_SECRET_KEY.'
    );
  }

  // Firebase
  const credential = await createCredential(args.credentials);
  initializeApp({ credential, projectId: args.projectId });
  const db = getFirestore();

  // Stripe
  const stripe = new Stripe(args.stripeKey, {
    apiVersion: '2025-03-31.basil',
  });

  const bandsSnap = await db.collection(args.bandsCollection).get();
  console.log(`Bands to process: ${bandsSnap.size}`);

  const stats = {
    skippedNoOwner: 0,
    skippedNoCustomer: 0,
    skippedNoSub: 0,
    alreadyCorrect: 0,
    willUpdate: 0,
    errors: 0,
  };

  let batch = db.batch();
  let writesInBatch = 0;
  let totalBatches = 0;
  const pendingRows = [];

  const flushBatch = async () => {
    if (writesInBatch === 0) return;
    if (args.execute) await batch.commit();
    totalBatches += 1;
    writesInBatch = 0;
    batch = db.batch();
  };

  for (const bandDoc of bandsSnap.docs) {
    const data = bandDoc.data();
    const bandId = bandDoc.id;
    const ownerId = typeof data.ownerId === 'string' ? data.ownerId : null;

    if (!ownerId) {
      console.warn(`  [SKIP] ${bandId} — no ownerId`);
      stats.skippedNoOwner += 1;
      continue;
    }

    // Determine the Stripe customer ID:
    // 1. From the band doc itself (written after checkout)
    // 2. From the user's profile doc
    let customerId = typeof data.stripeCustomerId === 'string' ? data.stripeCustomerId : null;
    let customerIdSource = 'band doc';

    if (!customerId) {
      try {
        const userDoc = await db.collection('users').doc(ownerId).get();
        customerId = typeof userDoc.data()?.stripeCustomerId === 'string'
          ? userDoc.data().stripeCustomerId
          : null;
        if (customerId) customerIdSource = 'user profile';
      } catch {
        // proceed
      }
    }

    if (!customerId) {
      console.warn(`  [SKIP] ${bandId} — no stripeCustomerId on band or owner profile`);
      stats.skippedNoCustomer += 1;
      continue;
    }

    if (args.debug) {
      console.log(`\n  [DEBUG] Band: ${bandId} "${data.name ?? ''}"`);
      console.log(`    ownerId: ${ownerId}`);
      console.log(`    customerId: ${customerId} (from ${customerIdSource})`);
      console.log(`    stored stripeSubscriptionId: ${data.stripeSubscriptionId ?? '(none)'}`);

      // Dump raw Stripe subscription list for this customer
      try {
        const rawList = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 25, expand: ['data.items'] });
        console.log(`    Stripe subscriptions found: ${rawList.data.length}`);
        for (const sub of rawList.data) {
          console.log(`      sub ${sub.id}  status=${sub.status}  gigboyMode=${sub.metadata?.gigboyMode ?? '(none)'}  firebaseUid=${sub.metadata?.firebaseUid ?? '(none)'}`);
          for (const item of sub.items.data) {
            console.log(`        item ${item.id}  price=${item.price?.id}  qty=${item.quantity}  metadata=${JSON.stringify(item.metadata ?? {})}`);
          }
        }
      } catch (debugErr) {
        console.log(`    [DEBUG] Stripe list failed: ${debugErr.message}`);
      }
    }

    // Look up subscription
    let sub = null;
    try {
      // If we already have a stripeSubscriptionId, retrieve it directly
      if (typeof data.stripeSubscriptionId === 'string') {
        sub = await stripe.subscriptions.retrieve(data.stripeSubscriptionId, {
          expand: ['items'],
        });
      }

      // If the retrieved sub doesn't have an item for this band, or there was no
      // stored sub ID, scan the customer's subscriptions
      const hasMatchingItem = sub
        ? sub.items.data.some((item) => item.metadata?.bandId === bandId)
        : false;

      if (!sub || !hasMatchingItem) {
        sub = await findSubscriptionForBand(stripe, customerId, bandId);
      }
    } catch (err) {
      console.error(`  [ERROR] ${bandId} — Stripe lookup failed: ${err.message}`);
      stats.errors += 1;
      continue;
    }

    if (!sub) {
      console.warn(`  [SKIP] ${bandId} — no matching Stripe subscription found`);
      stats.skippedNoSub += 1;
      continue;
    }

    const snapshot = buildSnapshot(sub, bandId, customerId);

    // Check if already in sync (avoid unnecessary writes)
    const alreadySynced =
      data.billingPlan === snapshot.billingPlan
      && data.billingSubscriptionStatus === snapshot.billingSubscriptionStatus
      && data.billingCurrentPeriodEnd === snapshot.billingCurrentPeriodEnd
      && data.billingExtraMembers === snapshot.billingExtraMembers
      && data.billingMemberLimit === snapshot.billingMemberLimit
      && data.stripeSubscriptionId === snapshot.stripeSubscriptionId
      && data.stripeBandItemId === snapshot.stripeBandItemId;

    if (alreadySynced) {
      console.log(`  [OK]   ${bandId} — already in sync`);
      stats.alreadyCorrect += 1;
      continue;
    }

    pendingRows.push({
      bandId,
      bandName: typeof data.name === 'string' ? data.name : '(unnamed)',
      before: {
        billingPlan: data.billingPlan,
        billingSubscriptionStatus: data.billingSubscriptionStatus,
        billingMemberLimit: data.billingMemberLimit,
      },
      after: {
        billingPlan: snapshot.billingPlan,
        billingSubscriptionStatus: snapshot.billingSubscriptionStatus,
        billingMemberLimit: snapshot.billingMemberLimit,
      },
    });

    batch.set(bandDoc.ref, snapshot, { merge: true });
    writesInBatch += 1;
    stats.willUpdate += 1;

    if (writesInBatch >= 450) {
      await flushBatch();
    }
  }

  await flushBatch();

  const mode = args.execute ? 'EXECUTED' : 'DRY RUN';
  console.log(`\n[${mode}] Band billing backfill summary`);
  console.log(`Project: ${args.projectId}`);
  console.log(`Bands scanned: ${bandsSnap.size}`);
  console.log(`Already in sync: ${stats.alreadyCorrect}`);
  console.log(`Updated: ${stats.willUpdate}`);
  console.log(`Skipped — no ownerId: ${stats.skippedNoOwner}`);
  console.log(`Skipped — no Stripe customer: ${stats.skippedNoCustomer}`);
  console.log(`Skipped — no matching subscription: ${stats.skippedNoSub}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Batch commits: ${totalBatches}`);

  if (pendingRows.length > 0) {
    console.log('\nChanges:');
    for (const row of pendingRows) {
      console.log(
        `  ${row.bandId} "${row.bandName}" — ${row.before.billingPlan ?? 'undefined'} → ${row.after.billingPlan}  |  status: ${row.before.billingSubscriptionStatus ?? 'undefined'} → ${row.after.billingSubscriptionStatus}  |  memberLimit: ${row.before.billingMemberLimit ?? 'undefined'} → ${row.after.billingMemberLimit}`
      );
    }
  }

  if (!args.execute) {
    console.log('\nNo data was written. Re-run with --execute to apply changes.');
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exitCode = 1;
});
