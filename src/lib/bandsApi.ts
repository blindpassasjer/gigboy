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

export async function getBandOwnerQuotaOnServer(params: {
  userId: string;
  userEmail: string;
  bandId: string;
}) {
  return postJson<{ quotaBytes: number }>('/api/bands/owner-quota', { bandId: params.bandId }, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}

export async function createBandInviteLinkOnServer(params: {
  userId: string;
  userEmail: string;
  bandId: string;
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

export async function repairBandMembershipOnServer(params: {
  userId: string;
  userEmail: string;
  claimOwnership?: boolean;
}) {
  return postJson<{
    ok: true;
    scanned: number;
    repairedCount: number;
    repairedBandIds: string[];
    claimedCount: number;
    claimedBandIds: string[];
  }>(
    '/api/bands/repair-membership',
    { claimOwnership: params.claimOwnership === true },
    {
      userId: params.userId,
      userEmail: params.userEmail,
    }
  );
}

export async function deleteAccountOnServer(params: {
  userId: string;
  userEmail: string;
}) {
  return postJson<{
    ok: true;
    deletedBands: number;
    deletedBandDocs: number;
    deletedUserDocs: number;
    updatedMemberships: number;
    deletedBandInvites: number;
    deletedCollaborationInvites: number;
  }>(
    '/api/users/delete-account',
    {},
    {
      userId: params.userId,
      userEmail: params.userEmail,
    }
  );
}

export async function createBandRiderOnServer(params: {
  userId: string;
  userEmail: string;
  bandId: string;
  name: string;
}) {
  return postJson<{ ok: true; riderId: string }>(`/api/bands/create-rider`, { bandId: params.bandId, name: params.name }, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}

export async function createBandPressKitOnServer(params: {
  userId: string;
  userEmail: string;
  bandId: string;
  name: string;
}) {
  return postJson<{ ok: true; kitId: string }>(`/api/bands/create-press-kit`, { bandId: params.bandId, name: params.name }, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}