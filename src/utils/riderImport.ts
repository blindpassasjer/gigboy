import type { StageplotItem } from '../types';

export type ImportedRiderDraft = {
  name: string;
  icon?: string;
  hospitalityNotes?: string;
  logisticsNotes?: string;
  items?: StageplotItem[];
  drawingLayers?: unknown[];
};

function fileNameToName(fileName: string): string {
  const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, '');
  const normalized = nameWithoutExtension.replace(/[\s_-]+/g, ' ').trim();
  return normalized || 'Imported rider';
}

function supportsJsonImport(file: File): boolean {
  if (file.type === 'application/json') return true;
  return file.name.toLowerCase().endsWith('.json');
}

export const RIDER_JSON_IMPORT_ACCEPT = ['application/json', '.json'].join(',');

export async function parseImportedRiderFile(file: File): Promise<ImportedRiderDraft> {
  if (!supportsJsonImport(file)) {
    throw new Error('Only .json technical rider exports are supported.');
  }

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
    throw new Error('This file is not a gigboy technical rider export.');
  }

  const record = parsed as Record<string, unknown>;
  if (record.type !== 'gigboy.technicalRider') {
    throw new Error('This file is not a gigboy technical rider export.');
  }

  const fallbackName = fileNameToName(file.name);
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : fallbackName;

  return {
    name,
    icon: typeof record.icon === 'string' ? record.icon : undefined,
    hospitalityNotes: typeof record.hospitalityNotes === 'string' ? record.hospitalityNotes : undefined,
    logisticsNotes: typeof record.logisticsNotes === 'string' ? record.logisticsNotes : undefined,
    items: Array.isArray(record.items) ? (record.items as StageplotItem[]) : undefined,
    drawingLayers: Array.isArray(record.drawingLayers) ? record.drawingLayers : undefined,
  };
}
