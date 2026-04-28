import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
    uid: '',
    projectId: process.env.FIREBASE_PROJECT_ID ?? '',
    sourceCollection: 'songs',
    execute: false,
    deleteSource: false,
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--uid') {
      args.uid = argv[i + 1] ?? '';
      i += 1;
      continue;
    }

    if (arg === '--project') {
      args.projectId = argv[i + 1] ?? '';
      i += 1;
      continue;
    }

    if (arg === '--source') {
      args.sourceCollection = argv[i + 1] ?? 'songs';
      i += 1;
      continue;
    }

    if (arg === '--credentials') {
      args.credentials = argv[i + 1] ?? '';
      i += 1;
      continue;
    }

    if (arg === '--execute') {
      args.execute = true;
      continue;
    }

    if (arg === '--delete-source') {
      args.deleteSource = true;
    }
  }

  return args;
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

function toTargetPath(uid, songId) {
  return `users/${uid}/songs/${songId}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.uid) {
    throw new Error('Missing required --uid <firebase-auth-uid>');
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
  });

  const db = getFirestore();
  const sourceSnap = await db.collection(args.sourceCollection).get();

  if (sourceSnap.empty) {
    console.log(`No documents found in collection "${args.sourceCollection}".`);
    return;
  }

  let copied = 0;
  let deleted = 0;
  let writesInBatch = 0;
  let batches = 0;
  let batch = db.batch();

  const flush = async () => {
    if (writesInBatch === 0) return;

    if (args.execute) {
      await batch.commit();
    }

    batches += 1;
    writesInBatch = 0;
    batch = db.batch();
  };

  for (const sourceDoc of sourceSnap.docs) {
    const targetRef = db.doc(toTargetPath(args.uid, sourceDoc.id));
    const sourceData = sourceDoc.data();
    const targetData = {
      ...sourceData,
      userId: sourceData.userId ?? args.uid,
    };

    batch.set(targetRef, targetData, { merge: true });
    copied += 1;
    writesInBatch += 1;

    if (args.deleteSource) {
      batch.delete(sourceDoc.ref);
      deleted += 1;
      writesInBatch += 1;
    }

    if (writesInBatch >= 450) {
      await flush();
    }
  }

  await flush();

  const mode = args.execute ? 'EXECUTED' : 'DRY RUN';
  console.log(`\n[${mode}] Migration summary`);
  console.log(`Project: ${args.projectId || '(from credentials/default app)'}`);
  console.log(`Source collection: ${args.sourceCollection}`);
  console.log(`Target path: users/${args.uid}/songs`);
  console.log(`Songs to copy: ${copied}`);
  console.log(`Source docs to delete: ${deleted}`);
  console.log(`Batch operations: ${batches}`);

  if (!args.execute) {
    console.log('\nNo data was written. Re-run with --execute to apply changes.');
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
