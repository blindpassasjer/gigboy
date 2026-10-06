import JSZip from 'jszip';
import type { StageplotItem } from '../types';
import { stageplotIsOutputKind, stageplotItemBadge, compareStageplotItemsByChannel } from './stageplotIcons';
import { detectPresavePlatformLabel } from '../utils/pressKitMedia';

export interface PressKitTextItem {
  title: string;
  body: string;
}

export interface PressKitImageItem {
  title: string;
  url: string;
  mimeType: string;
}

export interface PressKitStageplotItem {
  id: string;
  name: string;
  icon?: string;
  items: unknown[];
  drawingLayers?: unknown[];
  updatedAt?: string;
}

export interface PressKitRiderItem {
  id: string;
  name: string;
  icon?: string;
  /** The stage plot's own items ARE the input list — channel/description/stand
   * live on each item, grouped into inputs/monitors/reference for display. */
  items?: StageplotItem[];
  hospitalityNotes?: string;
  logisticsNotes?: string;
  updatedAt?: string;
}

/** A gig listed on a press kit — only the fields safe to publish. */
export interface PressKitDate {
  title: string;
  startsAt: string;
  timezone?: string | null;
  venue?: string | null;
  address?: string | null;
  tourName?: string | null;
}

/** "Sat, Nov 7, 2026, 20:00 — Saturday Night at Union Hall — Union Hall, 70 Union Street" (gig's own timezone). */
export function pressKitDateLine(date: PressKitDate): string {
  const when = new Date(date.startsAt);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  };
  let formatted: string;
  try {
    formatted = when.toLocaleString('en-GB', { ...options, timeZone: date.timezone ?? undefined });
  } catch {
    formatted = when.toLocaleString('en-GB', options); // unknown IANA zone stored on the gig
  }
  const where = [date.venue, date.address].filter(Boolean).join(', ');
  return [formatted, date.title, where].filter(Boolean).join(' — ');
}

export interface PressKitPayload {
  bandName: string;
  stageplots: PressKitStageplotItem[];
  riders: PressKitRiderItem[];
  texts: PressKitTextItem[];
  images: PressKitImageItem[];
  videoUrls?: string[];
  presaveReleaseName?: string;
  presaveReleaseDate?: string;
  presaveUrls?: string[];
  /** Upcoming dates listed on the kit, soonest first. */
  tourDates?: PressKitDate[];
  generatedAt?: string;
}

export function sanitizeFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'item';
}

/**
 * Self-host's image download URLs are `/api/.../:id/download` — no extension in the path, and
 * relative rather than absolute (so `new URL()` on them throws without a base). Derive the
 * extension from the image's own mimeType instead, which is always present on `PressKitImage`.
 */
export function extensionFromImageMimeType(mimeType: string): string {
  const normalized = mimeType.split(';')[0].trim().toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/svg+xml') return 'svg';
  if (normalized === 'image/gif') return 'gif';
  return normalized.includes('/') ? normalized.split('/')[1] : 'bin';
}

function formatChannelLine({ item, index }: { item: StageplotItem; index: number }): string {
  const badge = stageplotItemBadge(item, index);
  const name = item.label.trim() || 'Untitled item';
  const details = [item.description?.trim(), item.stand?.trim() ? `stand: ${item.stand.trim()}` : null]
    .filter(Boolean)
    .join(', ');
  return `- [${badge.value}] ${name}${details ? `: ${details}` : ''}`;
}

function formatReferenceLine(item: StageplotItem): string {
  return `- ${item.label.trim() || 'Untitled item'}`;
}

// The stage plot's per-item channel/description/stand fields ARE the input
// list now (there's no separate line-item table), so the exported rider text
// mirrors the same Technical Inputs / Monitors / Also on Stage grouping the
// app shows in the Stage Plot legend.
export function riderAsText(rider: PressKitRiderItem): string {
  const items = rider.items ?? [];
  const inputItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !stageplotIsOutputKind(item.kind) && !item.noChannel)
    .sort(compareStageplotItemsByChannel);
  const outputItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => stageplotIsOutputKind(item.kind) && !item.noChannel)
    .sort(compareStageplotItemsByChannel);
  const referenceItems = items.filter((item) => item.noChannel === true);

  const inputs = inputItems.map(formatChannelLine);
  const outputs = outputItems.map(formatChannelLine);
  const reference = referenceItems.map(formatReferenceLine);

  const hospitalityNotes = (rider.hospitalityNotes ?? '').trim();
  const logisticsNotes = (rider.logisticsNotes ?? '').trim();

  return [
    `Technical Rider: ${rider.name}`,
    '',
    'Technical Inputs',
    inputs.length > 0 ? inputs.join('\n') : '- None',
    '',
    'Monitors',
    outputs.length > 0 ? outputs.join('\n') : '- None',
    '',
    'Also on Stage',
    reference.length > 0 ? reference.join('\n') : '- None',
    '',
    'Logistics',
    logisticsNotes || '- None',
    '',
    'Hospitality',
    hospitalityNotes || '- None',
  ].join('\n');
}

export async function generatePressKitZip(payload: PressKitPayload): Promise<Blob> {
  const zip = new JSZip();
  const generatedAt = payload.generatedAt ?? new Date().toISOString();
  const root = zip.folder(sanitizeFileName(payload.bandName));
  if (!root) throw new Error('Failed to build ZIP folder');

  const videoUrls = payload.videoUrls ?? [];
  const presaveUrls = payload.presaveUrls ?? [];
  const tourDates = payload.tourDates ?? [];

  root.file(
    'README.txt',
    [
      `${payload.bandName} Press Kit`,
      `Generated: ${generatedAt}`,
      '',
      `Stageplots: ${payload.stageplots.length}`,
      `Input Lists: ${payload.riders.length}`,
      `Texts: ${payload.texts.length}`,
      `Images: ${payload.images.length}`,
      `Music & Videos: ${videoUrls.length}`,
      `Presave links: ${presaveUrls.length}`,
      `Upcoming dates: ${tourDates.length}`,
    ].join('\n')
  );

  if (tourDates.length > 0) {
    // Grouped by tour (dates arrive soonest-first), like the public page.
    const lines: string[] = [];
    let currentTour: string | null | undefined;
    tourDates.forEach((date, index) => {
      if (index === 0 || date.tourName !== currentTour) {
        if (index > 0) lines.push('');
        if (date.tourName) lines.push(date.tourName);
        currentTour = date.tourName;
      }
      lines.push(`- ${pressKitDateLine(date)}`);
    });
    root.file('upcoming-dates.txt', lines.join('\n'));
  }

  if (videoUrls.length > 0) {
    root.file('videos.txt', videoUrls.join('\n'));
  }

  if (presaveUrls.length > 0) {
    const releaseHeader = [
      payload.presaveReleaseName ? `Release: ${payload.presaveReleaseName}` : null,
      payload.presaveReleaseDate ? `Date: ${payload.presaveReleaseDate}` : null,
    ].filter(Boolean);
    root.file(
      'presaves.txt',
      [
        ...releaseHeader,
        ...(releaseHeader.length > 0 ? [''] : []),
        ...presaveUrls.map((url) => `- [${detectPresavePlatformLabel(url)}] ${url}`),
      ].join('\n')
    );
  }

  if (payload.stageplots.length > 0) {
    const stageplotFolder = root.folder('stageplots');
    payload.stageplots.forEach((stageplot) => {
      const fileName = `${sanitizeFileName(stageplot.name)}.json`;
      stageplotFolder?.file(fileName, JSON.stringify(stageplot, null, 2));
    });
  }

  if (payload.riders.length > 0) {
    const riderFolder = root.folder('technical-riders');
    payload.riders.forEach((rider) => {
      const fileName = `${sanitizeFileName(rider.name)}.txt`;
      riderFolder?.file(fileName, riderAsText(rider));
    });
  }

  if (payload.texts.length > 0) {
    const textsFolder = root.folder('texts');
    payload.texts.forEach((text) => {
      const fileName = `${sanitizeFileName(text.title)}.txt`;
      textsFolder?.file(fileName, text.body);
    });
  }

  if (payload.images.length > 0) {
    const imagesFolder = root.folder('images');
    const failedDownloads: string[] = [];
    const usedNames = new Set<string>();

    await Promise.all(payload.images.map(async (image) => {
      try {
        const response = await fetch(image.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        const extension = extensionFromImageMimeType(image.mimeType);
        let fileName = `${sanitizeFileName(image.title)}.${extension}`;
        let counter = 2;
        while (usedNames.has(fileName)) {
          fileName = `${sanitizeFileName(image.title)}-${counter}.${extension}`;
          counter += 1;
        }
        usedNames.add(fileName);
        imagesFolder?.file(fileName, bytes);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        failedDownloads.push(`${image.title}: ${image.url} (${message})`);
      }
    }));

    if (failedDownloads.length > 0) {
      imagesFolder?.file('_failed-downloads.txt', failedDownloads.join('\n'));
    }
  }

  return zip.generateAsync({ type: 'blob' });
}
