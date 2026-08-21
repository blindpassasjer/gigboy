export type ImportedSongListDraft = {
  name: string;
  icon?: string;
  songs: { title: string; artist?: string | null }[];
};

function fileNameToName(fileName: string): string {
  const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, '');
  const normalized = nameWithoutExtension.replace(/[\s_-]+/g, ' ').trim();
  return normalized || 'Imported songlist';
}

function supportsJsonImport(file: File): boolean {
  if (file.type === 'application/json') return true;
  return file.name.toLowerCase().endsWith('.json');
}

export const SONGLIST_JSON_IMPORT_ACCEPT = ['application/json', '.json'].join(',');

export async function parseImportedSongListFile(file: File): Promise<ImportedSongListDraft> {
  if (!supportsJsonImport(file)) {
    throw new Error('Only .json songlist exports are supported.');
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
    throw new Error('This file is not a gigboy songlist export.');
  }

  const record = parsed as Record<string, unknown>;
  if (record.type !== 'gigboy.songlist') {
    throw new Error('This file is not a gigboy songlist export.');
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
    }))
    .filter((song) => song.title.trim().length > 0);

  if (songs.length === 0) {
    throw new Error('This songlist export has no songs to import.');
  }

  return { name, icon, songs };
}
