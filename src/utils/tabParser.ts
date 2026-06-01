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

export interface TimeSignatureInfo {
  beatsPerBar: number;
  beatUnit: number;
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

/** Parse a time signature like "4/4" or "6/8". Falls back to 4/4. */
export function parseTimeSignature(timeSignature?: string): TimeSignatureInfo {
  if (!timeSignature) return { beatsPerBar: 4, beatUnit: 4 };
  const match = timeSignature.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (!match) return { beatsPerBar: 4, beatUnit: 4 };

  const beatsPerBar = parseInt(match[1], 10);
  const beatUnit = parseInt(match[2], 10);
  if (beatsPerBar <= 0) return { beatsPerBar: 4, beatUnit: 4 };

  // Keep denominator in a useful practical range for bar guides.
  if (![1, 2, 4, 8, 16].includes(beatUnit)) return { beatsPerBar: 4, beatUnit: 4 };
  return { beatsPerBar, beatUnit };
}

/**
 * Build a character-level beat guide line aligned to tab columns.
 * Columns are treated as 16th-note resolution.
 *
 * @param length           Total character length of the guide string.
 * @param timeSignature    Optional "N/N" time signature string.
 * @param stepCharPositions  Optional array mapping step index → character position.
 *   When provided, beat markers are placed at the actual character positions of each
 *   step rather than assuming every step is 1 character wide. This is necessary when
 *   two-digit frets (≥ 10) make some steps 2 characters wide.
 */
export function buildBeatGuide(length: number, timeSignature?: string, stepCharPositions?: number[]): string {
  if (length <= 0) return '';
  const { beatsPerBar, beatUnit } = parseTimeSignature(timeSignature);
  const columnsPerBeat = Math.max(1, Math.round(16 / beatUnit));
  const columnsPerBar = Math.max(1, beatsPerBar * columnsPerBeat);

  const chars = new Array<string>(length).fill('-');

  const placeMarker = (stepIdx: number, charPos: number) => {
    if (charPos >= length) return;
    if (stepIdx % columnsPerBar === 0) {
      chars[charPos] = '|';
    } else if (stepIdx % columnsPerBeat === 0) {
      const beatIdx = Math.floor((stepIdx % columnsPerBar) / columnsPerBeat) + 1;
      chars[charPos] = String(beatIdx % 10);
    }
  };

  if (stepCharPositions && stepCharPositions.length > 0) {
    stepCharPositions.forEach((charPos, stepIdx) => placeMarker(stepIdx, charPos));
  } else {
    for (let col = 0; col < length; col++) {
      placeMarker(col, col);
    }
  }

  return chars.join('');
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
