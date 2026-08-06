/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, listFirestoreDocuments } from './firebase-admin';

export interface PublicPressKitData {
  bandId: string;
  bandName: string;
  bandLogo?: string;
  pressKitIcon?: string;
  createdAt?: string;
  generatedAt?: string;
  stageplots: Array<Record<string, unknown>>;
  riders: Array<Record<string, unknown>>;
  texts: Array<{ title: string; body: string }>;
  images: Array<{ title: string; url: string }>;
  videoUrls: string[];
}

export type PublicPressKitResult =
  | { ok: true; data: PublicPressKitData }
  | { ok: false; status: number; error: string };

function toAbsoluteHttpUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return trimmed;
  } catch {
    // ignore
  }
  return undefined;
}

export async function getPublicPressKitData(
  env: Record<string, string | undefined>,
  token: string
): Promise<PublicPressKitResult> {
  if (!token) return { ok: false, status: 400, error: 'Token is required.' };

  const share = await getFirestoreDocument(env, ['pressKitShares', token]);
  if (!share || share.status !== 'active') {
    return { ok: false, status: 404, error: 'Press kit not found.' };
  }

  const bandId = typeof share.bandId === 'string' ? share.bandId : '';
  const kitId = typeof share.kitId === 'string' ? share.kitId : '';

  // Legacy shares used a snapshot. Read band info live but keep content from snapshot.
  if (!kitId) {
    const snapshot =
      typeof share.snapshot === 'object' && share.snapshot !== null
        ? (share.snapshot as Record<string, unknown>)
        : {};

    const bandDoc = await getFirestoreDocument(env, ['bands', bandId]);
    const bandName = typeof bandDoc?.name === 'string' ? bandDoc.name : (typeof share.bandName === 'string' ? share.bandName : 'Band');
    const bandLogo = typeof bandDoc?.logo === 'string' ? toAbsoluteHttpUrl(bandDoc.logo) : undefined;

    return {
      ok: true,
      data: {
        bandId,
        bandName,
        bandLogo,
        pressKitIcon: typeof share.pressKitIcon === 'string' ? share.pressKitIcon : undefined,
        createdAt: typeof share.createdAt === 'string' ? share.createdAt : undefined,
        stageplots: Array.isArray(snapshot.stageplots) ? (snapshot.stageplots as Array<Record<string, unknown>>) : [],
        riders: Array.isArray(snapshot.riders) ? (snapshot.riders as Array<Record<string, unknown>>) : [],
        texts: Array.isArray(snapshot.texts) ? (snapshot.texts as Array<{ title: string; body: string }>) : [],
        images: Array.isArray(snapshot.images) ? (snapshot.images as Array<{ title: string; url: string }>) : [],
        videoUrls: Array.isArray(snapshot.videoUrls) ? (snapshot.videoUrls as string[]) : [],
        generatedAt: typeof snapshot.generatedAt === 'string' ? snapshot.generatedAt : undefined,
      },
    };
  }

  // Live read — fetch current data from the source documents.
  const [bandDoc, kitDoc] = await Promise.all([
    getFirestoreDocument(env, ['bands', bandId]),
    getFirestoreDocument(env, ['bands', bandId, 'pressKits', kitId]),
  ]);

  if (!kitDoc) {
    return { ok: false, status: 404, error: 'Press kit not found.' };
  }

  const bandName = typeof bandDoc?.name === 'string' ? bandDoc.name : 'Band';
  const bandLogo = typeof bandDoc?.logo === 'string' ? toAbsoluteHttpUrl(bandDoc.logo) : undefined;

  const pressKitIcon = typeof kitDoc.icon === 'string' ? kitDoc.icon : undefined;
  const richText = typeof kitDoc.richText === 'string' ? kitDoc.richText.trim() : '';
  const kitName = typeof kitDoc.name === 'string' ? kitDoc.name : 'Press Kit';
  const imageIds = Array.isArray(kitDoc.imageIds)
    ? (kitDoc.imageIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  const selectedVideoUrls = Array.isArray(kitDoc.selectedVideoUrls)
    ? (kitDoc.selectedVideoUrls as unknown[]).filter((u): u is string => typeof u === 'string').map((u) => u.trim()).filter(Boolean)
    : [];

  // Fetch images that belong to this press kit.
  let images: Array<{ title: string; url: string }> = [];
  if (imageIds.length > 0) {
    const allImages = await listFirestoreDocuments(env, ['bands', bandId, 'pressKitImages']);
    const imageMap = new Map(allImages.map((entry) => [entry.id, entry.data]));
    images = imageIds
      .map((id) => {
        const img = imageMap.get(id);
        if (!img) return null;
        const title = typeof img.title === 'string' ? img.title : '';
        const url = typeof img.url === 'string' ? img.url : '';
        if (!url) return null;
        return { title, url };
      })
      .filter((entry): entry is { title: string; url: string } => Boolean(entry));
  }

  // Fetch selected stageplots and riders (currently always empty from PressKitView,
  // but kept for future extensibility).
  const selectedStageplotIds = Array.isArray(share.selectedStageplotIds)
    ? (share.selectedStageplotIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  const selectedRiderIds = Array.isArray(share.selectedRiderIds)
    ? (share.selectedRiderIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];

  const stageplots: Array<Record<string, unknown>> = [];
  for (const stageplotId of selectedStageplotIds) {
    const stageplot = await getFirestoreDocument(env, ['bands', bandId, 'stageplots', stageplotId]);
    if (!stageplot) continue;
    stageplots.push({
      id: stageplotId,
      name: typeof stageplot.name === 'string' ? stageplot.name : 'Untitled stageplot',
      icon: typeof stageplot.icon === 'string' ? stageplot.icon : undefined,
      items: Array.isArray(stageplot.items) ? stageplot.items : [],
      updatedAt: typeof stageplot.updatedAt === 'string' ? stageplot.updatedAt : undefined,
    });
  }

  const riders: Array<Record<string, unknown>> = [];
  for (const riderId of selectedRiderIds) {
    const rider = await getFirestoreDocument(env, ['bands', bandId, 'technicalRiders', riderId]);
    if (!rider) continue;
    riders.push({
      id: riderId,
      name: typeof rider.name === 'string' ? rider.name : 'Untitled rider',
      icon: typeof rider.icon === 'string' ? rider.icon : undefined,
      items: Array.isArray(rider.items) ? rider.items : [],
      hospitalityNotes: typeof rider.hospitalityNotes === 'string' ? rider.hospitalityNotes : undefined,
      updatedAt: typeof rider.updatedAt === 'string' ? rider.updatedAt : undefined,
    });
  }

  return {
    ok: true,
    data: {
      bandId,
      bandName,
      bandLogo,
      pressKitIcon,
      createdAt: typeof share.createdAt === 'string' ? share.createdAt : undefined,
      stageplots,
      riders,
      texts: richText ? [{ title: kitName, body: richText }] : [],
      images,
      videoUrls: selectedVideoUrls,
    },
  };
}
