import JSZip from 'jszip';
import type { StageplotItem } from '../types';
import { stageplotIsOutputKind, stageplotItemBadge, compareStageplotItemsByChannel } from './stageplotIcons';

export interface PressKitTextItem {
  title: string;
  body: string;
}

export interface PressKitImageItem {
  title: string;
  url: string;
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

export interface PressKitPayload {
  bandName: string;
  stageplots: PressKitStageplotItem[];
  riders: PressKitRiderItem[];
  texts: PressKitTextItem[];
  images: PressKitImageItem[];
  videoUrls?: string[];
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

export function extensionFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith('.png')) return 'png';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'jpg';
    if (pathname.endsWith('.webp')) return 'webp';
    if (pathname.endsWith('.svg')) return 'svg';
    if (pathname.endsWith('.gif')) return 'gif';
  } catch {
    // Ignore invalid URL parsing.
  }
  return 'bin';
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
      `Videos: ${videoUrls.length}`,
    ].join('\n')
  );

  if (videoUrls.length > 0) {
    root.file('videos.txt', videoUrls.join('\n'));
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

    await Promise.all(payload.images.map(async (image) => {
      try {
        const response = await fetch(image.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        const extension = extensionFromUrl(image.url);
        imagesFolder?.file(`${sanitizeFileName(image.title)}.${extension}`, bytes);
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
