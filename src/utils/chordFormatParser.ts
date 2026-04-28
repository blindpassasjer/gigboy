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
// Matches a properly formed inline chord marker [G], [Am7], [C#m/G], etc. (not section labels)
const INLINE_CHORD_MARKER_RE = /\[[A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?\]/;

// Section label → ChordPro section type mapping (verse / chorus / bridge / null=generic)
const SECTION_TYPE_MAP: Array<[RegExp, string | null]> = [
  [/^(verse|verso|copla|strophe|stanza|couplet)(\s+\d+)?$/i, 'verse'],
  [/^(chorus|refrain|refrán|estribillo)(\s+\d+)?$/i, 'chorus'],
  [/^pre.?(chorus|estribillo)(\s+\d+)?$/i, 'chorus'],
  [/^post.?(chorus|estribillo)(\s+\d+)?$/i, 'chorus'],
  [/^(bridge|puente|middle[- ]?8?)(\s+\d+)?$/i, 'bridge'],
  [/^(hook)(\s+\d+)?$/i, 'chorus'],
  [/^(intro|outro|solo|interlude|interludio|coda|tag|instrumental|breakdown)(\s+\d+)?$/i, null],
];

function getSectionType(label: string): string | null | undefined {
  for (const [re, type] of SECTION_TYPE_MAP) {
    if (re.test(label.trim())) return type;
  }
  return undefined; // unknown — not a recognised section
}

// Returns the section label string if the line is a section marker, otherwise null.
// Handles: [Verse 1], [Chorus], [Estribillo], Estribillo:, Verso:
function parseSectionMarker(line: string): string | null {
  const trimmed = line.trim();

  // Square-bracket format: [Verse 1], [Chorus], [Bridge], [Estribillo]
  // Must have 2+ chars inside brackets and must NOT be a valid chord token.
  const bracketMatch = trimmed.match(/^\[([^\]]{2,50})\]$/);
  if (bracketMatch) {
    const label = bracketMatch[1].trim();
    if (!CHORD_TOKEN_RE.test(label) && getSectionType(label) !== undefined) return label;
  }

  // Colon-suffix format: Estribillo:, Verso:, Bridge: (only for recognised keywords)
  const colonMatch = trimmed.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 \-]{1,30}):$/);
  if (colonMatch) {
    const label = colonMatch[1].trim();
    if (getSectionType(label) !== undefined) return label;
  }

  return null;
}

// Returns true if the line is a section marker (used to guard title/artist detection)
function looksLikeSectionMarker(line: string): boolean {
  return parseSectionMarker(line) !== null;
}

// Convert Ultimate Guitar [tab]...[/tab] blocks to ChordPro {start_of_tab}...{end_of_tab}.
// Handles both block form ([tab] on its own line) and inline form ([tab]content[/tab]).
function convertUGTabBlocks(text: string): string {
  // First handle the inline/single-line case: [tab]content[/tab] on one line
  text = text.replace(/\[tab\]([\s\S]*?)\[\/tab\]/gi, (_, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return '';
    return `{start_of_tab}\n${trimmed}\n{end_of_tab}`;
  });
  return text;
}

// Pre-process Ultimate Guitar and cuerdas.net specific markup before parsing.
function preprocessSongText(text: string): string {
  // UG inline chord tags: [ch]G[/ch] → [G]
  text = text.replace(/\[ch\]([^\[]*?)\[\/ch\]/gi, (_, chord) => `[${chord.trim()}]`);
  // UG tab wrappers: [tab] ... [/tab] → ChordPro {start_of_tab} ... {end_of_tab}
  text = convertUGTabBlocks(text);
  return text;
}

// Strip repeat annotations (x2, (x2), ×2) that UG appends to chord lines.
function stripRepeatAnnotations(line: string): string {
  return line.replace(/\(?\s*[x×]\s*\d+\s*\)?/gi, '').trim();
}

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
  // Strip repeat markers (x2, ×2) before checking — UG appends these to chord lines.
  const trimmed = stripRepeatAnnotations(line).trim();
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

  const firstHasChord = lineLooksLikeChordRow(first) || INLINE_CHORD_MARKER_RE.test(first);
  const firstIsSectionMarker = looksLikeSectionMarker(first);
  if (!firstHasChord && !firstIsSectionMarker && first.length <= 90 && !first.startsWith('{')) {
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
    !INLINE_CHORD_MARKER_RE.test(second) &&
    !looksLikeSectionMarker(second) &&
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
 * - Ultimate Guitar: [ch]Chord[/ch] tags, [tab] blocks, [Verse 1] / [Chorus] section labels
 * - cuerdas.net: [Estribillo] / Estribillo: section labels, (Chord)lyrics inline format
 */
export function parsePastedSong(text: string): ParsedImportResult {
  const normalized = normalizeLineEndings(text).trim();
  if (!normalized) {
    return { chordpro: '', warnings: [] };
  }

  // Step 1: strip site-specific markup (UG [ch]/[tab] tags, etc.)
  const input = preprocessSongText(normalized);

  const warnings: string[] = [];

  // Detect existing ChordPro: directive syntax OR properly formed inline chord markers.
  // Use INLINE_CHORD_MARKER_RE instead of /\[[A-G]/i to avoid false matches on
  // section labels like [Chorus] or [Bridge] that start with a letter in A–G.
  const hasChordProMarkers =
    /\{\s*[a-z_]+\s*:/.test(input) || INLINE_CHORD_MARKER_RE.test(input);

  const lines = input.split('\n');
  const meta = parseLeadingMetadata(lines);
  const content = lines.slice(meta.startIndex);

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
  let openSection: string | null = null; // currently open verse/chorus/bridge type

  for (let i = 0; i < content.length; i += 1) {
    const current = content[i] ?? '';
    const next = i + 1 < content.length ? content[i + 1] ?? '' : '';

    // Section marker: [Verse 1], [Chorus], Estribillo:, etc.
    const sectionLabel = parseSectionMarker(current);
    if (sectionLabel !== null) {
      if (openSection) {
        out.push(`{end_of_${openSection}}`);
        out.push('');
        openSection = null;
      }
      const sectionType = getSectionType(sectionLabel);
      if (sectionType) {
        openSection = sectionType;
        out.push(`{start_of_${sectionType}: ${sectionLabel}}`);
      } else {
        // Intro, Outro, Solo, etc. — use a comment label
        out.push(`{comment: ${sectionLabel}}`);
      }
      continue;
    }

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

    // Convert inline (G)Lyrics → [G]Lyrics (cuerdas.net and similar sites).
    const convertedInline = current.replace(
      /\(([A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?)\)/g,
      '[$1]',
    );
    out.push(convertedInline);
  }

  if (openSection) {
    out.push(`{end_of_${openSection}}`);
  }

  const chordproBody = out.join('\n').trim();
  if (!INLINE_CHORD_MARKER_RE.test(chordproBody)) {
    warnings.push('No clear chord tokens were detected. You can edit the parsed result before importing.');
  }

  const withDirectives = [
    meta.title ? `{title: ${meta.title}}` : '',
    meta.artist ? `{artist: ${meta.artist}}` : '',
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
