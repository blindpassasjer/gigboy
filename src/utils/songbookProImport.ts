import type JSZip from 'jszip';
import { parsePastedSong } from './chordFormatParser';
import type { ImportedSongDraft } from './songImport';

// A Songbook Pro backup (`.sbpbackup`) is a zip holding `dataFile.txt` — a version line
// (e.g. "1.0") followed by one JSON document with `songs`, `sets` and `folders` — plus a
// `pdf/` folder with the files behind PDF-type songs.

export const SONGBOOK_PRO_DATA_FILE = 'dataFile.txt';

// Songbook Pro stores keys as an index counted from A.
const SONGBOOK_PRO_KEYS = ['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab'];

const SONG_TYPE_CHORDPRO = 1;
const SONG_TYPE_PDF = 2;
const SET_ITEM_TYPE_SONG = 1;

interface SongbookProSong {
  Id?: number;
  name?: string;
  author?: string;
  content?: string;
  type?: number;
  key?: number;
  KeyShift?: number;
  Capo?: number;
  TempoInt?: number;
  timeSig?: string;
  Duration?: number;
  Url?: string;
  Deleted?: boolean | number;
}

interface SongbookProSetItem {
  Order?: number;
  SongId?: number;
  ItemType?: number;
  keyOfset?: number;
  NotesText?: string | null;
  Deleted?: boolean | number;
}

interface SongbookProSet {
  details?: { name?: string; Deleted?: boolean | number };
  contents?: SongbookProSetItem[];
}

export interface SongbookProSongImport {
  /** Songbook Pro's own song id, referenced by its sets. */
  sourceId: number;
  draft: ImportedSongDraft;
  /** PDF file(s) to attach to the created song (PDF-type songs). */
  attachments: File[];
}

export interface SongbookProSetlistImport {
  name: string;
  /** Song references in set order, by Songbook Pro song id. */
  songs: Array<{ sourceId: number; note?: string }>;
}

export interface SongbookProBackup {
  songs: SongbookProSongImport[];
  setlists: SongbookProSetlistImport[];
  errors: Array<{ name: string; message: string }>;
}

function isDeleted(value: boolean | number | undefined): boolean {
  return value === true || value === 1;
}

function keyName(index: number | undefined): string | undefined {
  if (typeof index !== 'number' || index < 0) return undefined;
  // 12–23 are taken to be the minor keys, in the same A-based order.
  if (index < 12) return SONGBOOK_PRO_KEYS[index];
  if (index < 24) return `${SONGBOOK_PRO_KEYS[index - 12]}m`;
  return undefined;
}

/** Songbook Pro keeps shifts as 0–11 semitones up; prefer the shorter way round (10 → -2). */
function normalizeShift(shift: number | undefined): number | undefined {
  if (typeof shift !== 'number' || !Number.isFinite(shift)) return undefined;
  const mod = ((Math.round(shift) % 12) + 12) % 12;
  if (mod === 0) return undefined;
  return mod > 6 ? mod - 12 : mod;
}

function positive(value: number | undefined): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

function playbackUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\/([^/]+\.)?(youtube\.com|youtu\.be|spotify\.com)\//i.test(trimmed) ? trimmed : undefined;
}

function shiftNote(shift: number | undefined): string | undefined {
  const normalized = normalizeShift(shift);
  if (!normalized) return undefined;
  return `Transpose ${normalized > 0 ? '+' : ''}${normalized}`;
}

/** Parse the text of `dataFile.txt` into its JSON document. */
export function parseSongbookProDataFile(raw: string): { songs: SongbookProSong[]; sets: SongbookProSet[] } {
  const text = raw.replace(/^\uFEFF/, '');
  const jsonStart = text.indexOf('{');
  if (jsonStart < 0) throw new Error('This is not a Songbook Pro backup.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(jsonStart));
  } catch {
    throw new Error('Could not read the Songbook Pro backup data.');
  }

  const record = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  if (!Array.isArray(record.songs)) throw new Error('This is not a Songbook Pro backup.');
  return {
    songs: record.songs as SongbookProSong[],
    sets: Array.isArray(record.sets) ? record.sets as SongbookProSet[] : [],
  };
}

function songDraft(song: SongbookProSong, chordpro: string, warnings: string[], detectedSource?: string): ImportedSongDraft {
  return {
    title: song.name?.trim() || 'Imported song',
    artist: song.author?.trim() || undefined,
    key: keyName(song.key),
    capo: positive(song.Capo),
    tempo: positive(song.TempoInt),
    timeSignature: song.timeSig?.trim() || undefined,
    durationSeconds: positive(song.Duration),
    preferredTranspose: normalizeShift(song.KeyShift),
    playbackUrl: playbackUrl(song.Url),
    chordpro,
    warnings,
    detectedSource: detectedSource ?? 'Songbook Pro',
  };
}

/** Read the songs and sets out of an already-opened Songbook Pro backup archive. */
export async function readSongbookProBackup(zip: JSZip, archiveName: string): Promise<SongbookProBackup> {
  const dataEntry = zip.file(SONGBOOK_PRO_DATA_FILE);
  if (!dataEntry) throw new Error('This is not a Songbook Pro backup.');
  const data = parseSongbookProDataFile(await dataEntry.async('string'));

  const result: SongbookProBackup = { songs: [], setlists: [], errors: [] };

  for (const song of data.songs) {
    if (typeof song !== 'object' || song === null || isDeleted(song.Deleted) || typeof song.Id !== 'number') continue;
    const title = song.name?.trim() || 'Imported song';
    const label = `${archiveName} › ${title}`;

    if (song.type === SONG_TYPE_PDF) {
      const pdfName = song.content?.trim() ?? '';
      const pdfEntry = pdfName ? zip.file(`pdf/${pdfName}`) : null;
      if (!pdfEntry) {
        result.errors.push({ name: label, message: 'The PDF for this song is missing from the backup.' });
        continue;
      }
      const blob = await pdfEntry.async('blob');
      const file = new File([blob], `${title}.pdf`, { type: 'application/pdf' });
      result.songs.push({ sourceId: song.Id, draft: songDraft(song, '', []), attachments: [file] });
      continue;
    }

    if (song.type !== undefined && song.type !== SONG_TYPE_CHORDPRO) {
      result.errors.push({ name: label, message: 'This Songbook Pro song type is not supported.' });
      continue;
    }

    const content = (song.content ?? '').replace(/\r\n?/g, '\n');
    if (!content.trim()) {
      result.errors.push({ name: label, message: 'This song is empty.' });
      continue;
    }
    const parsed = parsePastedSong(content);
    result.songs.push({
      sourceId: song.Id,
      draft: songDraft(song, parsed.chordpro, parsed.warnings),
      attachments: [],
    });
  }

  const importedIds = new Set(result.songs.map((song) => song.sourceId));
  for (const set of data.sets) {
    if (typeof set !== 'object' || set === null || isDeleted(set.details?.Deleted)) continue;
    const name = set.details?.name?.trim();
    if (!name) continue;

    const songs = (Array.isArray(set.contents) ? set.contents : [])
      .filter((item) => (
        !isDeleted(item.Deleted)
        && (item.ItemType ?? SET_ITEM_TYPE_SONG) === SET_ITEM_TYPE_SONG
        && typeof item.SongId === 'number'
        && importedIds.has(item.SongId)
      ))
      .sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0))
      .map((item) => {
        const note = [shiftNote(item.keyOfset), item.NotesText?.trim()].filter(Boolean).join(' — ');
        return { sourceId: item.SongId as number, note: note || undefined };
      });

    result.setlists.push({ name, songs });
  }

  return result;
}
