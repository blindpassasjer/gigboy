import { isDemoMode } from './demo/demoMode';

export interface SetlistSessionState {
  songIndex: number;
  pageIndex: number;
  transpose: number;
  hostUserId: string | null;
}

export type SessionPatch = Partial<Pick<SetlistSessionState, 'songIndex' | 'pageIndex' | 'transpose'>>;

const API_BASE = '/api';

function sessionBase(bandId: string, setlistId: string): string {
  return `${API_BASE}/bands/${bandId}/setlists/${setlistId}/session`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
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

// ─── Demo transport (BroadcastChannel across tabs) ────────────────────────────

const DEMO_HOST_ID = `tab-${Math.random().toString(36).slice(2)}`;

function demoStorageKey(setlistId: string): string {
  return `gigboy-demo-setlist-session:${setlistId}`;
}

function demoReadState(setlistId: string): SetlistSessionState {
  try {
    const raw = localStorage.getItem(demoStorageKey(setlistId));
    if (raw) return JSON.parse(raw) as SetlistSessionState;
  } catch {
    // ignore
  }
  return { songIndex: 0, pageIndex: 0, transpose: 0, hostUserId: null };
}

function demoWriteState(setlistId: string, state: SetlistSessionState): void {
  try {
    localStorage.setItem(demoStorageKey(setlistId), JSON.stringify(state));
  } catch {
    // ignore
  }
}

function demoChannel(setlistId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(`gigboy-setlist-session:${setlistId}`);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function subscribeSetlistSession(
  bandId: string,
  setlistId: string,
  onState: (state: SetlistSessionState) => void,
): () => void {
  if (isDemoMode) {
    onState(demoReadState(setlistId));
    const channel = demoChannel(setlistId);
    const handler = (event: MessageEvent) => onState(event.data as SetlistSessionState);
    channel?.addEventListener('message', handler);
    return () => {
      channel?.removeEventListener('message', handler);
      channel?.close();
    };
  }

  const source = new EventSource(`${sessionBase(bandId, setlistId)}/stream`, { withCredentials: true });
  source.onmessage = (event) => {
    try {
      onState(JSON.parse(event.data) as SetlistSessionState);
    } catch {
      // ignore malformed frames
    }
  };
  return () => source.close();
}

export async function claimSetlistHost(bandId: string, setlistId: string): Promise<SetlistSessionState> {
  if (isDemoMode) {
    const next = { ...demoReadState(setlistId), hostUserId: DEMO_HOST_ID };
    demoWriteState(setlistId, next);
    demoChannel(setlistId)?.postMessage(next);
    return next;
  }
  return apiFetch<SetlistSessionState>(`${sessionBase(bandId, setlistId)}/claim`, { method: 'POST' });
}

export async function releaseSetlistHost(bandId: string, setlistId: string): Promise<void> {
  if (isDemoMode) {
    const current = demoReadState(setlistId);
    if (current.hostUserId === DEMO_HOST_ID) {
      const next = { ...current, hostUserId: null };
      demoWriteState(setlistId, next);
      demoChannel(setlistId)?.postMessage(next);
    }
    return;
  }
  await apiFetch<Record<string, never>>(`${sessionBase(bandId, setlistId)}/release`, { method: 'POST' });
}

export async function pushSetlistSession(
  bandId: string,
  setlistId: string,
  patch: SessionPatch,
): Promise<void> {
  if (isDemoMode) {
    const next = { ...demoReadState(setlistId), ...patch, hostUserId: DEMO_HOST_ID };
    demoWriteState(setlistId, next);
    demoChannel(setlistId)?.postMessage(next);
    return;
  }
  await apiFetch<SetlistSessionState>(sessionBase(bandId, setlistId), {
    method: 'POST',
    body: JSON.stringify(patch),
  });
}

export const DEMO_SESSION_HOST_ID = DEMO_HOST_ID;
