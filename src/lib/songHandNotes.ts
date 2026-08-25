import type { LyricNoteDocument } from '../types';
import { isDemoMode } from './demo/demoMode';
import * as demoStore from './demo/demoStore';

/**
 * Self-host implementation of song hand notes (freehand drawings + typed annotations on song
 * lyrics), talking to `/api/bands/:bandId/songs/:songId/hand-notes` (see
 * server/routes/songHandNotes.ts) instead of Firestore. `subscribeToSongHandNotes` keeps its
 * old onSnapshot-shaped signature (callback in, unsubscribe function out) but is backed by polling
 * instead of a realtime listener, so `useSongHandNotes.ts` doesn't need to change its call site.
 */
const API_BASE = '/api';
const POLL_INTERVAL_MS = 4000;

function notesUrl(bandId: string, songId: string): string {
  return `${API_BASE}/bands/${bandId}/songs/${songId}/hand-notes`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
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

/** Polls the notes list every 4s (matching the realtime feel `onSnapshot` used to give) and reports changes. */
export function subscribeToSongHandNotes(
  bandId: string,
  songId: string,
  onUpdate: (notes: LyricNoteDocument[]) => void,
  onError?: (error: Error) => void,
): () => void {
  if (isDemoMode) {
    let cancelled = false;
    void demoStore.delay(demoStore.listHandNotes(bandId, songId)).then((notes) => {
      if (!cancelled) onUpdate(notes);
    });
    return () => {
      cancelled = true;
    };
  }

  let cancelled = false;
  let lastPayload = '';

  const poll = async () => {
    try {
      const data = await apiFetch<{ notes: LyricNoteDocument[] }>(notesUrl(bandId, songId));
      if (cancelled) return;
      const notes = (data.notes ?? []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const payload = JSON.stringify(notes);
      if (payload !== lastPayload) {
        lastPayload = payload;
        onUpdate(notes);
      }
    } catch (error) {
      if (cancelled) return;
      console.error('Failed to load song hand notes.', error);
      onError?.(error as Error);
    }
  };

  void poll();
  const intervalId = window.setInterval(() => void poll(), POLL_INTERVAL_MS);

  return () => {
    cancelled = true;
    window.clearInterval(intervalId);
  };
}

export async function saveSongHandNote(params: {
  bandId: string;
  songId: string;
  note: LyricNoteDocument;
}): Promise<void> {
  const { bandId, songId, note } = params;
  if (isDemoMode) {
    return demoStore.delay(demoStore.saveHandNote(bandId, songId, note)).then(() => undefined);
  }
  await apiFetch(`${notesUrl(bandId, songId)}/me`, {
    method: 'PUT',
    body: JSON.stringify({
      authorName: note.authorName ?? null,
      authorAvatar: note.authorAvatar ?? null,
      strokes: note.strokes,
      textNotes: note.textNotes ?? [],
    }),
  });
}

export async function deleteSongHandNote(params: {
  bandId: string;
  songId: string;
  authorUid: string;
}): Promise<void> {
  const { bandId, songId, authorUid } = params;
  if (isDemoMode) {
    return demoStore.delay(demoStore.deleteHandNote(bandId, songId, authorUid)).then(() => undefined);
  }
  const url = `${notesUrl(bandId, songId)}/${authorUid}`;
  await apiFetch(url, { method: 'DELETE' });
}
