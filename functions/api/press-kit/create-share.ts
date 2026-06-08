/// <reference types="@cloudflare/workers-types" />
import { generateToken } from '../../_helpers/auth';
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

interface PressKitTextEntry {
  title: string;
  body: string;
}

interface PressKitImageEntry {
  title: string;
  url: string;
}

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function asStringArray(value: unknown, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, maxLength);
}

function asTextEntries(value: unknown): PressKitTextEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Record<string, unknown>;
      const title = cleanString(raw.title, 120);
      const body = cleanString(raw.body, 12000);
      if (!title || !body) return null;
      return { title, body };
    })
    .filter((entry): entry is PressKitTextEntry => Boolean(entry))
    .slice(0, 50);
}

function asImageEntries(value: unknown): PressKitImageEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Record<string, unknown>;
      const title = cleanString(raw.title, 120);
      const url = cleanString(raw.url, 2000);
      if (!title || !url) return null;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      } catch {
        return null;
      }
      return { title, url };
    })
    .filter((entry): entry is PressKitImageEntry => Boolean(entry))
    .slice(0, 50);
}

function asVideoEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => cleanString(entry, 2000))
    .filter((entry) => {
      if (!entry) return false;
      try {
        const parsed = new URL(entry);
        const host = parsed.hostname?.toLowerCase();
        if (!host) return false;
        if (host === 'youtu.be' || host.endsWith('youtube.com')) return true;
        if (host.endsWith('vevo.com')) return true;
        if (host === 'vimeo.com' || host === 'www.vimeo.com' || host === 'player.vimeo.com') return true;
        if (host === 'open.spotify.com' || host === 'spotify.com' || host === 'www.spotify.com') return true;
        return false;
      } catch {
        return false;
      }
    })
    .slice(0, 20);
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await ctx.request.json<Record<string, unknown>>().catch((err) => {
    console.error('Failed to parse request body:', err);
    return null;
  });
  if (!body) return Response.json({ error: 'Invalid request body.' }, { status: 400 });

  const bandId = cleanString(body.bandId, 120);
  if (!bandId) {
    return Response.json({ error: 'bandId is required.' }, { status: 400 });
  }

  const bandDoc = await getFirestoreDocument(ctx.env, ['bands', bandId]);
  if (!bandDoc) {
    return Response.json({ error: 'Band not found.' }, { status: 404 });
  }

  const ownerId = typeof bandDoc.ownerId === 'string' ? bandDoc.ownerId : '';
  const memberRoles =
    typeof bandDoc.memberRoles === 'object' && bandDoc.memberRoles !== null
      ? (bandDoc.memberRoles as Record<string, unknown>)
      : {};
  const canEdit = ownerId === userId || memberRoles[userId] === 'editor';
  if (!canEdit) {
    return Response.json({ error: 'Only band editors can create a press kit share.' }, { status: 403 });
  }

  const selectedStageplotIds = asStringArray(body.selectedStageplotIds, 100);
  const selectedRiderIds = asStringArray(body.selectedRiderIds, 100);
  const pressKitIcon = cleanString(body.pressKitIcon, 4);
  const texts = asTextEntries(body.texts);
  const images = asImageEntries(body.images);
  const videoUrls = asVideoEntries(body.videoUrls);

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

  if (stageplots.length === 0 && riders.length === 0 && texts.length === 0 && images.length === 0 && videoUrls.length === 0) {
    return Response.json({ error: 'Select at least one item to share.' }, { status: 400 });
  }

  const token = generateToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString();
  const bandName = typeof bandDoc.name === 'string' ? bandDoc.name : 'Band';
  const rawBandLogo = typeof bandDoc.logo === 'string' ? cleanString(bandDoc.logo, 2000) : '';
  let bandLogo = '';
  if (rawBandLogo) {
    try {
      const parsed = new URL(rawBandLogo);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        bandLogo = rawBandLogo;
      }
    } catch {
      bandLogo = '';
    }
  }

  await setFirestoreDocument(ctx.env, ['pressKitShares', token], {
    token,
    status: 'active',
    bandId,
    bandName,
    ...(bandLogo ? { bandLogo } : {}),
    ...(pressKitIcon ? { pressKitIcon } : {}),
    createdBy: userId,
    createdAt: now,
    expiresAt,
    snapshot: {
      stageplots,
      riders,
      texts,
      images,
      videoUrls,
      generatedAt: now,
    },
  });

  const url = new URL(ctx.request.url);
  const publicUrl = `${url.origin}/public/press-kit/${token}`;

  return Response.json({ ok: true, token, publicUrl, expiresAt });
};
