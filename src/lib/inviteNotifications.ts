import type { CollaborationInvite } from '../types';
import { loadPendingInvites } from './collaboration';

const API_BASE = '/api';

export interface AcceptedInviteNotification {
  id: string;
  inviteId: string;
  kind: 'collaboration';
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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Response wasn't JSON; fall back to the generic message.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
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

/** Invites the current user sent (as owner) that the recipient has accepted, via `GET /api/collaboration-invites/sent`. */
async function loadAcceptedCollaborationInvites(): Promise<AcceptedInviteNotification[]> {
  const data = await apiFetch<{ invites: CollaborationInvite[] }>('/collaboration-invites/sent');
  return (data.invites ?? [])
    .map(collaborationInviteToNotification)
    .flatMap((notification) => (notification ? [notification] : []));
}

export async function loadInviteNotificationsSnapshot(userId: string, email: string): Promise<InviteNotificationsSnapshot> {
  const [pendingInvites, acceptedCollaborationInvites] = await Promise.all([
    loadPendingInvites(userId, email),
    loadAcceptedCollaborationInvites(),
  ]);

  return {
    pendingIncomingCount: pendingInvites.length,
    acceptedOutgoing: acceptedCollaborationInvites
      .sort((a, b) => b.respondedAt.localeCompare(a.respondedAt)),
  };
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

// --- Dismissed IDs (localStorage only — self-host has no per-user preferences doc to sync
// across devices for this; the badge simply re-appears on a fresh device, which is fine for
// a "you have new activity" indicator). ---

function getDismissedAcceptedInviteKey(userId: string) {
  return `gigboy-dismissed-accepted-invites:${userId}`;
}

export function getDismissedAcceptedInviteIds(userId: string): Set<string> {
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

export function saveDismissedAcceptedInviteIds(userId: string, ids: Set<string>): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(getDismissedAcceptedInviteKey(userId), JSON.stringify([...ids]));
  } catch {
    // Ignore storage failures.
  }
}

export function emitInviteNotificationsChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event('gigboy-invite-notifications-changed'));
}
