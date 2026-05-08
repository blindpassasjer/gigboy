import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';

const DEFAULT_MAX_EDGE = 320;
const DEFAULT_QUALITY = 78;
const DEFAULT_CONCURRENCY = 4;

async function readDefaultProjectFromFirebaserc() {
  try {
    const raw = await readFile('.firebaserc', 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.projects?.default ?? '';
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const args = {
    projectId: process.env.FIREBASE_PROJECT_ID ?? '',
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
    bucket: process.env.FIREBASE_STORAGE_BUCKET ?? process.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    bandId: '',
    limit: 0,
    maxEdge: DEFAULT_MAX_EDGE,
    quality: DEFAULT_QUALITY,
    concurrency: DEFAULT_CONCURRENCY,
    force: false,
    execute: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--project') {
      args.projectId = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (arg === '--credentials') {
      args.credentials = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (arg === '--bucket') {
      args.bucket = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (arg === '--band') {
      args.bandId = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (arg === '--limit') {
      const parsed = Number.parseInt(argv[index + 1] ?? '', 10);
      args.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      index += 1;
      continue;
    }

    if (arg === '--max-edge') {
      const parsed = Number.parseInt(argv[index + 1] ?? '', 10);
      args.maxEdge = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_EDGE;
      index += 1;
      continue;
    }

    if (arg === '--quality') {
      const parsed = Number.parseInt(argv[index + 1] ?? '', 10);
      args.quality = Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? parsed : DEFAULT_QUALITY;
      index += 1;
      continue;
    }

    if (arg === '--concurrency') {
      const parsed = Number.parseInt(argv[index + 1] ?? '', 10);
      args.concurrency = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
      index += 1;
      continue;
    }

    if (arg === '--force') {
      args.force = true;
      continue;
    }

    if (arg === '--execute') {
      args.execute = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }

  return args;
}

function printHelp() {
  console.log('Press kit thumbnail backfill');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/backfill-presskit-thumbnails.mjs [options]');
  console.log('');
  console.log('Options:');
  console.log('  --execute                 Apply changes (default is dry run)');
  console.log('  --force                   Rebuild thumbnails even if thumbUrl exists');
  console.log('  --project <id>            Firebase project ID');
  console.log('  --credentials <path>      Service account JSON path');
  console.log('  --bucket <name>           Firebase Storage bucket name');
  console.log('  --band <id>               Process only one band');
  console.log('  --limit <n>               Process at most n candidates');
  console.log('  --max-edge <px>           Thumbnail max edge (default 320)');
  console.log('  --quality <1..100>        WebP quality (default 78)');
  console.log('  --concurrency <n>         Parallel workers (default 4)');
  console.log('  --help, -h                Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  npm run backfill:presskit-thumbs -- --project songbook-bebd5 --credentials ./config/firebase/service-account.json');
  console.log('  npm run backfill:presskit-thumbs -- --execute --project songbook-bebd5 --credentials ./config/firebase/service-account.json --bucket songbook-bebd5.firebasestorage.app');
}

async function createCredential(credentialsPath) {
  if (!credentialsPath) {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.warn(
        'No --credentials value provided. Falling back to Application Default Credentials. '
        + 'Set GOOGLE_APPLICATION_CREDENTIALS or pass --credentials <service-account.json> if auth fails.'
      );
    }
    return applicationDefault();
  }

  const raw = await readFile(credentialsPath, 'utf8');
  return cert(JSON.parse(raw));
}

function inferBucketFromDownloadUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return '';

  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    const bucketIndex = parts.findIndex((part) => part === 'b');
    if (bucketIndex >= 0 && parts[bucketIndex + 1]) {
      return decodeURIComponent(parts[bucketIndex + 1]);
    }
  } catch {
    return '';
  }

  return '';
}

function toThumbnailStoragePath(bandId, imageId) {
  if (imageId === 'band-logo') return `bands/${bandId}/logo-thumb.webp`;
  return `bands/${bandId}/presskit/images/${imageId}-thumb.webp`;
}

function toDownloadUrl(bucketName, storagePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}

async function fetchBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while downloading source image`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function buildThumbnail(sourceBuffer, maxEdge, quality) {
  return sharp(sourceBuffer)
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer();
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;

      results[index] = await mapper(items[index], index);
    }
  };

  const workerCount = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function listBandIds(db, explicitBandId) {
  if (explicitBandId) return [explicitBandId];

  const snap = await db.collection('bands').select().get();
  return snap.docs.map((doc) => doc.id);
}

async function collectCandidates(db, bandIds, force, limit) {
  const candidates = [];

  for (const bandId of bandIds) {
    const snap = await db.collection('bands').doc(bandId).collection('pressKitImages').get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const url = typeof data.url === 'string' ? data.url : '';
      if (!url) continue;

      const thumbUrl = typeof data.thumbUrl === 'string' ? data.thumbUrl : '';
      if (!force && thumbUrl) continue;

      candidates.push({
        bandId,
        doc,
        imageId: doc.id,
        sourceUrl: url,
      });

      if (limit > 0 && candidates.length >= limit) {
        return candidates;
      }
    }
  }

  return candidates;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.projectId) {
    args.projectId = await readDefaultProjectFromFirebaserc();
  }

  if (!args.projectId) {
    throw new Error('Missing Firebase project ID. Pass --project <project-id> or set FIREBASE_PROJECT_ID.');
  }

  const credential = await createCredential(args.credentials);

  initializeApp({
    credential,
    projectId: args.projectId || undefined,
    storageBucket: args.bucket || undefined,
  });

  const db = getFirestore();
  const bandIds = await listBandIds(db, args.bandId);

  if (bandIds.length === 0) {
    console.log('No bands found.');
    return;
  }

  const candidates = await collectCandidates(db, bandIds, args.force, args.limit);

  if (candidates.length === 0) {
    console.log('No press kit images require thumbnail backfill.');
    return;
  }

  if (!args.bucket) {
    args.bucket = inferBucketFromDownloadUrl(candidates[0].sourceUrl);
  }

  if (!args.bucket) {
    throw new Error(
      'Unable to determine Firebase Storage bucket. Pass --bucket <bucket-name> or set FIREBASE_STORAGE_BUCKET.'
    );
  }

  const storage = getStorage();
  const bucket = storage.bucket(args.bucket);

  let processed = 0;
  let updated = 0;
  let failed = 0;

  const startedAt = Date.now();
  const outcomes = await mapWithConcurrency(candidates, args.concurrency, async (candidate) => {
    processed += 1;

    try {
      const sourceBuffer = await fetchBuffer(candidate.sourceUrl);
      const thumbnailBuffer = await buildThumbnail(sourceBuffer, args.maxEdge, args.quality);
      const thumbStoragePath = toThumbnailStoragePath(candidate.bandId, candidate.imageId);

      if (!args.execute) {
        return {
          ok: true,
          updated: false,
          bandId: candidate.bandId,
          imageId: candidate.imageId,
          thumbStoragePath,
          thumbSizeBytes: thumbnailBuffer.length,
        };
      }

      const token = randomUUID();
      const thumbFile = bucket.file(thumbStoragePath);
      await thumbFile.save(thumbnailBuffer, {
        resumable: false,
        contentType: 'image/webp',
        metadata: {
          cacheControl: 'public,max-age=31536000,immutable',
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
        },
      });

      const thumbUrl = toDownloadUrl(bucket.name, thumbStoragePath, token);
      await candidate.doc.ref.set({
        thumbUrl,
        thumbStoragePath,
        thumbSizeBytes: thumbnailBuffer.length,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      updated += 1;
      return {
        ok: true,
        updated: true,
        bandId: candidate.bandId,
        imageId: candidate.imageId,
        thumbStoragePath,
        thumbSizeBytes: thumbnailBuffer.length,
      };
    } catch (error) {
      failed += 1;
      return {
        ok: false,
        updated: false,
        bandId: candidate.bandId,
        imageId: candidate.imageId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const failedItems = outcomes.filter((entry) => !entry.ok);
  const elapsedMs = Date.now() - startedAt;
  const mode = args.execute ? 'EXECUTED' : 'DRY RUN';

  console.log(`\n[${mode}] Press kit thumbnail backfill summary`);
  console.log(`Project: ${args.projectId}`);
  console.log(`Bucket: ${bucket.name}`);
  console.log(`Bands scanned: ${bandIds.length}`);
  console.log(`Candidates processed: ${processed}`);
  console.log(`Updated documents: ${updated}`);
  console.log(`Failed items: ${failed}`);
  console.log(`Max edge: ${args.maxEdge}px`);
  console.log(`Quality: ${args.quality}`);
  console.log(`Concurrency: ${args.concurrency}`);
  console.log(`Elapsed: ${(elapsedMs / 1000).toFixed(1)}s`);

  if (!args.execute) {
    console.log('\nNo data was written. Re-run with --execute to apply changes.');
  }

  if (failedItems.length > 0) {
    console.log('\nFailed entries (first 20):');
    failedItems.slice(0, 20).forEach((entry) => {
      console.log(`- band=${entry.bandId} image=${entry.imageId}: ${entry.error}`);
    });
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exitCode = 1;
});
