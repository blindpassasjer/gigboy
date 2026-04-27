import { initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { PUBLIC_FIREBASE_CONFIG } from './firebase.public';

const firebaseEnvConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseConfig = {
  apiKey: firebaseEnvConfig.apiKey || PUBLIC_FIREBASE_CONFIG.apiKey,
  authDomain: firebaseEnvConfig.authDomain || PUBLIC_FIREBASE_CONFIG.authDomain,
  projectId: firebaseEnvConfig.projectId || PUBLIC_FIREBASE_CONFIG.projectId,
  storageBucket: firebaseEnvConfig.storageBucket || PUBLIC_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: firebaseEnvConfig.messagingSenderId || PUBLIC_FIREBASE_CONFIG.messagingSenderId,
  appId: firebaseEnvConfig.appId || PUBLIC_FIREBASE_CONFIG.appId,
};

const missingFirebaseEnv = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const firebaseEnabled = missingFirebaseEnv.length === 0;
export const firebaseConfigError = firebaseEnabled
  ? null
  : `Missing Firebase configuration values: ${missingFirebaseEnv.join(', ')}`;

let auth: Auth | null = null;
let db: Firestore | null = null;

if (firebaseEnabled) {
  const app = initializeApp(firebaseConfig as {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  });
  auth = getAuth(app);
  db = getFirestore(app);
}

export { auth, db };
