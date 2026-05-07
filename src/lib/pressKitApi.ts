import { auth } from './firebase';
import type { PressKitImageItem, PressKitTextItem } from './pressKitZip';

interface ApiHeaders {
  userId: string;
  userEmail: string;
}

interface CreateShareInput {
  userId: string;
  userEmail: string;
  bandId: string;
  selectedStageplotIds: string[];
  selectedRiderIds: string[];
  texts: PressKitTextItem[];
  images: PressKitImageItem[];
}

async function buildHeaders(headers: ApiHeaders) {
  const token = await auth?.currentUser?.getIdToken();
  const normalizedEmail = headers.userEmail.trim().toLowerCase();
  return {
    'Content-Type': 'application/json',
    ...(normalizedEmail ? { 'x-gigboy-user-email': normalizedEmail } : {}),
    ...(headers.userId ? { 'x-gigboy-user-id': headers.userId } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function createPressKitShare(input: CreateShareInput): Promise<{ token: string; publicUrl: string }> {
  const response = await fetch('/api/press-kit/create-share', {
    method: 'POST',
    headers: await buildHeaders({ userId: input.userId, userEmail: input.userEmail }),
    body: JSON.stringify({
      bandId: input.bandId,
      selectedStageplotIds: input.selectedStageplotIds,
      selectedRiderIds: input.selectedRiderIds,
      texts: input.texts,
      images: input.images,
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
  createdAt?: string;
  generatedAt?: string;
  stageplots: Array<{
    id: string;
    name: string;
    icon?: string;
    items: unknown[];
    stageShape?: string;
    stageSize?: string;
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
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : undefined,
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : undefined,
    stageplots: Array.isArray(payload.stageplots) ? payload.stageplots as PublicPressKitPayload['stageplots'] : [],
    riders: Array.isArray(payload.riders) ? payload.riders as PublicPressKitPayload['riders'] : [],
    texts: Array.isArray(payload.texts) ? payload.texts as PressKitTextItem[] : [],
    images: Array.isArray(payload.images) ? payload.images as PressKitImageItem[] : [],
  };
}
