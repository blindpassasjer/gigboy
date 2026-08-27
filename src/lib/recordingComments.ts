import { isDemoMode } from './demo/demoMode';
import * as demoStore from './demo/demoStore';

export interface RecordingComment {
  id: string;
  recordingId: string;
  authorUserId: string | null;
  authorDisplayName: string | null;
  authorAvatar: string | null;
  /** Milliseconds into the take, or null for a general note. */
  atMs: number | null;
  body: string;
  createdAt: string;
  updatedAt: string;
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

function base(bandId: string, songId: string, recordingId: string): string {
  return `/bands/${bandId}/songs/${songId}/recordings/${recordingId}/comments`;
}

export async function loadRecordingComments(
  bandId: string,
  songId: string,
  recordingId: string,
): Promise<RecordingComment[]> {
  if (isDemoMode) return demoStore.listRecordingComments(recordingId);
  const data = await apiFetch<{ comments: RecordingComment[] }>(base(bandId, songId, recordingId));
  return data.comments ?? [];
}

export async function addRecordingComment(
  bandId: string,
  songId: string,
  recordingId: string,
  input: { body: string; atMs: number | null },
): Promise<RecordingComment> {
  if (isDemoMode) return demoStore.addRecordingComment(recordingId, input);
  const data = await apiFetch<{ comment: RecordingComment }>(base(bandId, songId, recordingId), {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.comment;
}

export async function deleteRecordingComment(
  bandId: string,
  songId: string,
  recordingId: string,
  commentId: string,
): Promise<void> {
  if (isDemoMode) {
    demoStore.deleteRecordingComment(recordingId, commentId);
    return;
  }
  await apiFetch<Record<string, never>>(`${base(bandId, songId, recordingId)}/${commentId}`, {
    method: 'DELETE',
  });
}
