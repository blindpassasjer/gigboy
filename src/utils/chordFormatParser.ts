/**
 * Utility functions for parsing and converting different chord formats
 * Supports ChordPro, plain text with chords, and other common formats
 */

export interface ParsedSong {
  title?: string;
  artist?: string;
  author?: string;
  key?: string;
  capo?: number;
  tempo?: number;
  chordpro: string;
}

export interface ParsedImportResult extends ParsedSong {
  warnings: string[];
  detectedSource?: string;
}

const CHORD_TOKEN_RE = /^[A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?$/;
const CHORD_SCAN_RE = /[A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?/g;
// Matches a properly formed inline chord marker [G], [Am7], [C#m/G], etc. (not section labels)
const INLINE_CHORD_MARKER_RE = /\[[A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?\]/;
const CHORD_ROW_SEPARATOR_RE = /^(?:\||\/)+$/;
const TAB_LINE_RE = /^(?:[A-Ga-gEeBb]|[Dd])\|[-0-9hHpPbBrRsSxX~vV/\\()[\]{}*|:.\s]+$/;
const SOURCE_BOILERPLATE_RE = /^(?:ultimate\s+guitar|chordify|songsterr|songselect|guitartuna|la\s*cuerda|lacuerda(?:\.net)?|cifra\s*club|cifraclub)\b/i;

const SOURCE_MATCHERS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Ultimate Guitar', pattern: /(?:ultimate\s+guitar|\[ch\]|\[tab\])/i },
  { label: 'Chordify', pattern: /(?:^|\n)\|\s*[A-G][^\n]*\|/i },
  { label: 'Songsterr', pattern: /(?:songsterr|songsteer|^(?:e|B|G|D|A|E)\|[-0-9hHpPbBrRsSxX~vV/\\()[\]{}*|:.\s]+)/im },
  { label: 'GuitarTuna', pattern: /(?:guitartuna|\bkey\s+[A-G][#b]?(?:m|maj|min|sus|dim|aug|add)?\d*\b.*\bcapo\s+\d+)/i },
  { label: 'OnSong', pattern: /(?:^|\n)\s*(?:flow|onsong)\s*:/i },
  { label: 'CCLI SongSelect', pattern: /(?:songselect|ccli\s+song\s*#)/i },
  { label: 'LaCuerda', pattern: /(?:la\s*cuerda|lacuerda(?:\.net)?|\btono\s*:|\bestribillo\b)/i },
  { label: 'Cifra Club', pattern: /(?:cifra\s*club|cifraclub|\btom\s*:|capotraste\s+na)/i },
];

function detectLikelySource(text: string): string | undefined {
  for (const matcher of SOURCE_MATCHERS) {
    if (matcher.pattern.test(text)) {
      return matcher.label;
    }
  }
  return undefined;
}

// Section label → ChordPro section type mapping (verse / chorus / bridge / null=generic)
const SECTION_TYPE_MAP: Array<[RegExp, string | null]> = [
  [/^(verse|verso|estrofa|copla|strophe|stanza|couplet|parte|parte\s+\d+|primeira\s+parte|segunda\s+parte)(\s+\d+)?$/i, 'verse'],
  [/^(chorus|coro|refrain|refrán|refr[oã]o|estribillo)(\s+\d+)?$/i, 'chorus'],
  [/^pre[ -.]?(chorus|coro|refr[oã]o|estribillo)(\s+\d+)?$/i, 'chorus'],
  [/^post[ -.]?(chorus|coro|refr[oã]o|estribillo)(\s+\d+)?$/i, 'chorus'],
  [/^(bridge|ponte|puente|middle[- ]?8?)(\s+\d+)?$/i, 'bridge'],
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
// Handles: [Verse 1], [Chorus], [Estribillo], Estribillo:, Verso:, Verse 1
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
  const colonMatch = trimmed.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 -]{1,30}):$/);
  if (colonMatch) {
    const label = colonMatch[1].trim();
    if (getSectionType(label) !== undefined) return label;
  }

  if (getSectionType(trimmed) !== undefined) {
    return trimmed;
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

function normalizeLabeledMetadataLine(line: string): string {
  return line
    .replace(/^(tom|tono)\s*:/i, 'Key:')
    .replace(/^artist\s*:/i, 'Artist:')
    .replace(/^artista\s*:/i, 'Artist:')
    .replace(/^autor\s*:/i, 'Author:')
    .replace(/^tempo\s*:/i, 'Tempo:')
    .replace(/^bpm\s*:/i, 'Tempo:')
    .replace(/^capotraste\s*:/i, 'Capo:')
    .replace(/^capotraste\s+na\s+/i, 'Capo ')
    .replace(/^capo\s+en\s+/i, 'Capo ');
}

// Pre-process common site-specific paste markup before parsing.
function preprocessSongText(text: string): string {
  // UG inline chord tags: [ch]G[/ch] → [G]
  text = text.replace(/\[ch\]([^[]*?)\[\/ch\]/gi, (_, chord) => `[${chord.trim()}]`);
  // UG tab wrappers: [tab] ... [/tab] → ChordPro {start_of_tab} ... {end_of_tab}
  text = convertUGTabBlocks(text);
  // Some sites paste inline metadata in localized labels we can normalize up front.
  text = text
    .split('\n')
    .map((line) => normalizeLabeledMetadataLine(line.trimEnd()))
    .join('\n');
  return text;
}

// Strip repeat annotations (x2, (x2), ×2) that UG appends to chord lines.
function stripRepeatAnnotations(line: string): string {
  return line.replace(/\(?\s*[x×]\s*\d+\s*\)?/gi, '').trim();
}

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n?/g, '\n');
}

// Spanish/Latin solfège chords as written on LaCuerda: DO RE MI FA SOL LA SI, with
// optional #/b, quality, number and a trailing "*" (variant marker). Uppercase only,
// so lowercase lyrics ("la", "si", "mi") are never mistaken for chords.
const SOLFEGE_ROOTS: Record<string, string> = { DO: 'C', RE: 'D', MI: 'E', FA: 'F', SOL: 'G', LA: 'A', SI: 'B' };
const SOLFEGE_ITEM = '(?:SOL|DO|RE|MI|FA|LA|SI)(?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\\d*\\*?';
const SOLFEGE_ITEM_RE = new RegExp(`^(SOL|DO|RE|MI|FA|LA|SI)(#|b)?(m|maj|min|sus|dim|aug|add)?(\\d*)\\*?$`);
// One chord cell: items joined by "·" (quick changes), optionally followed by a
// parenthetical — either an alternate chord "LA(LA7)" or a bass note annotation
// "MIm(VI-0·2·3 V-0)" which we drop.
const SOLFEGE_GROUP_RE = new RegExp(
  `(?<![A-Za-zÀ-ÿ0-9])${SOLFEGE_ITEM}(?:·${SOLFEGE_ITEM})*(?:\\([^)]*\\))?(?![A-Za-zÀ-ÿ])`,
  'g',
);

function solfegeToChord(item: string): string | null {
  const m = item.trim().match(SOLFEGE_ITEM_RE);
  if (!m) return null;
  const [, root, accidental = '', quality = '', digits] = m;
  // Bare "4" (RE4) means suspended fourth.
  const suffix = !quality && digits === '4' ? 'sus4' : `${quality}${digits}`;
  return `${SOLFEGE_ROOTS[root]}${accidental}${suffix}`;
}

function solfegeChordsInGroup(group: string): string[] {
  const parenAt = group.indexOf('(');
  const main = parenAt === -1 ? group : group.slice(0, parenAt);
  const chords = main.split('·').map(solfegeToChord).filter((c): c is string => c !== null);
  if (parenAt !== -1) {
    const alt = group.slice(parenAt + 1, group.lastIndexOf(')'));
    const altChords = alt.split('·').map(solfegeToChord);
    if (altChords.length > 0 && altChords.every((c) => c !== null)) {
      chords.push(...(altChords as string[]));
    }
  }
  return chords;
}

// Returns chord positions if the whole line is a row of solfège chords, else null.
function parseSolfegeRow(line: string): Array<{ chord: string; index: number; end: number }> | null {
  const cleaned = stripRepeatAnnotations(line);
  const tokens: Array<{ chord: string; index: number; end: number }> = [];
  for (const match of cleaned.matchAll(SOLFEGE_GROUP_RE)) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    for (const chord of solfegeChordsInGroup(match[0])) tokens.push({ chord, index, end });
  }
  if (tokens.length === 0) return null;
  const rest = cleaned.replace(SOLFEGE_GROUP_RE, '').replace(/[\s|/]+/g, '');
  return rest === '' ? tokens : null;
}

function tokenizeWithIndexes(line: string): Array<{ chord: string; index: number; end: number }> {
  const solfege = parseSolfegeRow(line);
  if (solfege) return solfege;
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

// "Intro: SOL·RE4·DO9" → { label: 'Intro', row: 'SOL·RE4·DO9' } when the rest is a chord row.
function parseLabeledChordRow(line: string): { label: string; row: string } | null {
  const m = line.trim().match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 -]{1,30}):\s+(.+)$/);
  if (!m || getSectionType(m[1].trim()) === undefined || !lineLooksLikeChordRow(m[2])) return null;
  return { label: m[1].trim(), row: m[2] };
}

function lineLooksLikeChordRow(line: string): boolean {
  if (parseSolfegeRow(line)) return true;
  // Strip repeat markers (x2, ×2) before checking — UG appends these to chord lines.
  const trimmed = stripRepeatAnnotations(line).trim();
  if (!trimmed) return false;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const chordTokens = tokens.filter((token) => CHORD_TOKEN_RE.test(token)).length;
  const separatorTokens = tokens.filter((token) => CHORD_ROW_SEPARATOR_RE.test(token)).length;
  return chordTokens > 0 && (chordTokens + separatorTokens) / tokens.length >= 0.8;
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

function looksLikeTabLine(line: string): boolean {
  return TAB_LINE_RE.test(line.trim());
}

function extractChordValue(input: string): string | undefined {
  const match = input.match(/[A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?/);
  return match?.[0];
}

function extractFirstInteger(input: string): number | undefined {
  const match = input.match(/(\d{1,3})/);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function parseMetadataLine(line: string): Partial<ParsedSong> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const artistMatch = trimmed.match(/^artist\s*:\s*(.+)$/i);
  if (artistMatch) {
    return { artist: artistMatch[1].trim() };
  }

  const authorMatch = trimmed.match(/^(?:author|writer|writers|songwriter|composer)\s*:\s*(.+)$/i);
  if (authorMatch) {
    return { author: authorMatch[1].trim() };
  }

  const keyMatch = trimmed.match(/^(?:key|original\s+key|tonality|tone)\s*:?\s*(.+)$/i);
  if (keyMatch) {
    const key = extractChordValue(keyMatch[1]);
    return key ? { key } : null;
  }

  const capoMatch = trimmed.match(/^(?:capo|capotraste)\b\s*:?\s*(.*)$/i);
  if (capoMatch) {
    const capo = extractFirstInteger(capoMatch[1]);
    return typeof capo === 'number' ? { capo } : null;
  }

  const tempoMatch = trimmed.match(/^(?:tempo|bpm)\s*:?\s*(.+)$/i);
  if (tempoMatch) {
    const tempo = extractFirstInteger(tempoMatch[1]);
    return typeof tempo === 'number' ? { tempo } : null;
  }

  return null;
}

function isMetadataNoise(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return SOURCE_BOILERPLATE_RE.test(trimmed)
    || /^ccli\s+song\s*#/i.test(trimmed)
    || /^copyright\b/i.test(trimmed)
    || /^transpos(e|ition)\b/i.test(trimmed)
    || /^tuning\b/i.test(trimmed)
    // OnSong metadata directives we don't model (Flow = section order, Time = time signature).
    || /^(?:flow|time|duration|number|book|midi|topic|ccli|copyright|restrictions)\s*:/i.test(trimmed);
}

function lineStartsContent(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return trimmed.startsWith('{')
    || looksLikeSectionMarker(trimmed)
    || looksLikeTabLine(trimmed)
    || lineLooksLikeChordRow(trimmed)
    || parseLabeledChordRow(trimmed) !== null
    || INLINE_CHORD_MARKER_RE.test(trimmed);
}

// Pulls labeled metadata (Artist:, Key:, Capo:, ...) out of the lines before the first
// chord/section/tab content. Title and artist are never guessed from plain lines: those
// stay in the body, since guessing from unlabeled text is wrong too often.
function parseLeadingMetadata(lines: string[]): {
  artist?: string;
  author?: string;
  key?: string;
  capo?: number;
  tempo?: number;
  content: string[];
} {
  let artist: string | undefined;
  let author: string | undefined;
  let key: string | undefined;
  let capo: number | undefined;
  let tempo: number | undefined;
  const kept: string[] = [];

  let i = 0;
  for (; i < lines.length; i += 1) {
    const current = lines[i]?.trim() ?? '';
    if (lineStartsContent(current)) break;
    if (!current) {
      kept.push(lines[i]);
      continue;
    }
    if (isMetadataNoise(current)) continue;
    const parsedMetadata = parseMetadataLine(current);
    if (parsedMetadata) {
      artist = parsedMetadata.artist ?? artist;
      author = parsedMetadata.author ?? author;
      key = parsedMetadata.key ?? key;
      capo = parsedMetadata.capo ?? capo;
      tempo = parsedMetadata.tempo ?? tempo;
      continue;
    }
    kept.push(lines[i]);
  }

  return { artist, author, key, capo, tempo, content: [...kept, ...lines.slice(i)] };
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

  const detectedSource = detectLikelySource(normalized);

  // Step 1: strip site-specific markup (UG [ch]/[tab] tags, etc.)
  const input = preprocessSongText(normalized);

  const warnings: string[] = [];

  // Detect existing ChordPro: directive syntax OR properly formed inline chord markers.
  // Use INLINE_CHORD_MARKER_RE instead of /\[[A-G]/i to avoid false matches on
  // section labels like [Chorus] or [Bridge] that start with a letter in A–G.
  const hasChordProMarkers = /\{\s*[a-z_]+\s*:/.test(input);

  const lines = input.split('\n');
  const meta = parseLeadingMetadata(lines);
  const content = meta.content;

  if (hasChordProMarkers) {
    const parsed = parseChordPro(input);
    return {
      ...parsed,
      artist: parsed.artist ?? meta.artist,
      author: parsed.author ?? meta.author,
      key: parsed.key ?? meta.key,
      capo: parsed.capo ?? meta.capo,
      tempo: parsed.tempo ?? meta.tempo,
      warnings,
      detectedSource,
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

    const labeledRow = parseLabeledChordRow(current);
    if (labeledRow) {
      if (openSection) {
        out.push(`{end_of_${openSection}}`);
        out.push('');
        openSection = null;
      }
      out.push(`{comment: ${labeledRow.label}}`);
      out.push(mergeChordRowWithLyrics(labeledRow.row, ''));
      continue;
    }

    if (looksLikeTabLine(current)) {
      const tabBlock: string[] = [];
      while (i < content.length && looksLikeTabLine(content[i] ?? '')) {
        tabBlock.push((content[i] ?? '').trimEnd());
        i += 1;
      }
      i -= 1;
      if (tabBlock.length > 0) {
        out.push('{start_of_tab}');
        out.push(...tabBlock);
        out.push('{end_of_tab}');
      }
      continue;
    }

    if (lineLooksLikeChordRow(current)) {
      if (looksLikeTabLine(next)) {
        // Chord annotation sits directly above a tab string line — output the
        // chords alone and leave the tab line to be picked up as a tab block.
        const chordsOnly = mergeChordRowWithLyrics(current, '');
        if (chordsOnly.trim()) out.push(chordsOnly);
      } else {
        const merged = mergeChordRowWithLyrics(current, next);
        if (merged.trim()) {
          out.push(merged);
        }
        if (next.trim()) {
          i += 1;
        }
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
    meta.artist ? `{artist: ${meta.artist}}` : '',
    meta.author ? `{author: ${meta.author}}` : '',
    meta.key ? `{key: ${meta.key}}` : '',
    typeof meta.capo === 'number' ? `{capo: ${meta.capo}}` : '',
    typeof meta.tempo === 'number' ? `{tempo: ${meta.tempo}}` : '',
    chordproBody,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    artist: meta.artist,
    author: meta.author,
    key: meta.key,
    capo: meta.capo,
    tempo: meta.tempo,
    chordpro: withDirectives,
    warnings,
    detectedSource,
  };
}

/**
 * Parse ChordPro format text
 * Handles directives like {title: ...}, {artist: ...}, {key: ...}, {capo: ...}
 */
function parseChordPro(text: string): ParsedSong {
  const lines = text.split('\n');
  let title = '';
  let artist = '';
  let author = '';
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
        case 'author':
          author = val;
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
    author: author || undefined,
    key: key || undefined,
    capo: capo || undefined,
    tempo: tempo || undefined,
    chordpro: content.join('\n').trim(),
  };
}

/**
 * Normalize chord names to consistent format
 */
function normalizeChord(chord: string): string {
  // Convert common variations
  const normalized = chord
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/flat/gi, 'b')
    .replace(/sharp/gi, '#');

  // Only uppercase the root note; preserve case of quality suffix (m, maj, dim, etc.)
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

