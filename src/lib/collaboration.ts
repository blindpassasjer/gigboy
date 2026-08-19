import type {
  CollaborationInvite,
  CollaborationPermission,
  ShareResourceType,
} from '../types';

/**
 * Self-host implementation of personal (per-resource) collaboration invites — song/songlist/setlist
 * sharing by email, independent of band membership. Talks to `/api/collaboration-invites` on the
 * Express/Postgres server (see server/routes/collaborationInvites.ts) instead of Firestore directly.
 * Exported function names/signatures are kept as close as possible to the old Firestore version so
 * call sites (ProfileInvitesPage.tsx, SongsContext.tsx, SongListsContext.tsx, SetlistsContext.tsx)
 * only need to drop the `db`/`Firestore` argument they used to pass.
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

export function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function createInvite(params: {
  ownerId: string;
  ownerEmail: string;
  recipientEmail: string;
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  permission: CollaborationPermission;
}): Promise<CollaborationInvite> {
  const { resourceType, resourceId, resourceName, recipientEmail, permission } = params;
  const data = await apiFetch<{ invite: CollaborationInvite }>('/collaboration-invites', {
    method: 'POST',
    body: JSON.stringify({ resourceType, resourceId, resourceName, recipientEmail, permission }),
  });
  return data.invite;
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

/**
 * Self-host resources shared via an accepted collaboration invite are already returned by the
 * owning resource's own list endpoint — `GET /api/songs` (and song-lists/setlists) matches both
 * `userId = caller` and a jsonb-containment check against `collaboratorIds` server-side (see
 * server/routes/crud.ts's `collaboratorIdsColumn`). So unlike the old Firestore version, there is
 * nothing left to separately fetch and merge here — SongsContext.tsx/SongListsContext.tsx/
 * SetlistsContext.tsx's self-host branch calls `dataClient.songs.list()` (etc.) alone and already
 * gets shared resources back in the same response. This stays a no-op for API-shape compatibility.
 */
export async function loadAcceptedSharedResources<T>(params: {
  userId: string;
  resourceType: ShareResourceType;
  mapResource: (invite: CollaborationInvite, id: string, data: Record<string, unknown>) => T | null;
}): Promise<T[]> {
  void params;
  return [];
}
