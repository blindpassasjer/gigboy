import type { users } from '../db/schema.js';
import { resolveStorageQuotaBytes } from './storageQuota.js';

type UserRow = typeof users.$inferSelect;

export interface PublicUser {
  id: string;
  email: string;
  username: string | null;
  avatar: string | null;
  fullName: string | null;
  role: 'member' | 'admin';
  storageQuotaBytes: number;
}

/** Self-host builds have no billing/plan concept — every user gets full feature access, aside
 * from the admin-assignable storage quota (see server/lib/storageQuota.ts). */
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    avatar: row.avatar,
    fullName: row.fullName,
    role: row.role === 'admin' ? 'admin' : 'member',
    storageQuotaBytes: resolveStorageQuotaBytes(row.storageQuotaBytes),
  };
}
