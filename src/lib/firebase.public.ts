// No default Firebase project is baked into the app. Set VITE_FIREBASE_* env vars
// (see README.md) to enable Firebase auth/storage; otherwise the app runs in
// local-only mode. This avoids checked-in project credentials and prevents
// checkouts without env vars from silently connecting to someone else's Firebase project.
//
// Production (Cloudflare Pages) supplies these six as dashboard environment variables
// for the production environment — confirmed working 2026-08-18. If a deploy ever loses
// login/logout or the band workspace again, check those dashboard vars first before
// reintroducing a hardcoded fallback here.
export const PUBLIC_FIREBASE_CONFIG = null;
