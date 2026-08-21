export type ImportedSetlistDraft = {
  name: string;
  icon?: string;
  songs: { title: string; artist?: string | null; note?: string }[];
};

function fileNameToName(fileName: string): string {
  const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, '');
  const normalized = nameWithoutExtension.replace(/[\s_-]+/g, ' ').trim();
  return normalized || 'Imported setlist';
}

function supportsJsonImport(file: File): boolean {
  if (file.type === 'application/json') return true;
  return file.name.toLowerCase().endsWith('.json');
}

export const SETLIST_JSON_IMPORT_ACCEPT = ['application/json', '.json'].join(',');

export async function parseImportedSetlistFile(file: File): Promise<ImportedSetlistDraft> {
  if (!supportsJsonImport(file)) {
    throw new Error('Only .json setlist exports are supported.');
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
    throw new Error('This file is not a gigboy setlist export.');
  }

  const record = parsed as Record<string, unknown>;
  if (record.type !== 'gigboy.setlist') {
    throw new Error('This file is not a gigboy setlist export.');
  }

  const fallbackName = fileNameToName(file.name);
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : fallbackName;
  const icon = typeof record.icon === 'string' ? record.icon : undefined;

  const rawSongs = Array.isArray(record.songs) ? record.songs : [];
  const songs = rawSongs
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      title: typeof entry.title === 'string' ? entry.title : '',
      artist: typeof entry.artist === 'string' ? entry.artist : null,
      note: typeof entry.note === 'string' ? entry.note : undefined,
    }))
    .filter((song) => song.title.trim().length > 0);

  if (songs.length === 0) {
    throw new Error('This setlist export has no songs to import.');
  }

  return { name, icon, songs };
}
