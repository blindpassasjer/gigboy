import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { BandInvite, CollaborationInvite } from '../types';
import { loadPendingBandInvites } from './bandInvites';
import { loadPendingInvites } from './collaboration';

const COLLABORATION_INVITES_COLLECTION = 'collaborationInvites';
const BAND_INVITES_COLLECTION = 'bandInvites';
const PREFERENCES_COLLECTION = 'preferences';
const INVITE_NOTIFICATIONS_PREF_DOC = 'inviteNotifications';

export interface AcceptedInviteNotification {
  id: string;
  inviteId: string;
  kind: 'collaboration' | 'band';
  title: string;
  description: string;
  recipientEmail: string;
  recipientUid?: string;
  respondedAt: string;
}

export interface InviteNotificationsSnapshot {
  pendingIncomingCount: number;
  acceptedOutgoing: AcceptedInviteNotification[];
}

function collaborationInviteFromDoc(id: string, data: Record<string, unknown>): CollaborationInvite {
  return { id, ...(data as Omit<CollaborationInvite, 'id'>) };
}

function bandInviteFromDoc(id: string, data: Record<string, unknown>): BandInvite {
  return { id, ...(data as Omit<BandInvite, 'id'>) };
}

function collaborationInviteToNotification(invite: CollaborationInvite): AcceptedInviteNotification | null {
  if (invite.status !== 'accepted' || !invite.respondedAt) {
    return null;
  }

  return {
    id: `collaboration:${invite.id}`,
    inviteId: invite.id,
    kind: 'collaboration',
    title: invite.resourceName,
    description: `${invite.recipientEmail} accepted your ${invite.resourceType} invite with ${invite.permission} access.`,
    recipientEmail: invite.recipientEmail,
    recipientUid: invite.recipientUid,
    respondedAt: invite.respondedAt,
  };
}

function bandInviteToNotification(invite: BandInvite): AcceptedInviteNotification | null {
  if (invite.status !== 'accepted' || !invite.respondedAt) {
    return null;
  }

  return {
    id: `band:${invite.id}`,
    inviteId: invite.id,
    kind: 'band',
    title: invite.bandName,
    description: `${invite.recipientEmail} accepted your band invite as ${invite.role === 'editor' ? 'member' : invite.role}.`,
    recipientEmail: invite.recipientEmail,
    recipientUid: invite.recipientUid,
    respondedAt: invite.respondedAt,
  };
}

async function loadAcceptedCollaborationInvites(db: Firestore, userId: string) {
  const snapshot = await getDocs(
    query(
      collection(db, COLLABORATION_INVITES_COLLECTION),
      where('ownerId', '==', userId)
    )
  );

  return snapshot.docs
    .map((entry) => collaborationInviteFromDoc(entry.id, entry.data() as Record<string, unknown>))
    .map(collaborationInviteToNotification)
    .flatMap((notification) => (notification ? [notification] : []));
}

async function loadAcceptedBandInvites(db: Firestore, userId: string) {
  const snapshot = await getDocs(
    query(
      collection(db, BAND_INVITES_COLLECTION),
      where('inviterId', '==', userId)
    )
  );

  return snapshot.docs
    .map((entry) => bandInviteFromDoc(entry.id, entry.data() as Record<string, unknown>))
    .map(bandInviteToNotification)
    .flatMap((notification) => (notification ? [notification] : []));
}

export async function loadInviteNotificationsSnapshot(db: Firestore, userId: string, email: string) {
  const [pendingInvites, pendingBandInvites, acceptedCollaborationInvites, acceptedBandInvites] = await Promise.all([
    loadPendingInvites(db, userId, email),
    loadPendingBandInvites(db, userId, email),
    loadAcceptedCollaborationInvites(db, userId),
    loadAcceptedBandInvites(db, userId),
  ]);

  return {
    pendingIncomingCount: pendingInvites.length + pendingBandInvites.length,
    acceptedOutgoing: [...acceptedCollaborationInvites, ...acceptedBandInvites]
      .sort((a, b) => b.respondedAt.localeCompare(a.respondedAt)),
  } satisfies InviteNotificationsSnapshot;
}

// --- Seen IDs (localStorage only — just drives the badge count) ---

function getSeenAcceptedInviteKey(userId: string) {
  return `gigboy-seen-accepted-invites:${userId}`;
}

export function getSeenAcceptedInviteIds(userId: string) {
  if (typeof window === 'undefined') {
    return new Set<string>();
  }

  try {
    const raw = window.localStorage.getItem(getSeenAcceptedInviteKey(userId));
    if (!raw) {
      return new Set<string>();
    }
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) {
      return new Set<string>();
    }
    return new Set(ids.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set<string>();
  }
}

export function markAcceptedInviteIdsSeen(userId: string, ids: string[]) {
  if (typeof window === 'undefined' || ids.length === 0) {
    return;
  }

  const seenIds = getSeenAcceptedInviteIds(userId);
  ids.forEach((id) => seenIds.add(id));

  try {
    window.localStorage.setItem(getSeenAcceptedInviteKey(userId), JSON.stringify([...seenIds]));
  } catch {
    // Ignore storage failures and keep notifications ephemeral.
  }
}

// --- Dismissed IDs (Firestore as source of truth, localStorage as cache) ---

function getDismissedAcceptedInviteKey(userId: string) {
  return `gigboy-dismissed-accepted-invites:${userId}`;
}

function getDismissedAcceptedInviteIdsFromCache(userId: string): Set<string> {
  if (typeof window === 'undefined') {
    return new Set<string>();
  }

  try {
    const raw = window.localStorage.getItem(getDismissedAcceptedInviteKey(userId));
    if (!raw) {
      return new Set<string>();
    }
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) {
      return new Set<string>();
    }
    return new Set(ids.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set<string>();
  }
}

function saveDismissedAcceptedInviteIdsToCache(userId: string, ids: Set<string>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(getDismissedAcceptedInviteKey(userId), JSON.stringify([...ids]));
  } catch {
    // Ignore storage failures.
  }
}

function inviteNotificationsPrefDocRef(db: Firestore, userId: string) {
  return doc(db, 'users', userId, PREFERENCES_COLLECTION, INVITE_NOTIFICATIONS_PREF_DOC);
}

export async function loadDismissedAcceptedInviteIds(db: Firestore, userId: string): Promise<Set<string>> {
  try {
    const snap = await getDoc(inviteNotificationsPrefDocRef(db, userId));
    const data = snap.data() as Record<string, unknown> | undefined;
    const ids = Array.isArray(data?.dismissedAcceptedInviteIds)
      ? (data.dismissedAcceptedInviteIds as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    const result = new Set(ids);
    // Keep localStorage in sync so next load is fast even before Firestore responds.
    saveDismissedAcceptedInviteIdsToCache(userId, result);
    return result;
  } catch {
    // Fall back to local cache on network errors.
    return getDismissedAcceptedInviteIdsFromCache(userId);
  }
}

export async function saveDismissedAcceptedInviteIds(db: Firestore, userId: string, ids: Set<string>): Promise<void> {
  saveDismissedAcceptedInviteIdsToCache(userId, ids);
  await setDoc(
    inviteNotificationsPrefDocRef(db, userId),
    { dismissedAcceptedInviteIds: [...ids] },
    { merge: true }
  );
}

// Exported for optimistic local reads before the first Firestore response.
export function getDismissedAcceptedInviteIds(userId: string): Set<string> {
  return getDismissedAcceptedInviteIdsFromCache(userId);
}

export function emitInviteNotificationsChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event('gigboy-invite-notifications-changed'));
}
