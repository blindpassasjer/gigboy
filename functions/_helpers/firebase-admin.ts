import './cf-process-patch';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

interface FirebaseConfig {
  projectId?: string;
  clientEmail?: string;
}

function getFirebaseConfig(env: Record<string, string | undefined>): FirebaseConfig {
  return {
    projectId: env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
  };
}

function ensureFirebaseApp(env: Record<string, string | undefined>) {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = env.FIREBASE_PROJECT_ID;
  const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;

  if (projectId && privateKey && clientEmail) {
    return initializeApp({
      credential: cert({
        projectId,
        privateKey,
        clientEmail,
      }),
    });
  }

  return initializeApp();
}

function collectionPath(segments: string[]) {
  return segments.map((segment) => segment.trim()).filter(Boolean).join('/');
}

function documentPath(segments: string[]) {
  return collectionPath(segments);
}

export function initializeFirebaseAdmin(env: Record<string, string | undefined>) {
  try {
    const app = ensureFirebaseApp(env);
    const config = getFirebaseConfig(env);

    return {
      isConfigured: true,
      config: {
        projectId: config.projectId ?? app.options.projectId,
        clientEmail: config.clientEmail,
      },
    };
  } catch (error) {
    return {
      isConfigured: false,
      error: error instanceof Error ? error.message : 'Firebase Admin initialization failed.',
    };
  }
}

export function requireFirebaseAdmin(env: Record<string, string | undefined>) {
  const admin = initializeFirebaseAdmin(env);
  if (!admin.isConfigured) {
    throw new Error(admin.error);
  }
}

export async function getFirestoreDocument(
  env: Record<string, string | undefined>,
  segments: string[],
): Promise<Record<string, unknown> | null> {
  ensureFirebaseApp(env);
  const db = getFirestore();
  const path = documentPath(segments);
  const snapshot = await db.doc(path).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as Record<string, unknown>;
}

export async function setFirestoreDocument(
  env: Record<string, string | undefined>,
  segments: string[],
  payload: Record<string, unknown>,
) {
  ensureFirebaseApp(env);
  const db = getFirestore();
  const path = documentPath(segments);
  await db.doc(path).set(payload);
}

export async function deleteFirestoreDocument(
  env: Record<string, string | undefined>,
  segments: string[],
) {
  ensureFirebaseApp(env);
  const db = getFirestore();
  const path = documentPath(segments);
  await db.doc(path).delete();
}

export async function listFirestoreDocuments(
  env: Record<string, string | undefined>,
  segments: string[],
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  ensureFirebaseApp(env);
  const db = getFirestore();
  const path = collectionPath(segments);
  const snapshot = await db.collection(path).get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as Record<string, unknown>,
  }));
}
