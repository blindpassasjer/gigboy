import type { Band } from '../types';
import { isDemoMode } from './demo/demoMode';
import * as demoStore from './demo/demoStore';

/** A band logo asset, self-host's equivalent of PressKitImage but for the logo asset library. */
export interface BandLogoAsset {
  id: string;
  url: string;
  thumbUrl: string;
  mimeType: string;
  sizeBytes: number;
  thumbSizeBytes: number;
  createdAt: string;
  createdBy?: string;
}

/**
 * Band logo asset library, talking to `/api/bands/:bandId/logos` (see
 * server/routes/bandLogos.ts). Thumbnailed server-side via sharp on upload.
 */
const API_BASE = '/api';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
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

export async function listBandLogos(bandId: string): Promise<BandLogoAsset[]> {
  if (isDemoMode) return demoStore.delay(demoStore.listBandLogos(bandId));
  const data = await apiFetch<{ logos: BandLogoAsset[] }>(`/bands/${bandId}/logos`);
  return data.logos ?? [];
}

export async function uploadBandLogoAsset(bandId: string, file: File): Promise<BandLogoAsset> {
  if (isDemoMode) return demoStore.delay(demoStore.addBandLogo(bandId, file));
  const formData = new FormData();
  formData.append('file', file);
  const data = await apiFetch<{ logo: BandLogoAsset }>(`/bands/${bandId}/logos`, {
    method: 'POST',
    body: formData,
  });
  return data.logo;
}

export async function removeBandLogoAsset(bandId: string, logoId: string): Promise<void> {
  if (isDemoMode) return demoStore.delay(demoStore.removeBandLogo(bandId, logoId)).then(() => undefined);
  await apiFetch<Record<string, never>>(`/bands/${bandId}/logos/${logoId}`, { method: 'DELETE' });
}

/** Sets (or, with `logoId: null`, clears) the band's currently-selected logo. */
export async function selectBandLogo(bandId: string, logoId: string | null): Promise<Band> {
  if (isDemoMode) return demoStore.delay(demoStore.selectBandLogo(bandId, logoId));
  const data = await apiFetch<{ band: Band }>(`/bands/${bandId}/logos/selected`, {
    method: 'PUT',
    body: JSON.stringify({ logoId }),
  });
  return data.band;
}
