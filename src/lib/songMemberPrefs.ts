import { isDemoMode } from './demo/demoMode';
import * as demoStore from './demo/demoStore';

/**
 * Per-member transpose overrides, talking to
 * `/api/bands/:bandId/songs/:songId/transpose` and the batch
 * `/api/bands/:bandId/song-prefs` (see server/routes/songMemberPrefs.ts).
 *
 * A personal offset takes precedence over the song's shared `preferredTranspose`.
 */
const API_BASE = '/api';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function loadMyTranspose(bandId: string, songId: string): Promise<number | null> {
  if (isDemoMode) return demoStore.getSongTranspose(bandId, songId);
  const data = await apiFetch<{ pref: { transpose: number } | null }>(
    `/bands/${bandId}/songs/${songId}/transpose`,
  );
  return data.pref ? data.pref.transpose : null;
}

export async function saveMyTranspose(bandId: string, songId: string, transpose: number): Promise<number> {
  if (isDemoMode) return demoStore.setSongTranspose(bandId, songId, transpose);
  const data = await apiFetch<{ pref: { transpose: number } }>(
    `/bands/${bandId}/songs/${songId}/transpose`,
    { method: 'PUT', body: JSON.stringify({ transpose }) },
  );
  return data.pref.transpose;
}

export async function clearMyTranspose(bandId: string, songId: string): Promise<void> {
  if (isDemoMode) {
    demoStore.clearSongTranspose(bandId, songId);
    return;
  }
  await apiFetch<Record<string, never>>(`/bands/${bandId}/songs/${songId}/transpose`, { method: 'DELETE' });
}

/** All of the current user's personal transpose offsets for a band, keyed by song id. */
export async function loadBandTransposePrefs(bandId: string): Promise<Record<string, number>> {
  if (isDemoMode) return demoStore.listBandTransposePrefs(bandId);
  const data = await apiFetch<{ prefs: Record<string, number> }>(`/bands/${bandId}/song-prefs`);
  return data.prefs ?? {};
}
