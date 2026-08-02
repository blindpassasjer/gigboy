import type { ParsedLine, ChordSegment } from '../types';

const DIRECTIVE_RE = /^\{([^:}]+)(?::([^}]*))?\}$/;

// Valueless directives (no `:value`) are only recognized as directives when the name
// is one of these — anything else wrapped in braces (e.g. ad-lib lyrics like "{la la la}")
// is treated as a regular lyric line instead of being silently dropped.
const KNOWN_VALUELESS_DIRECTIVES = new Set([
  'title', 't', 'subtitle', 'st', 'artist',
  'chorus', 'verse', 'intro', 'bridge', 'pre_chorus', 'interlude', 'solo', 'outro',
]);

// A real chord token: root note, optional quality/extension, optional /bass — e.g. "A",
// "Bm", "A/F#", "Cmaj7". Bracketed text that doesn't look like this (e.g. a performance
// note like "[repeat from the top]") is left as literal lyric text instead of being
// swallowed as a chord.
const CHORD_TOKEN_RE = /^[A-G][#b]?[a-zA-Z0-9()+-]{0,10}(?:\/[A-G][#b]?)?$/;

function isChordLike(text: string): boolean {
  return CHORD_TOKEN_RE.test(text);
}

/** Finds the next bracket pair whose content looks like a real chord, skipping over
 * any bracketed text along the way that doesn't (treated as literal lyric text). */
function findNextChordBracket(str: string): { start: number; end: number; chord: string } | null {
  let idx = 0;
  while (idx < str.length) {
    const bracketIdx = str.indexOf('[', idx);
    if (bracketIdx === -1) return null;
    const closeIdx = str.indexOf(']', bracketIdx);
    if (closeIdx === -1) return null;
    const content = str.slice(bracketIdx + 1, closeIdx);
    if (isChordLike(content)) return { start: bracketIdx, end: closeIdx, chord: content };
    idx = closeIdx + 1;
  }
  return null;
}

/** Parse a single ChordPro line into a structured representation. */
function parseLine(raw: string): ParsedLine {
  const trimmed = raw.trim();

  if (trimmed === '') return { type: 'empty', raw };

  // ChordPro directive: {title: My Song} or {chorus}
  const dirMatch = trimmed.match(DIRECTIVE_RE);
  if (dirMatch) {
    const directive = dirMatch[1].trim().toLowerCase();
    const directiveValue = dirMatch[2]?.trim();
    if (directiveValue || KNOWN_VALUELESS_DIRECTIVES.has(directive)) {
      return { type: 'directive', directive, directiveValue, raw };
    }
    // Not a recognized directive — fall through and treat as a lyric line.
  }

  // Chord-lyric line — parse [Chord]lyric pairs.
  // Each chord marks the start of the lyric that follows it, so we track a
  // pendingChord and emit a segment when we collect the lyric that belongs to it.
  const segments: ChordSegment[] = [];
  let remaining = trimmed;
  let pendingChord = '';

  while (remaining.length > 0) {
    const next = findNextChordBracket(remaining);
    if (!next) {
      segments.push({ chord: pendingChord, lyric: remaining });
      pendingChord = '';
      break;
    }

    const lyricBefore = remaining.slice(0, next.start);
    if (lyricBefore || pendingChord) {
      segments.push({ chord: pendingChord, lyric: lyricBefore });
    }
    pendingChord = next.chord;
    remaining = remaining.slice(next.end + 1);
  }

  // Trailing chord with no following lyric
  if (pendingChord) {
    segments.push({ chord: pendingChord, lyric: '' });
  }

  return { type: 'chord-lyric', segments, raw };
}

const SECTION_START_RE = /^\{start_of_(\w+)(?::([^}]*))?\}$/;
const SECTION_END_RE = /^\{end_of_(\w+)(?::[^}]*)?\}$/;

/** Consume a {start_of_tab}...{end_of_tab} block starting at i+1. Returns the tab lines and new i. */
function consumeTabBlock(rawLines: string[], startI: number): { tabLines: string[]; nextI: number } {
  const tabLines: string[] = [];
  let i = startI + 1;
  while (i < rawLines.length) {
    const inner = rawLines[i].trim().toLowerCase();
    if (inner === '{end_of_tab}' || inner === '{eot}') { i++; break; }
    // Missing {end_of_tab}: bail out at the next directive-looking line instead of
    // swallowing the rest of the song as tab data.
    if (/^\{[^}]*\}$/.test(inner) && inner !== '{start_of_tab}' && inner !== '{sot}') break;
    tabLines.push(rawLines[i]);
    i++;
  }
  return { tabLines, nextI: i };
}

/** Parse full ChordPro text into an array of lines.
 * Tab blocks are collapsed into 'tab' lines.
 * Section blocks (start_of_* / end_of_*) are grouped into 'section' lines with nested content. */
export function parseChordPro(text: string): ParsedLine[] {
  const rawLines = text.split('\n');

  function parseRange(startI: number, endI: number): ParsedLine[] {
    const result: ParsedLine[] = [];
    let i = startI;

    while (i < endI) {
      const trimmed = rawLines[i].trim().toLowerCase();

      // Tab block
      if (trimmed === '{start_of_tab}' || trimmed === '{sot}') {
        const { tabLines, nextI } = consumeTabBlock(rawLines, i);
        result.push({ type: 'tab', tabLines, raw: '' });
        i = nextI;
        continue;
      }

      // Section block — but not tab (handled above)
      const sectionMatch = trimmed.match(SECTION_START_RE);
      if (sectionMatch && sectionMatch[1] !== 'tab') {
        const sectionType = sectionMatch[1];
        // Re-match against the untouched line to preserve the label's original casing.
        const sectionLabel = rawLines[i].trim().match(SECTION_START_RE)?.[2]?.trim() || undefined;
        const endDirective = `{end_of_${sectionType}}`;
        // Find the matching end
        let j = i + 1;
        while (j < endI && !rawLines[j].trim().toLowerCase().startsWith(endDirective.slice(0, -1))) j++;
        const sectionLines = parseRange(i + 1, j);
        result.push({ type: 'section', sectionType, sectionLabel, sectionLines, raw: '' });
        i = j < endI ? j + 1 : j; // skip the end directive if found
        continue;
      }

      // End-of-section directives that escaped grouping — drop them
      if (trimmed.match(SECTION_END_RE)) { i++; continue; }

      result.push(parseLine(rawLines[i]));
      i++;
    }

    return result;
  }

  return parseRange(0, rawLines.length);
}

/** Check if any segment in a line has a chord. */
export function lineHasChords(line: ParsedLine): boolean {
  return !!line.segments?.some((s) => s.chord !== '');
}

export type ChordNotation = 'anglo' | 'spanish';

const SPANISH_NOTE: Record<string, string> = {
  C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si',
};

export function convertChordNotation(chord: string, notation: ChordNotation): string {
  if (notation === 'anglo') return chord;
  const match = chord.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
  if (!match) return chord;
  const [, root, quality, bass] = match;
  const spRoot = (SPANISH_NOTE[root[0]] ?? root[0]) + root.slice(1);
  const spBass = bass ? '/' + (SPANISH_NOTE[bass[0]] ?? bass[0]) + bass.slice(1) : '';
  return `${spRoot}${quality}${spBass}`;
}

/** Transpose a chord up or down by semitones. */
const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function transposeNote(note: string, semitones: number): string {
  const scale = note.includes('b') ? FLAT_NOTES : SHARP_NOTES;
  const idx = scale.indexOf(note);
  if (idx === -1) return note;
  return scale[((idx + semitones) % 12 + 12) % 12];
}

export function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord;
  // Match root note (e.g. "C", "D#", "Bb") and the rest (e.g. "m7", "maj", "/G")
  const match = chord.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
  if (!match) return chord;
  const [, root, quality, bass] = match;
  const newRoot = transposeNote(root, semitones);
  const newBass = bass ? '/' + transposeNote(bass, semitones) : '';
  return `${newRoot}${quality}${newBass}`;
}
