import type { CollaborationInvite } from '../types';

/**
 * Self-host client for the receiving side of personal (per-resource) collaboration invites —
 * loading, accepting, and declining a pending song/songlist/setlist share, independent of band
 * membership. Talks to `/api/collaboration-invites` on the Express/Postgres server (see
 * server/routes/collaborationInvites.ts) instead of Firestore directly. Only call site is
 * ProfileInvitesPage.tsx. Note: there is currently no UI to *create* one of these invites — see
 * server/routes/collaborationInvites.ts's POST handler, which has no corresponding call site.
 */
const API_BASE = '/api';

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

export async function loadPendingInvites(
  userId: string,
  email: string,
): Promise<CollaborationInvite[]> {
  void userId;
  void email;
  const data = await apiFetch<{ invites: CollaborationInvite[] }>('/collaboration-invites/pending');
  return data.invites ?? [];
}

export async function acceptInvite(invite: CollaborationInvite, userId: string): Promise<void> {
  void userId;
  await apiFetch(`/collaboration-invites/${invite.id}/accept`, { method: 'POST' });
}

export async function declineInvite(inviteId: string, userId: string): Promise<void> {
  void userId;
  await apiFetch(`/collaboration-invites/${inviteId}/decline`, { method: 'POST' });
}
