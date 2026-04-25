import { initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyA2anSovYmXrjU8fnq15_y6cfCUY_JD73M',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'songbook-bebd5.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'songbook-bebd5',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'songbook-bebd5.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '179160244928',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:179160244928:web:8a1d8769fedab44bb10325',
};

const missingFirebaseEnv = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const firebaseEnabled = missingFirebaseEnv.length === 0;
export const firebaseConfigError = firebaseEnabled
  ? null
  : `Missing Firebase environment variables: ${missingFirebaseEnv.join(', ')}`;

let auth: Auth | null = null;
let db: Firestore | null = null;

if (firebaseEnabled) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { auth, db };
