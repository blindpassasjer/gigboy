import JSZip from 'jszip';

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
  stageShape?: string;
  stageSize?: string;
  updatedAt?: string;
}

export interface PressKitRiderItem {
  id: string;
  name: string;
  icon?: string;
  lines: Array<{ id?: string; name?: string; description?: string }>;
  preferredEquipment: Array<{ id?: string; name?: string; description?: string }>;
  inventoryEquipment: Array<{ id?: string; name?: string; description?: string }>;
  updatedAt?: string;
}

export interface PressKitPayload {
  bandName: string;
  stageplots: PressKitStageplotItem[];
  riders: PressKitRiderItem[];
  texts: PressKitTextItem[];
  images: PressKitImageItem[];
  generatedAt?: string;
}

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'item';
}

function extensionFromUrl(url: string): string {
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

function riderAsText(rider: PressKitRiderItem): string {
  const lines = rider.lines.map((line) => {
    const name = (line.name ?? '').trim();
    const description = (line.description ?? '').trim();
    return name ? `- ${name}${description ? `: ${description}` : ''}` : null;
  }).filter((entry): entry is string => Boolean(entry));

  const preferred = rider.preferredEquipment.map((entry) => {
    const name = (entry.name ?? '').trim();
    const description = (entry.description ?? '').trim();
    return name ? `- ${name}${description ? `: ${description}` : ''}` : null;
  }).filter((entry): entry is string => Boolean(entry));

  const inventory = rider.inventoryEquipment.map((entry) => {
    const name = (entry.name ?? '').trim();
    const description = (entry.description ?? '').trim();
    return name ? `- ${name}${description ? `: ${description}` : ''}` : null;
  }).filter((entry): entry is string => Boolean(entry));

  return [
    `Technical Rider: ${rider.name}`,
    '',
    'Lines',
    lines.length > 0 ? lines.join('\n') : '- None',
    '',
    'Preferred Equipment',
    preferred.length > 0 ? preferred.join('\n') : '- None',
    '',
    'Inventory Equipment',
    inventory.length > 0 ? inventory.join('\n') : '- None',
  ].join('\n');
}

export async function generatePressKitZip(payload: PressKitPayload): Promise<Blob> {
  const zip = new JSZip();
  const generatedAt = payload.generatedAt ?? new Date().toISOString();
  const root = zip.folder(sanitizeFileName(payload.bandName));
  if (!root) throw new Error('Failed to build ZIP folder');

  root.file(
    'README.txt',
    [
      `${payload.bandName} Press Kit`,
      `Generated: ${generatedAt}`,
      '',
      `Stageplots: ${payload.stageplots.length}`,
      `Technical Riders: ${payload.riders.length}`,
      `Texts: ${payload.texts.length}`,
      `Images: ${payload.images.length}`,
    ].join('\n')
  );

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
