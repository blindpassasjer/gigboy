/**
 * Utilities for parsing guitar tablature in ChordPro {start_of_tab}...{end_of_tab} blocks.
 * Supports standard 6-string guitar in standard E-A-D-G-B-e tuning.
 */

/** Standard tuning MIDI base notes, top-to-bottom (high-e first as written in tabs). */
const STRING_MIDI_BASE = [64, 59, 55, 50, 45, 40]; // e B G D A E

export interface TabNoteEvent {
  /** Raw column index in the tab string — used to preserve relative timing. */
  columnIndex: number;
  /** MIDI note numbers (one per string that has a note at this column). */
  notes: number[];
}

/**
 * Convert a string index + fret number to a MIDI note.
 * stringIndex 0 = high-e (MIDI 64), 5 = low-E (MIDI 40).
 */
export function fretToMidi(stringIndex: number, fret: number): number {
  if (stringIndex < 0 || stringIndex >= STRING_MIDI_BASE.length) return -1;
  return STRING_MIDI_BASE[stringIndex] + fret;
}

/**
 * Strip the string label prefix from a tab line.
 * Handles formats like "e|", "B |", "G:", "e", etc.
 */
function stripStringLabel(line: string): string {
  // Remove leading string label (single letter optionally followed by |, :, or space)
  return line.replace(/^[eEbBgGdDaA]\s*[|:]\s*/, '');
}

/**
 * Parse an array of raw tab lines (the content between {start_of_tab} and {end_of_tab})
 * into a sequence of note events with column-based timing.
 *
 * Notes at the same column index play simultaneously.
 */
export function parseTabLines(tabLines: string[]): TabNoteEvent[] {
  const nonEmpty = tabLines
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0)
    .slice(0, 6); // max 6 strings

  if (nonEmpty.length === 0) return [];

  // Strip string labels and normalize to raw fret content
  const contents = nonEmpty.map(stripStringLabel);
  const maxLen = Math.max(...contents.map(s => s.length));
  const padded = contents.map(s => s.padEnd(maxLen, '-'));

  const events: TabNoteEvent[] = [];
  let col = 0;

  while (col < maxLen) {
    const notes: number[] = [];
    let advance = 1;

    for (let si = 0; si < padded.length; si++) {
      const ch = padded[si][col];
      if (/\d/.test(ch)) {
        // Check for two-digit fret number (e.g. 12, 15, 22)
        let fretStr = ch;
        if (col + 1 < maxLen && /\d/.test(padded[si][col + 1])) {
          fretStr += padded[si][col + 1];
          advance = Math.max(advance, 2);
        }
        const fret = parseInt(fretStr, 10);
        if (si < STRING_MIDI_BASE.length) {
          notes.push(fretToMidi(si, fret));
        }
      }
    }

    if (notes.length > 0) {
      events.push({ columnIndex: col, notes });
    }

    col += advance;
  }

  return events;
}

/**
 * Extract all {start_of_tab}...{end_of_tab} blocks from a ChordPro string.
 * Returns an array of blocks, each block being an array of raw lines.
 */
export function extractTabBlocks(chordpro: string): string[][] {
  const blocks: string[][] = [];
  const lines = chordpro.split('\n');
  let inTab = false;
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (trimmed === '{start_of_tab}' || trimmed === '{sot}') {
      inTab = true;
      current = [];
    } else if (trimmed === '{end_of_tab}' || trimmed === '{eot}') {
      if (inTab && current.length > 0) {
        blocks.push(current);
      }
      inTab = false;
      current = [];
    } else if (inTab) {
      current.push(line);
    }
  }

  return blocks;
}
