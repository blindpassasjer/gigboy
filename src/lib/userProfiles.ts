// Self-host profile reads/writes (email, avatar, full name, username changes) go through
// dataClient.auth (server/routes/auth.ts), not through this file — see ProfilePage.tsx,
// AcceptInvitePage.tsx, UsernameSetupPage.tsx. This file now only holds the username
// validation helpers those call sites share, previously kept alongside the Firestore
// profile/username-claim logic that has since been removed.

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_.-]{1,22}[a-z0-9])?$/;

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string) {
  const normalized = normalizeUsername(username);
  if (!normalized) {
    return 'Username is required.';
  }

  if (!USERNAME_PATTERN.test(normalized)) {
    return 'Use 3-24 lowercase letters, numbers, dots, hyphens, or underscores.';
  }

  return null;
}
