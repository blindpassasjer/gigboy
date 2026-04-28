/// <reference types="@cloudflare/workers-types" />

/**
 * Firebase Admin SDK initialization from environment variables.
 * 
 * Credentials should be provided via environment variables (never committed to git):
 * - FIREBASE_PROJECT_ID
 * - FIREBASE_PRIVATE_KEY
 * - FIREBASE_CLIENT_EMAIL
 * 
 * Do NOT use the JSON service account file from config/firebase/ in production.
 */

interface FirebaseConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
}

function getFirebaseConfig(env: Record<string, string>): FirebaseConfig | null {
  const { FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL } = env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_PRIVATE_KEY || !FIREBASE_CLIENT_EMAIL) {
    console.warn(
      'Firebase credentials not fully configured. Set FIREBASE_PROJECT_ID, '
      + 'FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables.'
    );
    return null;
  }

  return {
    projectId: FIREBASE_PROJECT_ID,
    privateKey: FIREBASE_PRIVATE_KEY,
    clientEmail: FIREBASE_CLIENT_EMAIL,
  };
}

export function initializeFirebaseAdmin(env: Record<string, string>) {
  const config = getFirebaseConfig(env);

  if (!config) {
    return {
      isConfigured: false,
      error: 'Firebase credentials not configured',
    };
  }

  // Firebase Admin SDK initialization would go here
  // Example structure for actual implementation:
  // import * as admin from 'firebase-admin';
  // admin.initializeApp({
  //   credential: admin.credential.cert({
  //     projectId: config.projectId,
  //     privateKeyId: env.FIREBASE_PRIVATE_KEY_ID || '',
  //     privateKey: config.privateKey.replace(/\\n/g, '\n'),
  //     clientEmail: config.clientEmail,
  //     clientId: env.FIREBASE_CLIENT_ID || '',
  //     authUri: 'https://accounts.google.com/o/oauth2/auth',
  //     tokenUri: 'https://oauth2.googleapis.com/token',
  //   }),
  //   projectId: config.projectId,
  // });

  return {
    isConfigured: true,
    config,
  };
}

export function requireFirebaseAdmin(env: Record<string, string>) {
  const { isConfigured, error } = initializeFirebaseAdmin(env);
  if (!isConfigured) {
    throw new Error(error);
  }
}
