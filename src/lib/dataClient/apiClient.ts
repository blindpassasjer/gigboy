import type { Band, InputList, PressKit, Setlist, Song, SongList } from '../../types';
import type { User } from '../../context/AuthContext';
import type { SongAttachment } from '../songAttachments';
import type { TrashListItem } from '../../components/TrashView';
import type {
  AcceptInviteInput,
  AdminInvitesClient,
  AdminUserListing,
  AdminUsersClient,
  AuthClient,
  BandAttachmentsClient,
  BandInvite,
  BandScopedCrudClient,
  BandsClient,
  BandTrashClient,
  DataClient,
  InviteContext,
  PressKitImage,
  PressKitImagesClient,
  PressKitShare,
  PressKitSharesClient,
  PublicPressKit,
  PublicPressKitsClient,
  PublicRider,
  PublicRidersClient,
  UserInvite,
} from './types';

/**
 * Self-host `DataClient` implementation: talks to the Express/Postgres server under
 * `server/` via the REST contract at `/api/*`. Auth is a session cookie (name `session`),
 * not a bearer token, so every request goes out with `credentials: 'include'`.
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

function createBandScopedCrudClient<T extends { id: string }>(
  resource: string,
  singularKey: string,
  pluralKey: string
): BandScopedCrudClient<T> {
  return {
    async list(bandId) {
      const data = await apiFetch<Record<string, T[]>>(`/bands/${bandId}/${resource}`);
      return data[pluralKey] ?? [];
    },
    async create(bandId, item) {
      const data = await apiFetch<Record<string, T>>(`/bands/${bandId}/${resource}`, {
        method: 'POST',
        body: JSON.stringify(item),
      });
      return data[singularKey];
    },
    async update(bandId, item) {
      const data = await apiFetch<Record<string, T>>(`/bands/${bandId}/${resource}/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify(item),
      });
      return data[singularKey];
    },
    async remove(bandId, id) {
      await apiFetch<Record<string, never>>(`/bands/${bandId}/${resource}/${id}`, { method: 'DELETE' });
    },
  };
}

const bandsClient: BandsClient = {
  async list() {
    const data = await apiFetch<{ bands: Band[] }>('/bands');
    return data.bands ?? [];
  },
  async create(input) {
    const data = await apiFetch<{ band: Band }>('/bands', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return data.band;
  },
  async update(id, input) {
    const data = await apiFetch<{ band: Band }>(`/bands/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return data.band;
  },
  async remove(id) {
    await apiFetch<Record<string, never>>(`/bands/${id}`, { method: 'DELETE' });
  },
  async createInviteLink(bandId) {
    return apiFetch<BandInvite>(`/bands/${bandId}/invite-link`, { method: 'POST' });
  },
  async acceptInvite(inviteId) {
    const data = await apiFetch<{ band: Band }>(`/bands/invites/${inviteId}/accept`, { method: 'POST' });
    return data.band;
  },
  async removeMember(bandId, userId) {
    await apiFetch<Record<string, never>>(`/bands/${bandId}/members/${userId}`, { method: 'DELETE' });
  },
};

const publicRidersClient: PublicRidersClient = {
  async get(bandId, riderId) {
    const response = await fetch(`${API_BASE}/public/bands/${bandId}/riders/${riderId}`);
    if (response.status === 404) return null;

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

    return response.json() as Promise<PublicRider>;
  },
};

const publicPressKitsClient: PublicPressKitsClient = {
  async get(token) {
    const response = await fetch(`${API_BASE}/public/press-kits/${token}`);
    if (response.status === 404) return null;

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

    return response.json() as Promise<PublicPressKit>;
  },
};

const bandPressKitSharesClient: PressKitSharesClient = {
  async get(bandId, kitId) {
    const data = await apiFetch<{ share: PressKitShare | null }>(`/bands/${bandId}/press-kits/${kitId}/share`);
    return data.share ?? null;
  },
  async create(bandId, kitId) {
    const data = await apiFetch<{ share: PressKitShare }>(`/bands/${bandId}/press-kits/${kitId}/share`, {
      method: 'POST',
    });
    return data.share;
  },
  async disable(bandId, kitId) {
    await apiFetch<Record<string, never>>(`/bands/${bandId}/press-kits/${kitId}/share/disable`, { method: 'POST' });
  },
};

/**
 * Like `apiFetch`, but for `multipart/form-data` uploads: takes a `FormData` body and
 * deliberately omits a `Content-Type` header so the browser sets the multipart boundary.
 */
async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
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

function createBandAttachmentsClient(base: (bandId: string, songId: string) => string): BandAttachmentsClient {
  return {
    async list(bandId, songId) {
      const data = await apiFetch<{ attachments: SongAttachment[] }>(base(bandId, songId));
      return data.attachments ?? [];
    },
    async upload(bandId, songId, file) {
      const formData = new FormData();
      formData.append('file', file);
      const data = await apiUpload<{ attachment: SongAttachment }>(base(bandId, songId), formData);
      return data.attachment;
    },
    async rename(bandId, songId, attachmentId, name) {
      await apiFetch<{ attachment: SongAttachment }>(`${base(bandId, songId)}/${attachmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
    },
    async remove(bandId, songId, attachmentId) {
      await apiFetch<Record<string, never>>(`${base(bandId, songId)}/${attachmentId}`, { method: 'DELETE' });
    },
  };
}

const bandAttachmentsClient = createBandAttachmentsClient(
  (bandId, songId) => `/bands/${bandId}/songs/${songId}/attachments`
);

const bandPressKitImagesClient: PressKitImagesClient = {
  async list(bandId) {
    const data = await apiFetch<{ images: PressKitImage[] }>(`/bands/${bandId}/press-kit-images`);
    return data.images ?? [];
  },
  async upload(bandId, file, thumbnail) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('thumb', thumbnail, 'thumbnail.webp');
    const data = await apiUpload<{ image: PressKitImage }>(`/bands/${bandId}/press-kit-images`, formData);
    return data.image;
  },
  async remove(bandId, imageId) {
    await apiFetch<Record<string, never>>(`/bands/${bandId}/press-kit-images/${imageId}`, { method: 'DELETE' });
  },
};

/** Turns a thrown `apiFetch` error into the `Promise<string | null>` shape `TrashView.tsx` expects. */
async function runTrashMutation(action: () => Promise<unknown>, fallbackMessage: string): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : fallbackMessage;
  }
}

const bandTrashClient: BandTrashClient = {
  async list(bandId) {
    const data = await apiFetch<{ items: TrashListItem[] }>(`/bands/${bandId}/trash`);
    return data.items ?? [];
  },
  restore(bandId, trashId) {
    return runTrashMutation(
      () => apiFetch(`/bands/${bandId}/trash/${trashId}/restore`, { method: 'POST' }),
      'Failed to restore item.'
    );
  },
  remove(bandId, trashId) {
    return runTrashMutation(
      () => apiFetch(`/bands/${bandId}/trash/${trashId}`, { method: 'DELETE' }),
      'Failed to permanently delete item.'
    );
  },
  empty(bandId) {
    return runTrashMutation(
      () => apiFetch(`/bands/${bandId}/trash`, { method: 'DELETE' }),
      'Failed to empty trash.'
    );
  },
};

const authClient: AuthClient = {
  async getCurrentUser() {
    try {
      const data = await apiFetch<{ user: User | null }>('/auth/me');
      return data.user;
    } catch {
      return null;
    }
  },
  onAuthStateChanged(callback) {
    let cancelled = false;
    void authClient.getCurrentUser().then((user) => {
      if (!cancelled) callback(user);
    });
    return () => {
      cancelled = true;
    };
  },
  async login(email, password) {
    try {
      return await apiFetch<{ user: User | null; error: string | null }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      return { user: null, error: err instanceof Error ? err.message : 'Login failed' };
    }
  },
  async getInvite(token) {
    try {
      const invite = await apiFetch<InviteContext>(`/invites/${token}`);
      return { invite, error: null };
    } catch (err) {
      return { invite: null, error: err instanceof Error ? err.message : 'Failed to look up invite.' };
    }
  },
  async acceptInvite(token, input: AcceptInviteInput) {
    try {
      return await apiFetch<{ user: User | null; error: string | null }>(`/invites/${token}/accept`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    } catch (err) {
      return { user: null, error: err instanceof Error ? err.message : 'Failed to accept invite.' };
    }
  },
  async logout() {
    await apiFetch<Record<string, never>>('/auth/logout', { method: 'POST' });
  },
  async updateEmail(email) {
    try {
      return await apiFetch<{ user: User | null; error: string | null }>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ email }),
      });
    } catch (err) {
      return { user: null, error: err instanceof Error ? err.message : 'Failed to update email.' };
    }
  },
  async updateUsername(username) {
    try {
      return await apiFetch<{ user: User | null; error: string | null }>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ username }),
      });
    } catch (err) {
      return { user: null, error: err instanceof Error ? err.message : 'Failed to update username.' };
    }
  },
  async updateFullName(fullName) {
    try {
      return await apiFetch<{ user: User | null; error: string | null }>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ fullName }),
      });
    } catch (err) {
      return { user: null, error: err instanceof Error ? err.message : 'Failed to update full name.' };
    }
  },
  async updatePassword(currentPassword, newPassword) {
    try {
      return await apiFetch<{ error: string | null }>('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update password.' };
    }
  },
  async deleteAccount() {
    try {
      return await apiFetch<{ error: string | null }>('/auth/me', { method: 'DELETE' });
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to delete account.' };
    }
  },
};

const adminInvitesClient: AdminInvitesClient = {
  async list() {
    const data = await apiFetch<{ invites: UserInvite[] }>('/admin/invites');
    return data.invites;
  },
  async create(input) {
    return apiFetch<{ inviteId: string; inviteUrl: string; expiresAt: string }>('/admin/invites', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async revoke(id) {
    await apiFetch<Record<string, never>>(`/admin/invites/${id}`, { method: 'DELETE' });
  },
};

const adminUsersClient: AdminUsersClient = {
  async list() {
    const data = await apiFetch<{ users: AdminUserListing[] }>('/admin/users');
    return data.users;
  },
  async setQuota(id, storageQuotaBytes) {
    await apiFetch<{ id: string; storageQuotaBytes: number; hasCustomQuota: boolean }>(`/admin/users/${id}/quota`, {
      method: 'PATCH',
      body: JSON.stringify({ storageQuotaBytes }),
    });
  },
  async setRole(id, role) {
    await apiFetch<{ id: string; role: 'member' | 'admin' }>(`/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },
  async remove(id) {
    await apiFetch<Record<string, never>>(`/admin/users/${id}`, { method: 'DELETE' });
  },
};

export const apiClient: DataClient = {
  auth: authClient,
  bands: bandsClient,
  bandSongs: createBandScopedCrudClient<Song>('songs', 'song', 'songs'),
  bandSongLists: createBandScopedCrudClient<SongList>('song-lists', 'songList', 'songLists'),
  bandSetlists: createBandScopedCrudClient<Setlist>('setlists', 'setlist', 'setlists'),
  bandRiders: createBandScopedCrudClient<InputList>('riders', 'rider', 'riders'),
  publicRiders: publicRidersClient,
  bandAttachments: bandAttachmentsClient,
  bandTrash: bandTrashClient,
  bandPressKits: createBandScopedCrudClient<PressKit>('press-kits', 'pressKit', 'pressKits'),
  bandPressKitImages: bandPressKitImagesClient,
  bandPressKitShares: bandPressKitSharesClient,
  publicPressKits: publicPressKitsClient,
  adminInvites: adminInvitesClient,
  adminUsers: adminUsersClient,
};
