/**
 * Utilities for parsing guitar tablature in ChordPro {start_of_tab}...{end_of_tab} blocks.
 * Supports standard 6-string guitar in standard E-A-D-G-B-e tuning.
 */

/** Standard tuning MIDI base notes, top-to-bottom (high-e first as written in tabs). */
const STRING_MIDI_BASE = [64, 59, 55, 50, 45, 40]; // e B G D A E

export interface TabNoteEvent {
  /**
   * Step index (0-based iteration count through the tab).
   * Each step represents one 16th-note slot regardless of how many
   * characters the step occupies (1 for single-digit frets, 2 for frets ≥ 10).
   * Used to compute the time offset: stepIndex × stepSeconds.
   */
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
 * Strip the string label prefix and all bar-separator | characters from a tab line.
 * Handles formats like "e|", "B |", "G:", "e", etc.
 * Bar separators (| within or at the end of the content) are removed so they
 * don't introduce phantom timing steps during MIDI parsing.
 */
export function stripStringLabel(line: string): string {
  return line.replace(/^[eEbBgGdDaA]\s*[|:]\s*/, '').replace(/\|/g, '');
}

/**
 * Parse an array of raw tab lines (the content between {start_of_tab} and {end_of_tab})
 * into a sequence of note events with column-based timing.
 *
 * Notes at the same column index play simultaneously.
 *
 * Multi-section tabs (groups of up to 6 string lines separated by blank lines within
 * the block) are parsed sequentially — each section's events are offset by the step
 * count of all preceding sections so they play in order.
 */
export function parseTabLines(tabLines: string[]): TabNoteEvent[] {
  // Split into sections at blank lines; each section holds up to 6 string lines.
  const sections: string[][] = [];
  let current: string[] = [];

  for (const rawLine of tabLines) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) {
      if (current.length > 0) {
        sections.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) sections.push(current);

  if (sections.length === 0) return [];

  const allEvents: TabNoteEvent[] = [];
  let stepOffset = 0;

  for (const section of sections) {
    const sectionLines = section.slice(0, 6);
    if (sectionLines.length === 0) continue;

    // stripStringLabel removes the string label and all | bar-separator characters
    const contents = sectionLines.map(stripStringLabel);
    const maxLen = Math.max(...contents.map(s => s.length));
    if (maxLen === 0) continue;

    const padded = contents.map(s => s.padEnd(maxLen, '-'));
    let col = 0;
    let stepIndex = 0;

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
        // stepIndex (iteration count) keeps timing correct across two-digit frets.
        allEvents.push({ columnIndex: stepIndex + stepOffset, notes });
      }

      col += advance;
      stepIndex++;
    }

    stepOffset += stepIndex;
  }

  return allEvents;
}

/**
 * Transpose the fret numbers in tab lines by the given number of semitones.
 * Non-numeric characters (dashes, bars, string labels) are preserved unchanged.
 * Fret values are clamped at 0 to avoid negative fret numbers.
 */
export function transposeTabLines(tabLines: string[], semitones: number): string[] {
  if (semitones === 0) return tabLines;
  return tabLines.map(line =>
    line.replace(/\d+/g, (match) => String(Math.max(0, parseInt(match, 10) + semitones))),
  );
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
