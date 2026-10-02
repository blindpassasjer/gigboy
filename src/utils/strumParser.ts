/**
 * Strumming patterns, stored in ChordPro text as a {start_of_strum}...{end_of_strum} block.
 * Each non-empty line inside the block is one bar; each token is one slot on that bar's grid.
 *
 *   {start_of_strum: Verse feel}
 *   D . D U . U D U
 *   {end_of_strum}
 *
 * Tokens (case-insensitive, spaces optional): D down, U up, "." or "-" rest, x muted,
 * a trailing + accents the stroke (D+, U+). Dx / Ux are muted down/up strokes. The
 * vocabulary mirrors ChordPro's own strum syntax (dn/up, +, x) so patterns stay
 * convertible to it.
 */
import { GUITAR_CHORDS } from '../data/guitarChords';
import { normalizeChordBassForLookup, normalizeChordForLookup } from './chordLookup';

export interface StrumSlot {
  /** null = rest. Muted strokes keep a direction so the hand motion stays visible. */
  stroke: 'D' | 'U' | null;
  accent: boolean;
  muted: boolean;
}

export type StrumBar = StrumSlot[];

export interface StrumBlock {
  label?: string;
  bars: StrumBar[];
}

const TOKEN_RE = /[DUdu]x?\+?|x\+?|[.-]/g;

export const REST_SLOT: StrumSlot = { stroke: null, accent: false, muted: false };

export function parseStrumBar(line: string): StrumBar {
  const slots: StrumBar = [];
  for (const token of line.match(TOKEN_RE) ?? []) {
    const accent = token.endsWith('+');
    const body = accent ? token.slice(0, -1) : token;
    if (body === '.' || body === '-') {
      slots.push({ ...REST_SLOT });
      continue;
    }
    const muted = body.toLowerCase().endsWith('x');
    const letter = body[0].toLowerCase();
    // A bare "x" has no direction of its own — treat it as a muted down-stroke.
    const stroke = letter === 'u' ? 'U' : 'D';
    slots.push({ stroke, accent, muted });
  }
  return slots;
}

export function parseStrumLines(lines: string[], label?: string): StrumBlock {
  const bars = lines.map(parseStrumBar).filter((bar) => bar.length > 0);
  return { label, bars };
}

export function serializeStrumBar(bar: StrumBar): string {
  return bar
    .map((slot) => {
      if (!slot.stroke) return '.';
      const base = slot.muted ? `${slot.stroke}x` : slot.stroke;
      return slot.accent ? `${base}+` : base;
    })
    .join(' ');
}

export function serializeStrumBlock(block: StrumBlock): string {
  const label = block.label?.trim();
  const open = label ? `{start_of_strum: ${label}}` : '{start_of_strum}';
  return [open, ...block.bars.map(serializeStrumBar), '{end_of_strum}'].join('\n');
}

const STRUM_BLOCK_RE = /\{start_of_strum(?::([^}]*))?\}([\s\S]*?)\{end_of_strum\}/gi;

/** All strum blocks in a song's text, in document order. */
export function extractStrumBlocks(chordpro: string): StrumBlock[] {
  return Array.from(chordpro.matchAll(STRUM_BLOCK_RE), (m) =>
    parseStrumLines(m[2].split('\n'), m[1]?.trim() || undefined),
  );
}

/** Replaces the nth strum block (document order) with new content. */
export function replaceNthStrumBlock(source: string, index: number, block: StrumBlock): string {
  let count = 0;
  return source.replace(STRUM_BLOCK_RE, (match) =>
    count++ === index ? serializeStrumBlock(block) : match,
  );
}

/**
 * Count labels for one bar, from how many slots fall on each beat:
 * 1 → "1", 2 → "1 &", 4 → "1 e & a", 3 → "1 trip let". Other grids are left unlabeled
 * except for the beat numbers.
 */
export function slotLabels(slotCount: number, beatsPerBar: number): string[] {
  const perBeat = beatsPerBar > 0 ? slotCount / beatsPerBar : 0;
  const subs: Record<number, string[]> = {
    1: [''],
    2: ['', '&'],
    3: ['', 'trip', 'let'],
    4: ['', 'e', '&', 'a'],
  };
  const pattern = subs[perBeat];
  return Array.from({ length: slotCount }, (_, i) => {
    if (!pattern) return '';
    const beat = Math.floor(i / perBeat) + 1;
    const sub = pattern[i % perBeat];
    return sub === '' ? String(beat) : sub;
  });
}

/** Standard-tuning MIDI notes for strings low E → high e. */
const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64];

/** Open/fretted guitar voicing for a chord name, or null if we have no diagram for it. */
export function guitarVoicing(chord: string): number[] | null {
  const base = normalizeChordForLookup(chord);
  const bass = normalizeChordBassForLookup(chord);
  return (bass && GUITAR_CHORDS[`${base}/${bass}`]) || GUITAR_CHORDS[base] || null;
}

/**
 * MIDI notes a stroke sounds, in the order the pick passes over the strings: down-strokes
 * run low → high across all played strings, up-strokes high → low and only catch the top
 * four, as a real up-strum does. Muted slots sound all played strings.
 */
export function strumNotes(frets: number[], slot: StrumSlot, transpose = 0): number[] {
  const played: number[] = [];
  frets.forEach((fret, i) => {
    if (fret >= 0 && i < OPEN_STRING_MIDI.length) played.push(OPEN_STRING_MIDI[i] + fret + transpose);
  });
  if (slot.stroke === 'U' && !slot.muted) return played.slice(-4).reverse();
  if (slot.stroke === 'U') return played.reverse();
  return played;
}

/**
 * Distinct chords used in a ChordPro text, in order of first appearance. Only chords we
 * have a guitar voicing for are kept, which also drops bracketed text like "[Bridge]".
 */
export function uniqueChords(chordpro: string): string[] {
  const seen = new Set<string>();
  for (const m of chordpro.matchAll(/\[([A-G][^\]\s]*)\]/g)) {
    if (guitarVoicing(m[1])) seen.add(m[1]);
  }
  return Array.from(seen);
}
