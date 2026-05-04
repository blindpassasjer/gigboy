import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { BandInvite, CollaborationInvite } from '../types';
import { loadPendingBandInvites } from './bandInvites';
import { loadPendingInvites } from './collaboration';

const COLLABORATION_INVITES_COLLECTION = 'collaborationInvites';
const BAND_INVITES_COLLECTION = 'bandInvites';

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
    description: `${invite.recipientEmail} accepted your band invite as ${invite.role}.`,
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

function getSeenAcceptedInviteKey(userId: string) {
  return `folio-seen-accepted-invites:${userId}`;
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

export function emitInviteNotificationsChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event('folio-invite-notifications-changed'));
}