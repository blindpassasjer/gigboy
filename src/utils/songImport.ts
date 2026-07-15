import type { Song } from '../types';
import { parsePastedSong } from './chordFormatParser';
import { parseSongFile } from './parseSongFile';

const SONG_TEXT_EXTENSIONS = ['.txt', '.md', '.chordpro', '.pro', '.cho', '.crd', '.lyrics'] as const;

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
  const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, '');
  const normalized = nameWithoutExtension
    .replace(/[\s_-]+/g, ' ')
    .trim();
  return normalized || 'Imported song';
}

function supportsTextImport(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  return SONG_TEXT_EXTENSIONS.includes(getFileExtension(file.name) as typeof SONG_TEXT_EXTENSIONS[number]);
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
].join(',');

export async function parseImportedSongFile(file: File): Promise<ImportedSongDraft> {
  if (!supportsTextImport(file)) {
    throw new Error('Only text song files are supported right now (.txt, .md, .chordpro, .pro, .cho, .crd, .lyrics).');
  }

  const raw = await file.text();
  if (!raw.trim()) {
    throw new Error('This file is empty.');
  }

  const fallbackTitle = fileNameToTitle(file.name);
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
