/**
 * Utility functions for parsing and converting different chord formats
 * Supports ChordPro, plain text with chords, and other common formats
 */

export interface ParsedSong {
  title?: string;
  artist?: string;
  key?: string;
  capo?: number;
  tempo?: number;
  chordpro: string;
}

export interface ParsedImportResult extends ParsedSong {
  warnings: string[];
}

const CHORD_TOKEN_RE = /^[A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?$/;
const CHORD_SCAN_RE = /[A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?/g;

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n?/g, '\n');
}

function tokenizeWithIndexes(line: string): Array<{ chord: string; index: number; end: number }> {
  const tokens: Array<{ chord: string; index: number; end: number }> = [];
  const matches = line.matchAll(CHORD_SCAN_RE);
  for (const match of matches) {
    const raw = match[0];
    const index = match.index ?? 0;
    const end = index + raw.length;
    if (CHORD_TOKEN_RE.test(raw)) {
      tokens.push({ chord: normalizeChord(raw), index, end });
    }
  }
  return tokens;
}

function lineLooksLikeChordRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const valid = tokens.filter((token) => CHORD_TOKEN_RE.test(token)).length;
  return valid > 0 && valid / tokens.length >= 0.8;
}

function mergeChordRowWithLyrics(chordRow: string, lyricRow: string): string {
  const tokens = tokenizeWithIndexes(chordRow).sort((a, b) => a.index - b.index);
  if (tokens.length === 0) return lyricRow;

  if (!lyricRow.trim()) {
    return tokens.map((token) => `[${token.chord}]`).join(' ');
  }

  let out = '';
  let cursor = 0;
  for (const token of tokens) {
    const insertionPoint = Math.max(0, Math.min(token.index, lyricRow.length));
    if (insertionPoint > cursor) {
      out += lyricRow.slice(cursor, insertionPoint);
      cursor = insertionPoint;
    }
    out += `[${token.chord}]`;
  }
  out += lyricRow.slice(cursor);
  return out.trimEnd();
}

function parseLeadingMetadata(lines: string[]): {
  title?: string;
  artist?: string;
  startIndex: number;
} {
  let startIndex = 0;
  let title: string | undefined;
  let artist: string | undefined;

  while (startIndex < lines.length && !lines[startIndex].trim()) {
    startIndex += 1;
  }

  if (startIndex >= lines.length) {
    return { startIndex };
  }

  const first = lines[startIndex].trim();
  const second = startIndex + 1 < lines.length ? lines[startIndex + 1].trim() : '';

  const firstHasChord = lineLooksLikeChordRow(first) || /\[[A-G]/.test(first);
  if (!firstHasChord && first.length <= 90 && !first.startsWith('{')) {
    title = first;
    startIndex += 1;
  }

  const byMatch = second.match(/^by\s+(.+)$/i);
  if (byMatch) {
    artist = byMatch[1].trim();
    startIndex += 1;
  } else if (
    second &&
    second.length <= 80 &&
    !lineLooksLikeChordRow(second) &&
    !/\[[A-G]/.test(second) &&
    !second.startsWith('{')
  ) {
    artist = second;
    startIndex += 1;
  }

  return { title, artist, startIndex };
}

/**
 * Parse pasted lyrics/chords and convert into editable ChordPro.
 * Supports:
 * - Existing ChordPro
 * - Inline [Chord]lyrics
 * - Chord-row above lyric-row formats
 */
export function parsePastedSong(text: string): ParsedImportResult {
  const input = normalizeLineEndings(text).trim();
  if (!input) {
    return { chordpro: '', warnings: [] };
  }

  const warnings: string[] = [];
  const hasChordProMarkers = /\{\s*[a-z_]+\s*:|\[[A-G]/i.test(input);

  const lines = input.split('\n');
  const meta = parseLeadingMetadata(lines);

  let content = lines.slice(meta.startIndex);
  if (hasChordProMarkers) {
    const parsed = parseChordPro(input);
    return {
      ...parsed,
      title: parsed.title ?? meta.title,
      artist: parsed.artist ?? meta.artist,
      warnings,
    };
  }

  const out: string[] = [];
  for (let i = 0; i < content.length; i += 1) {
    const current = content[i] ?? '';
    const next = i + 1 < content.length ? content[i + 1] ?? '' : '';

    if (lineLooksLikeChordRow(current)) {
      const merged = mergeChordRowWithLyrics(current, next);
      if (merged.trim()) {
        out.push(merged);
      }
      if (next.trim()) {
        i += 1;
      }
      continue;
    }

    // Convert simple inline (G)Lyrics to [G]Lyrics.
    const convertedInline = current.replace(/\(([A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?)\)/g, '[$1]');
    out.push(convertedInline);
  }

  const chordproBody = out.join('\n').trim();
  if (!/\[[A-G]/.test(chordproBody)) {
    warnings.push('No clear chord tokens were detected. You can edit the parsed result before importing.');
  }

  const withDirectives = [
    meta.title ? `{title: ${meta.title}}` : '',
    meta.artist ? `{artist: ${meta.artist}}` : '',
    [meta.title, meta.artist].some(Boolean) ? '' : '',
    chordproBody,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    title: meta.title,
    artist: meta.artist,
    chordpro: withDirectives,
    warnings,
  };
}

/**
 * Parse ChordPro format text
 * Handles directives like {title: ...}, {artist: ...}, {key: ...}, {capo: ...}
 */
export function parseChordPro(text: string): ParsedSong {
  const lines = text.split('\n');
  let title = '';
  let artist = '';
  let key = '';
  let capo = 0;
  let tempo = 0;
  const content: string[] = [];

  for (const line of lines) {
    // Check for directives
    const directiveMatch = line.match(/^\{\s*(\w+)\s*:\s*([^}]+)\s*\}$/);
    if (directiveMatch) {
      const [, directive, value] = directiveMatch;
      const val = value.trim();
      switch (directive.toLowerCase()) {
        case 'title':
          title = val;
          break;
        case 'artist':
          artist = val;
          break;
        case 'key':
          key = val;
          break;
        case 'capo':
          capo = parseInt(val) || 0;
          break;
        case 'tempo':
          tempo = parseInt(val) || 0;
          break;
      }
    }
    content.push(line);
  }

  return {
    title: title || undefined,
    artist: artist || undefined,
    key: key || undefined,
    capo: capo || undefined,
    tempo: tempo || undefined,
    chordpro: content.join('\n').trim(),
  };
}

/**
 * Convert plain text lyrics with chords to ChordPro format
 * Handles formats like: [G]Lyrics [C]more [D]lyrics
 * Or: G    C    D
 *     Lyrics here
 */
export function plainTxtToChordPro(text: string): string {
  return parsePastedSong(text).chordpro;
}

/**
 * Convert HTML chord display format to ChordPro
 * Handles common patterns from websites like Ultimate Guitar
 */
export function htmlToChordPro(html: string): string {
  let text = html;

  // Remove common HTML tags but preserve structure
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<span[^>]*class="chord"[^>]*>([^<]+)<\/span>/gi, '[$1]');
  text = text.replace(/<[^>]+>/g, '');

  // Clean up multiple newlines
  text = text.replace(/\n\s*\n/g, '\n\n');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  return text.trim();
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const map: { [key: string]: string } = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&sharp;': '#',
    '&flat;': 'b',
  };

  return text.replace(/&[^;]+;/g, (entity) => map[entity] || entity);
}

/**
 * Extract metadata from song text (title, artist, key, etc.)
 * Handles ChordPro directives and common text patterns
 */
export function extractMetadata(text: string): Partial<ParsedSong> {
  const parsed = parseChordPro(text);
  return {
    title: parsed.title,
    artist: parsed.artist,
    key: parsed.key,
    capo: parsed.capo,
    tempo: parsed.tempo,
  };
}

/**
 * Normalize chord names to consistent format
 */
export function normalizeChord(chord: string): string {
  // Convert common variations
  const normalized = chord
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/flat/gi, 'b')
    .replace(/sharp/gi, '#');

  // Only uppercase the root note; preserve case of quality suffix (m, maj, dim, etc.)
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Validate ChordPro format
 */
export function isValidChordPro(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  // Must have some content
  if (text.trim().length === 0) return false;
  
  // Should have chord markers or directives
  const hasChords = /\[[A-G]/.test(text);
  const hasDirectives = /\{[a-z_]+:/.test(text);
  const hasLyrics = /[a-z]/i.test(text);
  
  return hasLyrics && (hasChords || hasDirectives);
}
