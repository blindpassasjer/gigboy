import JSZip from 'jszip';
import type { Song } from '../types';
import { parsePastedSong } from './chordFormatParser';
import { parseSongFile } from './parseSongFile';
import { readSongbookProBackup, SONGBOOK_PRO_DATA_FILE } from './songbookProImport';

const SONG_TEXT_EXTENSIONS = ['.txt', '.md', '.chordpro', '.pro', '.cho', '.crd', '.lyrics', '.onsong'] as const;

export type ImportedSongDraft = {
  title: string;
  artist?: string;
  author?: string;
  language?: Song['language'];
  secondaryLanguages?: Song['secondaryLanguages'];
  tags?: Song['tags'];
  key?: string;
  capo?: number;
  tempo?: number;
  timeSignature?: string;
  durationSeconds?: number;
  preferredTranspose?: number;
  playbackUrl?: string;
  chordpro: string;
  warnings: string[];
  detectedSource?: string;
};

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex < 0) return '';
  return fileName.slice(dotIndex).toLowerCase();
}

function fileNameToTitle(fileName: string): string {
  // Drop any directory prefix a zip entry carries, then the extension.
  const base = fileName.split('/').pop() ?? fileName;
  const nameWithoutExtension = base.replace(/\.[^/.]+$/, '');
  const normalized = nameWithoutExtension
    .replace(/[\s_-]+/g, ' ')
    .trim();
  return normalized || 'Imported song';
}

function hasTextSongExtension(fileName: string): boolean {
  return SONG_TEXT_EXTENSIONS.includes(getFileExtension(fileName) as typeof SONG_TEXT_EXTENSIONS[number]);
}

function supportsTextImport(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  return hasTextSongExtension(file.name);
}

function isZipFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  return extension === '.zip'
    || extension === '.sbpbackup'
    || file.type === 'application/zip'
    || file.type === 'application/x-zip-compressed';
}

export const SONG_TEXT_IMPORT_ACCEPT = [
  'text/plain',
  '.txt',
  '.md',
  '.chordpro',
  '.pro',
  '.cho',
  '.crd',
  '.lyrics',
  '.onsong',
].join(',');

/** Like `SONG_TEXT_IMPORT_ACCEPT`, plus `.zip` archives and Songbook Pro `.sbpbackup` backups. */
export const SONG_IMPORT_ACCEPT = `${SONG_TEXT_IMPORT_ACCEPT},.zip,application/zip,.sbpbackup`;

/** Parse a single song's raw text (already read from a file or zip entry) into a draft. */
export function parseImportedSongText(fileName: string, raw: string): ImportedSongDraft {
  if (!raw.trim()) {
    throw new Error('This file is empty.');
  }

  const fallbackTitle = fileNameToTitle(fileName);
  const hasFrontmatter = raw.trimStart().startsWith('---');

  if (hasFrontmatter) {
    const parsed = parseSongFile(raw, fallbackTitle);
    return {
      title: parsed.title || fallbackTitle,
      artist: parsed.artist,
      language: parsed.language,
      secondaryLanguages: parsed.secondaryLanguages,
      tags: parsed.tags,
      key: parsed.key,
      capo: parsed.capo,
      tempo: parsed.tempo,
      timeSignature: parsed.timeSignature,
      chordpro: parsed.chordpro,
      warnings: [],
      detectedSource: 'Frontmatter',
    };
  }

  const parsed = parsePastedSong(raw);
  return {
    title: parsed.title || fallbackTitle,
    artist: parsed.artist,
    author: parsed.author,
    key: parsed.key,
    capo: parsed.capo,
    tempo: parsed.tempo,
    chordpro: parsed.chordpro,
    warnings: parsed.warnings,
    detectedSource: parsed.detectedSource,
  };
}

export async function parseImportedSongFile(file: File): Promise<ImportedSongDraft> {
  if (!supportsTextImport(file)) {
    throw new Error('Only text song files are supported here (.txt, .md, .chordpro, .pro, .cho, .crd, .lyrics, .onsong).');
  }
  return parseImportedSongText(file.name, await file.text());
}

export interface ExpandedSongImport {
  /** Display name for this entry (file name, or `archive.zip › entry.cho`). */
  name: string;
  draft: ImportedSongDraft;
  /** Files (PDFs) to attach to the song once it's created. */
  attachments?: File[];
  /** Key that `setlists` entries use to refer to this item. */
  ref?: string;
}

/** A setlist carried by a backup, referring to songs in the same result by `ExpandedSongImport.ref`. */
export interface ExpandedSetlistImport {
  name: string;
  songs: Array<{ ref: string; note?: string }>;
}

export interface ExpandSongImportResult {
  items: ExpandedSongImport[];
  setlists: ExpandedSetlistImport[];
  errors: Array<{ name: string; message: string }>;
}

async function expandZipArchive(file: File, result: ExpandSongImportResult): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    result.errors.push({ name: file.name, message: 'Could not read this .zip archive.' });
    return;
  }

  if (zip.file(SONGBOOK_PRO_DATA_FILE)) {
    await expandSongbookProBackup(zip, file.name, result);
    return;
  }

  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && hasTextSongExtension(entry.name) && !entry.name.split('/').pop()!.startsWith('.'),
  );

  if (entries.length === 0) {
    result.errors.push({ name: file.name, message: 'No song files found inside this archive.' });
    return;
  }

  for (const entry of entries) {
    const label = `${file.name} › ${entry.name.split('/').pop()}`;
    try {
      const raw = await entry.async('string');
      result.items.push({ name: label, draft: parseImportedSongText(entry.name, raw) });
    } catch (err) {
      result.errors.push({ name: label, message: err instanceof Error ? err.message : 'Failed to parse.' });
    }
  }
}

async function expandSongbookProBackup(zip: JSZip, archiveName: string, result: ExpandSongImportResult): Promise<void> {
  let backup;
  try {
    backup = await readSongbookProBackup(zip, archiveName);
  } catch (err) {
    result.errors.push({ name: archiveName, message: err instanceof Error ? err.message : 'Failed to parse.' });
    return;
  }

  // Refs are scoped by archive so two backups in one selection can't collide.
  const ref = (sourceId: number) => `${archiveName}#${sourceId}`;
  for (const song of backup.songs) {
    result.items.push({
      name: `${archiveName} › ${song.draft.title}`,
      draft: song.draft,
      attachments: song.attachments,
      ref: ref(song.sourceId),
    });
  }
  for (const setlist of backup.setlists) {
    result.setlists.push({
      name: setlist.name,
      songs: setlist.songs.map((song) => ({ ref: ref(song.sourceId), note: song.note })),
    });
  }
  result.errors.push(...backup.errors);
}

/**
 * Turn a user's file selection (loose song files and/or `.zip` archives) into a flat list
 * of parsed song drafts, collecting per-entry errors instead of failing the whole batch.
 */
export async function expandSongImportSelection(files: File[] | FileList): Promise<ExpandSongImportResult> {
  const result: ExpandSongImportResult = { items: [], setlists: [], errors: [] };

  for (const file of Array.from(files)) {
    if (isZipFile(file)) {
      await expandZipArchive(file, result);
      continue;
    }
    try {
      result.items.push({ name: file.name, draft: await parseImportedSongFile(file) });
    } catch (err) {
      result.errors.push({ name: file.name, message: err instanceof Error ? err.message : 'Failed to parse.' });
    }
  }

  return result;
}
