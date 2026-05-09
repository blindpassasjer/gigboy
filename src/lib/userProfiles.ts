import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

import { DEFAULT_AVATAR, isValidAvatar } from './avatars';
import { PLAN_LIMITS } from './planLimits';
import type { PlanTier, SubscriptionStatus } from '../types';

export interface UserProfile {
  username: string;
  usernameLower: string;
  email?: string;
  avatar?: string;
  fullName?: string;
  plan: PlanTier;
  planOverride?: boolean;
  subscriptionStatus?: SubscriptionStatus;
  currentPeriodEnd?: number | null;
  storageQuotaBytes?: number;
  bandExtraMembers?: number;
  memberLimit?: number;
  stripeCustomerId?: string;
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

  const rawPlan = data.plan;
  const plan: PlanTier = rawPlan === 'pro' || rawPlan === 'crew' ? rawPlan : 'free';
  const rawStatus = data.subscriptionStatus;
  const subscriptionStatus: SubscriptionStatus =
    rawStatus === 'active'
    || rawStatus === 'trialing'
    || rawStatus === 'past_due'
    || rawStatus === 'canceled'
    || rawStatus === 'unpaid'
    || rawStatus === 'incomplete'
      ? rawStatus
      : null;
  const currentPeriodEnd = typeof data.currentPeriodEnd === 'number' && Number.isFinite(data.currentPeriodEnd)
    ? data.currentPeriodEnd
    : null;
  const storageQuotaBytes = typeof data.storageQuotaBytes === 'number' && Number.isFinite(data.storageQuotaBytes)
    ? data.storageQuotaBytes
    : undefined;
  const bandExtraMembers = typeof data.bandExtraMembers === 'number' && Number.isFinite(data.bandExtraMembers)
    ? Math.max(0, Math.trunc(data.bandExtraMembers))
    : undefined;
  const memberLimit = typeof data.memberLimit === 'number' && Number.isFinite(data.memberLimit)
    ? Math.max(1, Math.trunc(data.memberLimit))
    : undefined;

  return {
    username,
    usernameLower,
    email: typeof data.email === 'string' ? data.email : undefined,
    avatar: typeof data.avatar === 'string' ? data.avatar : undefined,
    fullName: typeof data.fullName === 'string' ? data.fullName : undefined,
    plan,
    planOverride: data.planOverride === true,
    subscriptionStatus,
    currentPeriodEnd,
    storageQuotaBytes,
    bandExtraMembers,
    memberLimit,
    stripeCustomerId: typeof data.stripeCustomerId === 'string' ? data.stripeCustomerId : undefined,
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
      avatar: DEFAULT_AVATAR,
      plan: 'free',
      planOverride: false,
      subscriptionStatus: null,
      storageQuotaBytes: PLAN_LIMITS.free.storageQuotaBytes,
      memberLimit: PLAN_LIMITS.free.memberLimit,
      updatedAt: serverTimestamp(),
      ...(existingProfile ? {} : { createdAt: serverTimestamp() }),
    }, { merge: true });
  });

  return normalized;
}

export async function updateProfileFields(db: Firestore, params: {
  userId: string;
  email?: string;
  avatar?: string;
  fullName?: string | null;
}) {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (typeof params.email === 'string') {
    payload.email = params.email;
  }

  if (typeof params.avatar === 'string') {
    if (!isValidAvatar(params.avatar)) {
      throw new Error('Invalid avatar selection.');
    }
    payload.avatar = params.avatar;
  }

  if (params.fullName !== undefined) {
    const trimmed = typeof params.fullName === 'string' ? params.fullName.trim() : '';
    if (trimmed.length > 80) {
      throw new Error('Full name must be 80 characters or fewer.');
    }
    payload.fullName = trimmed;
  }

  await setDoc(doc(db, USERS_COLLECTION, params.userId), payload, { merge: true });
}

export async function changeUsername(db: Firestore, params: {
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
  const nextUsernameRef = doc(db, USERNAMES_COLLECTION, normalized);

  await runTransaction(db, async (transaction) => {
    const [userSnapshot, nextUsernameSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(nextUsernameRef),
    ]);

    const existingProfile = profileFromData(userSnapshot.data() as Record<string, unknown> | undefined);
    const currentUsernameLower = existingProfile?.usernameLower ?? null;

    if (nextUsernameSnapshot.exists()) {
      const claimedBy = nextUsernameSnapshot.data().userId;
      if (claimedBy !== params.userId) {
        throw new Error('That username is already taken.');
      }
    }

    if (currentUsernameLower && currentUsernameLower !== normalized) {
      const currentUsernameRef = doc(db, USERNAMES_COLLECTION, currentUsernameLower);
      const currentUsernameSnapshot = await transaction.get(currentUsernameRef);
      if (currentUsernameSnapshot.exists() && currentUsernameSnapshot.data().userId === params.userId) {
        transaction.delete(currentUsernameRef);
      }
    }

    transaction.set(nextUsernameRef, {
      userId: params.userId,
      username: normalized,
      usernameLower: normalized,
      updatedAt: serverTimestamp(),
      ...(nextUsernameSnapshot.exists() ? {} : { createdAt: serverTimestamp() }),
    }, { merge: true });

    transaction.set(userRef, {
      ...(params.email ? { email: params.email } : {}),
      username: normalized,
      usernameLower: normalized,
      updatedAt: serverTimestamp(),
      ...(existingProfile ? {} : { createdAt: serverTimestamp() }),
      ...(existingProfile?.avatar ? {} : { avatar: DEFAULT_AVATAR }),
    }, { merge: true });
  });

  return normalized;
}