export type ImportedPressKitImageRef = { title: string; filename: string };

export type ImportedPressKitDraft = {
  name: string;
  icon?: string;
  richText: string;
  images: ImportedPressKitImageRef[];
  videoUrls: string[];
  selectedVideoUrls: string[];
  presaveReleaseName?: string;
  presaveReleaseDate?: string;
  presaveUrls: string[];
  selectedPresaveUrls: string[];
};

function fileNameToName(fileName: string): string {
  const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, '');
  const normalized = nameWithoutExtension.replace(/[\s_-]+/g, ' ').trim();
  return normalized || 'Imported press kit';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** Finds the kit.json among a multi-file selection (the rest are candidate image attachments). */
export function findPressKitJsonFile(files: File[]): File | null {
  return files.find((file) => file.name.toLowerCase().endsWith('.json')) ?? null;
}

export async function parseImportedPressKitFile(file: File): Promise<ImportedPressKitDraft> {
  const raw = await file.text();
  if (!raw.trim()) {
    throw new Error('This file is empty.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('This file is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('This file is not a gigboy press kit export.');
  }

  const record = parsed as Record<string, unknown>;
  if (record.type !== 'gigboy.pressKit') {
    throw new Error('This file is not a gigboy press kit export.');
  }

  const fallbackName = fileNameToName(file.name);
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : fallbackName;

  const rawImages = Array.isArray(record.images) ? record.images : [];
  const images = rawImages
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      title: typeof entry.title === 'string' ? entry.title : '',
      filename: typeof entry.filename === 'string' ? entry.filename : '',
    }))
    .filter((image) => image.title.trim().length > 0 && image.filename.trim().length > 0);

  return {
    name,
    icon: typeof record.icon === 'string' ? record.icon : undefined,
    richText: typeof record.richText === 'string' ? record.richText : '',
    images,
    videoUrls: stringArray(record.videoUrls),
    selectedVideoUrls: stringArray(record.selectedVideoUrls),
    presaveReleaseName: typeof record.presaveReleaseName === 'string' ? record.presaveReleaseName : undefined,
    presaveReleaseDate: typeof record.presaveReleaseDate === 'string' ? record.presaveReleaseDate : undefined,
    presaveUrls: stringArray(record.presaveUrls),
    selectedPresaveUrls: stringArray(record.selectedPresaveUrls),
  };
}
