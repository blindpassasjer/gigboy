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
    projectId: process.env.FIREBASE_PROJECT_ID ?? '',
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
    execute: false,
    alsoFillUsersFromUsername: false,
    usersCollection: 'users',
    bandsCollection: 'bands',
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

    if (arg === '--users') {
      args.usersCollection = argv[index + 1] ?? 'users';
      index += 1;
      continue;
    }

    if (arg === '--bands') {
      args.bandsCollection = argv[index + 1] ?? 'bands';
      index += 1;
      continue;
    }

    if (arg === '--execute') {
      args.execute = true;
      continue;
    }

    if (arg === '--also-fill-users-from-username') {
      args.alsoFillUsersFromUsername = true;
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

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

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
  const [usersSnap, bandsSnap] = await Promise.all([
    db.collection(args.usersCollection).get(),
    db.collection(args.bandsCollection).get(),
  ]);

  const fullNameByUserId = new Map();
  const usernameByUserId = new Map();

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    fullNameByUserId.set(userDoc.id, normalizeText(data.fullName));
    usernameByUserId.set(userDoc.id, normalizeText(data.username));
  }

  let usersUpdated = 0;
  let usersMissingFullName = 0;
  let bandsUpdated = 0;
  let bandMembersFilled = 0;
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

  for (const userDoc of usersSnap.docs) {
    const currentFullName = fullNameByUserId.get(userDoc.id) ?? '';
    if (currentFullName) {
      continue;
    }

    usersMissingFullName += 1;

    if (!args.alsoFillUsersFromUsername) {
      continue;
    }

    const fallbackFromUsername = usernameByUserId.get(userDoc.id) ?? '';
    if (!fallbackFromUsername) {
      continue;
    }

    batch.set(userDoc.ref, { fullName: fallbackFromUsername, updatedAt: new Date().toISOString() }, { merge: true });
    fullNameByUserId.set(userDoc.id, fallbackFromUsername);
    usersUpdated += 1;
    writesInBatch += 1;

    if (writesInBatch >= 450) {
      await flush();
    }
  }

  for (const bandDoc of bandsSnap.docs) {
    const bandData = bandDoc.data();
    const memberIds = Array.isArray(bandData.memberIds)
      ? bandData.memberIds.filter((entry) => typeof entry === 'string')
      : [];

    const existingMemberFullNames =
      typeof bandData.memberFullNames === 'object' && bandData.memberFullNames !== null
        ? { ...bandData.memberFullNames }
        : {};

    let changed = false;
    for (const memberId of memberIds) {
      const fullName = fullNameByUserId.get(memberId) ?? '';
      if (!fullName) continue;

      if (existingMemberFullNames[memberId] !== fullName) {
        existingMemberFullNames[memberId] = fullName;
        changed = true;
        bandMembersFilled += 1;
      }
    }

    if (!changed) {
      continue;
    }

    batch.set(bandDoc.ref, {
      memberFullNames: existingMemberFullNames,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    bandsUpdated += 1;
    writesInBatch += 1;

    if (writesInBatch >= 450) {
      await flush();
    }
  }

  await flush();

  const mode = args.execute ? 'EXECUTED' : 'DRY RUN';
  console.log(`\n[${mode}] Full-name migration summary`);
  console.log(`Project: ${args.projectId || '(from credentials/default app)'}`);
  console.log(`Users scanned: ${usersSnap.size}`);
  console.log(`Users missing fullName: ${usersMissingFullName}`);
  console.log(`Users updated (fallback from username): ${usersUpdated}`);
  console.log(`Bands scanned: ${bandsSnap.size}`);
  console.log(`Bands updated with memberFullNames: ${bandsUpdated}`);
  console.log(`Band member full-name entries filled/updated: ${bandMembersFilled}`);
  console.log(`Batch operations: ${batches}`);

  if (!args.execute) {
    console.log('\nNo data was written. Re-run with --execute to apply changes.');
  }

  if (usersMissingFullName > 0 && !args.alsoFillUsersFromUsername) {
    console.log('\nTip: Ask users to update Profile -> Full name for true names.');
    console.log('Optional: use --also-fill-users-from-username to backfill placeholders.');
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
