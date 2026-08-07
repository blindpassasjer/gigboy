import type { PressKitImageItem, PressKitTextItem } from './pressKitZip';
import { buildHeaders } from './apiClient';

interface CreateShareInput {
  userId: string;
  userEmail: string;
  bandId: string;
  kitId: string;
  selectedStageplotIds: string[];
  selectedRiderIds: string[];
}


export async function createPressKitShare(input: CreateShareInput): Promise<{ token: string; publicUrl: string }> {
  const response = await fetch('/api/press-kit/create-share', {
    method: 'POST',
    headers: await buildHeaders({ userId: input.userId, userEmail: input.userEmail }),
    body: JSON.stringify({
      bandId: input.bandId,
      kitId: input.kitId,
      selectedStageplotIds: input.selectedStageplotIds,
      selectedRiderIds: input.selectedRiderIds,
    }),
  });

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    const errorMessage = typeof payload.error === 'string' ? payload.error : 'Request failed.';
    throw new Error(errorMessage);
  }

  return {
    token: typeof payload.token === 'string' ? payload.token : '',
    publicUrl: typeof payload.publicUrl === 'string' ? payload.publicUrl : '',
  };
}

export interface PublicPressKitPayload {
  bandId: string;
  bandName: string;
  bandLogo?: string;
  pressKitIcon?: string;
  createdAt?: string;
  generatedAt?: string;
  stageplots: Array<{
    id: string;
    name: string;
    icon?: string;
    items: unknown[];
    updatedAt?: string;
  }>;
  riders: Array<{
    id: string;
    name: string;
    icon?: string;
    lines: Array<{ id?: string; name?: string; description?: string }>;
    preferredEquipment: Array<{ id?: string; name?: string; description?: string }>;
    inventoryEquipment: Array<{ id?: string; name?: string; description?: string }>;
    updatedAt?: string;
  }>;
  texts: PressKitTextItem[];
  images: PressKitImageItem[];
  videoUrls: string[];
  presaveReleaseName?: string;
  presaveReleaseDate?: string;
  presaveUrls: string[];
}

export interface ActivePressKitShare {
  token: string;
  publicUrl: string;
  createdAt: string;
}

export async function getActivePressKitShare(userId: string, userEmail: string, bandId: string, kitId: string): Promise<ActivePressKitShare | null> {
  const response = await fetch(`/api/press-kit/active-share?bandId=${encodeURIComponent(bandId)}&kitId=${encodeURIComponent(kitId)}`, {
    headers: await buildHeaders({ userId, userEmail }),
  });

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) return null;

  const share = payload.share as Record<string, unknown> | null;
  if (!share) return null;

  return {
    token: typeof share.token === 'string' ? share.token : '',
    publicUrl: typeof share.publicUrl === 'string' ? share.publicUrl : '',
    createdAt: typeof share.createdAt === 'string' ? share.createdAt : '',
  };
}

export async function disablePressKitShare(userId: string, userEmail: string, bandId: string, kitId: string, token: string): Promise<void> {
  const response = await fetch('/api/press-kit/disable-share', {
    method: 'POST',
    headers: await buildHeaders({ userId, userEmail }),
    body: JSON.stringify({ bandId, kitId, token }),
  });

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    const errorMessage = typeof payload.error === 'string' ? payload.error : 'Request failed.';
    throw new Error(errorMessage);
  }
}

export async function fetchPublicPressKit(token: string): Promise<PublicPressKitPayload> {
  const response = await fetch(`/api/public/press-kit/${encodeURIComponent(token)}`);
  const payload = await response.json().catch(() => ({} as Record<string, unknown>));

  if (!response.ok) {
    const errorMessage = typeof payload.error === 'string' ? payload.error : 'Press kit not found.';
    throw new Error(errorMessage);
  }

  return {
    bandId: typeof payload.bandId === 'string' ? payload.bandId : '',
    bandName: typeof payload.bandName === 'string' ? payload.bandName : 'Band',
    bandLogo: typeof payload.bandLogo === 'string' ? payload.bandLogo : undefined,
    pressKitIcon: typeof payload.pressKitIcon === 'string' ? payload.pressKitIcon : undefined,
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : undefined,
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : undefined,
    stageplots: Array.isArray(payload.stageplots) ? payload.stageplots as PublicPressKitPayload['stageplots'] : [],
    riders: Array.isArray(payload.riders) ? payload.riders as PublicPressKitPayload['riders'] : [],
    texts: Array.isArray(payload.texts) ? payload.texts as PressKitTextItem[] : [],
    images: Array.isArray(payload.images) ? payload.images as PressKitImageItem[] : [],
    videoUrls: Array.isArray(payload.videoUrls)
      ? (payload.videoUrls as unknown[]).filter((entry): entry is string => typeof entry === 'string')
      : [],
    presaveReleaseName: typeof payload.presaveReleaseName === 'string' ? payload.presaveReleaseName : undefined,
    presaveReleaseDate: typeof payload.presaveReleaseDate === 'string' ? payload.presaveReleaseDate : undefined,
    presaveUrls: Array.isArray(payload.presaveUrls)
      ? (payload.presaveUrls as unknown[]).filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}
