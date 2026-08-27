import { isDemoMode } from './demo/demoMode';
import * as demoStore from './demo/demoStore';

export type VoicingInstrument = 'guitar' | 'ukulele';

export interface ChordVoicing {
  instrument: VoicingInstrument;
  chordName: string;
  frets: number[];
}

/**
 * Per-band chord voicing overrides, talking to `/api/bands/:bandId/chord-voicings`
 * (see server/routes/bandChordVoicings.ts).
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

export async function loadBandChordVoicings(bandId: string): Promise<ChordVoicing[]> {
  if (isDemoMode) return demoStore.listChordVoicings(bandId);
  const data = await apiFetch<{ voicings: ChordVoicing[] }>(`/bands/${bandId}/chord-voicings`);
  return data.voicings ?? [];
}

export async function saveBandChordVoicing(
  bandId: string,
  instrument: VoicingInstrument,
  chordName: string,
  frets: number[],
): Promise<ChordVoicing> {
  if (isDemoMode) return demoStore.saveChordVoicing(bandId, instrument, chordName, frets);
  const data = await apiFetch<{ voicing: ChordVoicing }>(
    `/bands/${bandId}/chord-voicings/${encodeURIComponent(instrument)}/${encodeURIComponent(chordName)}`,
    { method: 'PUT', body: JSON.stringify({ frets }) },
  );
  return data.voicing;
}

export async function deleteBandChordVoicing(
  bandId: string,
  instrument: VoicingInstrument,
  chordName: string,
): Promise<void> {
  if (isDemoMode) {
    demoStore.deleteChordVoicing(bandId, instrument, chordName);
    return;
  }
  await apiFetch<Record<string, never>>(
    `/bands/${bandId}/chord-voicings/${encodeURIComponent(instrument)}/${encodeURIComponent(chordName)}`,
    { method: 'DELETE' },
  );
}
