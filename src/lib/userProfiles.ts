import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

export interface UserProfile {
  username: string;
  usernameLower: string;
  email?: string;
}

const USERS_COLLECTION = 'users';
const USERNAMES_COLLECTION = 'usernames';
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

function profileFromData(data: Record<string, unknown> | undefined | null): UserProfile | null {
  if (!data) return null;

  const username = typeof data.username === 'string' ? data.username : null;
  const usernameLower = typeof data.usernameLower === 'string'
    ? data.usernameLower
    : (username ? normalizeUsername(username) : null);

  if (!username || !usernameLower) {
    return null;
  }

  return {
    username,
    usernameLower,
    email: typeof data.email === 'string' ? data.email : undefined,
  };
}

export async function loadUserProfile(db: Firestore, userId: string) {
  const snapshot = await getDoc(doc(db, USERS_COLLECTION, userId));
  return profileFromData(snapshot.data() as Record<string, unknown> | undefined);
}

export async function claimUsername(db: Firestore, params: {
  userId: string;
  email?: string;
  username: string;
}) {
  const normalized = normalizeUsername(params.username);
  const validationError = validateUsername(normalized);
  if (validationError) {
    throw new Error(validationError);
  }

  const userRef = doc(db, USERS_COLLECTION, params.userId);
  const usernameRef = doc(db, USERNAMES_COLLECTION, normalized);

  await runTransaction(db, async (transaction) => {
    const [userSnapshot, usernameSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(usernameRef),
    ]);

    const existingProfile = profileFromData(userSnapshot.data() as Record<string, unknown> | undefined);
    if (existingProfile?.usernameLower && existingProfile.usernameLower !== normalized) {
      throw new Error('Username changes are not supported yet.');
    }

    if (usernameSnapshot.exists()) {
      const claimedBy = usernameSnapshot.data().userId;
      if (claimedBy !== params.userId) {
        throw new Error('That username is already taken.');
      }
    } else {
      transaction.set(usernameRef, {
        userId: params.userId,
        username: normalized,
        usernameLower: normalized,
        createdAt: serverTimestamp(),
      });
    }

    transaction.set(userRef, {
      ...(params.email ? { email: params.email } : {}),
      username: normalized,
      usernameLower: normalized,
      updatedAt: serverTimestamp(),
      ...(existingProfile ? {} : { createdAt: serverTimestamp() }),
    }, { merge: true });
  });

  return normalized;
}