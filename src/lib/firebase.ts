import { initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { PUBLIC_FIREBASE_CONFIG } from './firebase.public';

const firebaseEnvConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasAnyFirebaseEnvOverride = Object.values(firebaseEnvConfig).some((value) => Boolean(value));
const missingEnvOverrideKeys = Object.entries(firebaseEnvConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

const hasCompleteFirebaseEnvOverride = hasAnyFirebaseEnvOverride && missingEnvOverrideKeys.length === 0;

const firebaseConfig = hasCompleteFirebaseEnvOverride
  ? {
      apiKey: firebaseEnvConfig.apiKey,
      authDomain: firebaseEnvConfig.authDomain,
      projectId: firebaseEnvConfig.projectId,
      storageBucket: firebaseEnvConfig.storageBucket,
      messagingSenderId: firebaseEnvConfig.messagingSenderId,
      appId: firebaseEnvConfig.appId,
    }
  : PUBLIC_FIREBASE_CONFIG ?? {
      apiKey: undefined,
      authDomain: undefined,
      projectId: undefined,
      storageBucket: undefined,
      messagingSenderId: undefined,
      appId: undefined,
    };

const shouldAllowCustomAuthDomain = import.meta.env.VITE_FIREBASE_ALLOW_CUSTOM_AUTH_DOMAIN === 'true';
const normalizedFirebaseConfig = { ...firebaseConfig };
const configuredAuthDomain = normalizedFirebaseConfig.authDomain?.trim();
const configuredProjectId = normalizedFirebaseConfig.projectId?.trim();
const hasFirebaseHostedAuthDomain = Boolean(
  configuredAuthDomain
  && (configuredAuthDomain.endsWith('.firebaseapp.com') || configuredAuthDomain.endsWith('.web.app')),
);

if (!shouldAllowCustomAuthDomain && configuredAuthDomain && configuredProjectId && !hasFirebaseHostedAuthDomain) {
  // OAuth popup/redirect handlers are hosted by Firebase Auth on the firebaseapp.com domain.
  normalizedFirebaseConfig.authDomain = `${configuredProjectId}.firebaseapp.com`;
}

const missingFirebaseEnv = Object.entries(normalizedFirebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

const hasInvalidPartialOverride = hasAnyFirebaseEnvOverride && !hasCompleteFirebaseEnvOverride;

export const firebaseEnabled = missingFirebaseEnv.length === 0 && !hasInvalidPartialOverride;
export const firebaseConfigError = firebaseEnabled
  ? null
  : hasInvalidPartialOverride
    ? `Incomplete Firebase override values: ${missingEnvOverrideKeys.join(', ')}. Set all VITE_FIREBASE_* values or remove them all to use the built-in config.`
    : `Missing Firebase configuration values: ${missingFirebaseEnv.join(', ')}`;

let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (firebaseEnabled) {
  const app = initializeApp(normalizedFirebaseConfig as {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  });
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { auth, db, storage };
