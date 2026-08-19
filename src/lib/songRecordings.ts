export interface RecorderIdentity {
  userId: string;
  displayName: string;
  avatar: string | null;
}

export interface SongRecording {
  id: string;
  name: string;
  storagePath: string;
  downloadUrl: string;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  recorder?: RecorderIdentity;
  waveformBars?: number[];
}

export type RecordingsScope =
  | { type: 'user'; ownerId: string }
  | { type: 'band'; bandId: string };

/**
 * Song recordings, talking to `/api/songs/:songId/recordings` or
 * `/api/bands/:bandId/songs/:songId/recordings` (see server/routes/songRecordings.ts).
 */
const API_BASE = '/api';

function recordingsUrl(scope: RecordingsScope, songId: string): string {
  if (scope.type === 'band') {
    return `${API_BASE}/bands/${scope.bandId}/songs/${songId}/recordings`;
  }
  return `${API_BASE}/songs/${songId}/recordings`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: init?.body instanceof FormData
      ? { ...(init?.headers ?? {}) }
      : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
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

export async function loadSongRecordings(
  scope: RecordingsScope,
  songId: string,
): Promise<SongRecording[]> {
  const data = await apiFetch<{ recordings: SongRecording[] }>(recordingsUrl(scope, songId));
  return data.recordings ?? [];
}

export async function uploadSongRecording(
  scope: RecordingsScope,
  songId: string,
  blob: Blob,
  name: string,
  durationMs: number,
  recorder: RecorderIdentity,
  waveformBars?: number[],
): Promise<SongRecording> {
  void recorder; // recorder identity is derived server-side from the session (matches uploader pattern elsewhere)
  const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
  const formData = new FormData();
  formData.append('file', blob, `${name || 'recording'}.${ext}`);
  formData.append('name', name);
  formData.append('durationMs', String(durationMs));
  if (waveformBars && waveformBars.length > 0) {
    formData.append('waveformBars', JSON.stringify(waveformBars));
  }

  const data = await apiFetch<{ recording: SongRecording }>(recordingsUrl(scope, songId), {
    method: 'POST',
    body: formData,
  });
  return data.recording;
}

export async function deleteSongRecording(
  scope: RecordingsScope,
  songId: string,
  recording: SongRecording,
): Promise<void> {
  await apiFetch(`${recordingsUrl(scope, songId)}/${recording.id}`, { method: 'DELETE' });
}

export async function renameSongRecording(
  scope: RecordingsScope,
  songId: string,
  recording: SongRecording,
  newName: string,
): Promise<void> {
  await apiFetch(`${recordingsUrl(scope, songId)}/${recording.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: newName }),
  });
}
