import type { CollaborationPermission, ShareResourceType } from '../types';
import { auth } from './firebase';

interface ApiHeaders {
  userId: string;
  userEmail: string;
}

async function buildHeaders(_headers: ApiHeaders) {
  const token = await auth?.currentUser?.getIdToken();
  const normalizedEmail = _headers.userEmail.trim().toLowerCase();
  return {
    'Content-Type': 'application/json',
    ...(normalizedEmail ? { 'x-folio-user-email': normalizedEmail } : {}),
    ...(_headers.userId ? { 'x-folio-user-id': _headers.userId } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function postJson<T>(path: string, body: Record<string, unknown>, headers: ApiHeaders): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: await buildHeaders(headers),
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    const errorMessage = typeof payload.error === 'string' ? payload.error : 'Request failed.';
    throw new Error(errorMessage);
  }

  return payload as T;
}

export async function createInviteOnServer(params: {
  userId: string;
  userEmail: string;
  recipientQuery: string;
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  permission: CollaborationPermission;
}) {
  return postJson<{ inviteId: string }>('/api/share/invite', params, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}

export async function acceptInviteOnServer(params: {
  userId: string;
  userEmail: string;
  inviteId: string;
}) {
  await postJson('/api/share/accept', { inviteId: params.inviteId }, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}

export async function revokeInviteOnServer(params: {
  userId: string;
  userEmail: string;
  inviteId: string;
}) {
  await postJson('/api/share/revoke', { inviteId: params.inviteId }, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}

export interface ShareRecipientMatch {
  userId: string;
  username: string;
  fullName?: string;
  email?: string;
  avatar?: string;
}

export async function searchShareRecipientsOnServer(params: {
  userId: string;
  userEmail: string;
  query: string;
}) {
  return postJson<{ recipients: ShareRecipientMatch[] }>('/api/share/search-recipients', {
    query: params.query,
  }, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}
