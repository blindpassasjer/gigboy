import type { Song } from '../types';

export interface BpmBucket {
  id: string;
  label: string;
  min: number;
  max: number;
}

export const BPM_BUCKETS: BpmBucket[] = [
  { id: 'slow', label: 'Slow · <80', min: 0, max: 80 },
  { id: 'mid', label: 'Mid · 80–109', min: 80, max: 110 },
  { id: 'upbeat', label: 'Upbeat · 110–139', min: 110, max: 140 },
  { id: 'fast', label: 'Fast · 140+', min: 140, max: Infinity },
];

const NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

/** Normalizes free-text keys ("Bb", "a minor", "F#m") to "A#", "Am", "F#m". Returns undefined if unparseable. */
export function normalizeKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  const match = raw.trim().match(/^([A-Ga-g])\s*([#b♯♭]?)\s*(.*)$/);
  if (!match) return undefined;
  const accidental = match[2] === '♯' ? '#' : match[2] === '♭' ? 'b' : match[2];
  let root = match[1].toUpperCase() + accidental;
  root = FLAT_TO_SHARP[root] ?? root;
  if (!NOTE_ORDER.includes(root)) return undefined;
  const quality = match[3].trim().toLowerCase();
  const isMinor = /^(m|min|minor|-)(?!aj)/.test(quality) && !quality.startsWith('maj');
  return isMinor ? `${root}m` : root;
}

/** Musical sort order: C, Cm, C#, C#m, D … */
export function compareKeys(a: string, b: string): number {
  const rootA = NOTE_ORDER.indexOf(a.replace(/m$/, ''));
  const rootB = NOTE_ORDER.indexOf(b.replace(/m$/, ''));
  return rootA - rootB || Number(a.endsWith('m')) - Number(b.endsWith('m'));
}

export function songLanguages(song: Song): string[] {
  return [song.language, ...(song.secondaryLanguages ?? [])].filter(Boolean);
}

export interface SongFilters {
  languages: string[];
  keys: string[];
  bpm: string[];
}

export const EMPTY_SONG_FILTERS: SongFilters = { languages: [], keys: [], bpm: [] };

export function countActiveFilters(filters: SongFilters): number {
  return filters.languages.length + filters.keys.length + filters.bpm.length;
}

/** AND across filter groups, OR within a group. */
export function matchesSongFilters(song: Song, filters: SongFilters): boolean {
  if (filters.languages.length > 0 && !songLanguages(song).some((l) => filters.languages.includes(l))) {
    return false;
  }
  if (filters.keys.length > 0) {
    const key = normalizeKey(song.key);
    if (!key || !filters.keys.includes(key)) return false;
  }
  if (filters.bpm.length > 0) {
    const tempo = song.tempo;
    if (!tempo) return false;
    const inBucket = BPM_BUCKETS.some((b) => filters.bpm.includes(b.id) && tempo >= b.min && tempo < b.max);
    if (!inBucket) return false;
  }
  return true;
}

/** Parses persisted filters defensively; anything malformed falls back to no filters. */
export function parseStoredFilters(raw: string | null): SongFilters {
  if (!raw) return EMPTY_SONG_FILTERS;
  try {
    const parsed = JSON.parse(raw) as Partial<SongFilters>;
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { languages: strings(parsed.languages), keys: strings(parsed.keys), bpm: strings(parsed.bpm) };
  } catch {
    return EMPTY_SONG_FILTERS;
  }
}

export interface SongFilterOptions {
  languages: string[];
  keys: string[];
  hasTempo: boolean;
}

/** Options for the filter chips, derived from the songs actually in the list. */
export function getFilterOptions(songs: Song[], languageLabel: (code: string) => string = (c) => c): SongFilterOptions {
  const languages = [...new Set(songs.flatMap(songLanguages))].sort((a, b) => languageLabel(a).localeCompare(languageLabel(b)));
  const keys = [...new Set(songs.map((s) => normalizeKey(s.key)).filter((k): k is string => Boolean(k)))].sort(compareKeys);
  return { languages, keys, hasTempo: songs.some((s) => s.tempo) };
}
