/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, listFirestoreDocuments } from '../../../_helpers/firebase-admin';

export const onRequestGet: PagesFunction<Record<string, string | undefined>> = async (ctx) => {
  const token = (ctx.params.token ?? '').trim();
  if (!token) {
    return Response.json({ error: 'Token is required.' }, { status: 400 });
  }

  const share = await getFirestoreDocument(ctx.env, ['pressKitShares', token]);
  if (!share || share.status !== 'active') {
    return Response.json({ error: 'Press kit not found.' }, { status: 404 });
  }

  const bandId = typeof share.bandId === 'string' ? share.bandId : '';
  const kitId = typeof share.kitId === 'string' ? share.kitId : '';

  // Legacy shares used a snapshot. Read band info live but keep content from snapshot.
  if (!kitId) {
    const snapshot =
      typeof share.snapshot === 'object' && share.snapshot !== null
        ? (share.snapshot as Record<string, unknown>)
        : {};

    const bandDoc = await getFirestoreDocument(ctx.env, ['bands', bandId]);
    const bandName = typeof bandDoc?.name === 'string' ? bandDoc.name : (typeof share.bandName === 'string' ? share.bandName : 'Band');
    const rawLogo = typeof bandDoc?.logo === 'string' ? bandDoc.logo.trim() : '';
    let bandLogo: string | undefined;
    if (rawLogo) {
      try {
        const parsed = new URL(rawLogo);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') bandLogo = rawLogo;
      } catch { /* ignore */ }
    }

    return Response.json({
      bandId,
      bandName,
      bandLogo,
      pressKitIcon: typeof share.pressKitIcon === 'string' ? share.pressKitIcon : undefined,
      createdAt: typeof share.createdAt === 'string' ? share.createdAt : undefined,
      stageplots: Array.isArray(snapshot.stageplots) ? snapshot.stageplots : [],
      riders: Array.isArray(snapshot.riders) ? snapshot.riders : [],
      texts: Array.isArray(snapshot.texts) ? snapshot.texts : [],
      images: Array.isArray(snapshot.images) ? snapshot.images : [],
      videoUrls: Array.isArray(snapshot.videoUrls) ? snapshot.videoUrls : [],
      generatedAt: typeof snapshot.generatedAt === 'string' ? snapshot.generatedAt : undefined,
    });
  }

  // Live read — fetch current data from the source documents.
  const [bandDoc, kitDoc] = await Promise.all([
    getFirestoreDocument(ctx.env, ['bands', bandId]),
    getFirestoreDocument(ctx.env, ['bands', bandId, 'pressKits', kitId]),
  ]);

  if (!kitDoc) {
    return Response.json({ error: 'Press kit not found.' }, { status: 404 });
  }

  const bandName = typeof bandDoc?.name === 'string' ? bandDoc.name : 'Band';
  const rawBandLogo = typeof bandDoc?.logo === 'string' ? bandDoc.logo.trim() : '';
  let bandLogo: string | undefined;
  if (rawBandLogo) {
    try {
      const parsed = new URL(rawBandLogo);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') bandLogo = rawBandLogo;
    } catch {
      // ignore
    }
  }

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
    const allImages = await listFirestoreDocuments(ctx.env, ['bands', bandId, 'pressKitImages']);
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
    const stageplot = await getFirestoreDocument(ctx.env, ['bands', bandId, 'stageplots', stageplotId]);
    if (!stageplot) continue;
    stageplots.push({
      id: stageplotId,
      name: typeof stageplot.name === 'string' ? stageplot.name : 'Untitled stageplot',
      icon: typeof stageplot.icon === 'string' ? stageplot.icon : undefined,
      items: Array.isArray(stageplot.items) ? stageplot.items : [],
      stageShape: typeof stageplot.stageShape === 'string' ? stageplot.stageShape : undefined,
      stageSize: typeof stageplot.stageSize === 'string' ? stageplot.stageSize : undefined,
      updatedAt: typeof stageplot.updatedAt === 'string' ? stageplot.updatedAt : undefined,
    });
  }

  const riders: Array<Record<string, unknown>> = [];
  for (const riderId of selectedRiderIds) {
    const rider = await getFirestoreDocument(ctx.env, ['bands', bandId, 'technicalRiders', riderId]);
    if (!rider) continue;
    riders.push({
      id: riderId,
      name: typeof rider.name === 'string' ? rider.name : 'Untitled rider',
      icon: typeof rider.icon === 'string' ? rider.icon : undefined,
      lines: Array.isArray(rider.lines) ? rider.lines : [],
      preferredEquipment: Array.isArray(rider.preferredEquipment) ? rider.preferredEquipment : [],
      inventoryEquipment: Array.isArray(rider.inventoryEquipment) ? rider.inventoryEquipment : [],
      updatedAt: typeof rider.updatedAt === 'string' ? rider.updatedAt : undefined,
    });
  }

  return Response.json({
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
  });
};
