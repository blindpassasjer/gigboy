import type { CollaborationPermission, ShareResourceType } from '../types';
import { type ApiHeaders, buildHeaders } from './apiClient';

async function postJson<T>(path: string, body: Record<string, unknown>, headers: ApiHeaders): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: await buildHeaders(headers),
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch((err) => {
    console.error(`Failed to parse JSON response from ${path}:`, err);
    return ({} as Record<string, unknown>);
  });
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
