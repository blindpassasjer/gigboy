import type { users } from '../db/schema.js';

type UserRow = typeof users.$inferSelect;

export interface PublicUser {
  id: string;
  email: string;
  username: string | null;
  avatar: string | null;
  fullName: string | null;
  plan: 'crew';
  planOverride: true;
  subscriptionStatus: 'active';
  currentPeriodEnd: null;
  storageQuotaBytes: number;
  bandExtraMembers: 0;
  memberLimit: 1;
  stripeCustomerId: null;
}

/** Self-host builds have no billing/plan concept — every user gets full feature access. */
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    avatar: row.avatar,
    fullName: row.fullName,
    plan: 'crew',
    planOverride: true,
    subscriptionStatus: 'active',
    currentPeriodEnd: null,
    storageQuotaBytes: Number.MAX_SAFE_INTEGER,
    bandExtraMembers: 0,
    memberLimit: 1,
    stripeCustomerId: null,
  };
}
