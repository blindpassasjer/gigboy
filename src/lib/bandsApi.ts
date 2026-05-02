import type { CollaborationPermission } from '../types';
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
    if (response.status === 405) {
      throw new Error('API endpoint is not available in this deployment (405). Deploy with Cloudflare Pages Functions.');
    }

    const errorMessage = typeof payload.error === 'string' ? payload.error : 'Request failed.';
    throw new Error(errorMessage);
  }

  return payload as T;
}

export async function createBandOnServer(params: {
  userId: string;
  userEmail: string;
  name: string;
  description?: string;
  icon?: string;
}) {
  return postJson<{ bandId: string }>('/api/bands/create', params, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}

export async function inviteBandMemberOnServer(params: {
  userId: string;
  userEmail: string;
  bandId: string;
  recipientUsername: string;
  role: CollaborationPermission;
}) {
  return postJson<{ inviteId: string }>('/api/bands/invite', params, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}

export async function createBandInviteLinkOnServer(params: {
  userId: string;
  userEmail: string;
  bandId: string;
  role: CollaborationPermission;
}) {
  return postJson<{ inviteId: string; inviteUrl: string; expiresAt: string }>('/api/bands/invite-link', params, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}

export async function acceptBandInviteOnServer(params: {
  userId: string;
  userEmail: string;
  inviteId: string;
}) {
  await postJson('/api/bands/accept', { inviteId: params.inviteId }, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}

export async function removeBandMemberOnServer(params: {
  userId: string;
  userEmail: string;
  bandId: string;
  memberId: string;
}) {
  await postJson('/api/bands/remove-member', { bandId: params.bandId, memberId: params.memberId }, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}

export async function changeBandMemberRoleOnServer(params: {
  userId: string;
  userEmail: string;
  bandId: string;
  memberId: string;
  role: CollaborationPermission;
}) {
  await postJson('/api/bands/change-role', { bandId: params.bandId, memberId: params.memberId, role: params.role }, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}

export async function deleteBandOnServer(params: {
  userId: string;
  userEmail: string;
  bandId: string;
}) {
  await postJson('/api/bands/delete', { bandId: params.bandId }, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}