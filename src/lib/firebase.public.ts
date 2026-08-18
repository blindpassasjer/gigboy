// TEMPORARY: restored 2026-08-18 as an emergency hotfix — the production Cloudflare
// Pages deploy has no VITE_FIREBASE_* dashboard variables configured, so removing this
// fallback broke login/logout and the band workspace (firebaseEnabled fell back to
// false, i.e. local-only mode) the moment it shipped. Once VITE_FIREBASE_* are set as
// real dashboard env vars for the production environment, delete this hardcoded config
// again — Firebase web config isn't a true secret (protected by Firestore/Storage
// rules), but it shouldn't be a committed fallback that self-hosters/forks silently
// inherit and write data into. See SELFHOSTING.md / README.md Firebase setup section.
export const PUBLIC_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA2anSovYmXrjU8fnq15_y6cfCUY_JD73M',
  authDomain: 'songbook-bebd5.firebaseapp.com',
  projectId: 'songbook-bebd5',
  storageBucket: 'songbook-bebd5.firebasestorage.app',
  messagingSenderId: '179160244928',
  appId: '1:179160244928:web:8a1d8769fedab44bb10325',
} as const;
