import type { Song } from '../types';
import { isDemoMode } from './demo/demoMode';
import * as demoStore from './demo/demoStore';

export interface SongRevision {
  id: string;
  createdAt: string;
  editorUserId: string | null;
  editorDisplayName: string | null;
  editorAvatar: string | null;
  snapshot: Record<string, unknown>;
  /** Field labels that changed relative to the previous revision. */
  changed: string[];
}

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

function base(bandId: string, songId: string): string {
  return `/bands/${bandId}/songs/${songId}/revisions`;
}

export async function loadSongRevisions(bandId: string, songId: string): Promise<SongRevision[]> {
  if (isDemoMode) return demoStore.listSongRevisions(bandId, songId);
  const data = await apiFetch<{ revisions: SongRevision[] }>(base(bandId, songId));
  return data.revisions ?? [];
}

export async function restoreSongRevision(
  bandId: string,
  songId: string,
  revisionId: string,
): Promise<Song> {
  if (isDemoMode) return demoStore.restoreSongRevision(bandId, songId, revisionId) as unknown as Song;
  const data = await apiFetch<{ song: Song }>(`${base(bandId, songId)}/${revisionId}/restore`, {
    method: 'POST',
  });
  return data.song;
}
