import type { ParsedLine, ChordSegment } from '../types';

const DIRECTIVE_RE = /^\{([^:}]+)(?::([^}]*))?\}$/;

/** Parse a single ChordPro line into a structured representation. */
export function parseLine(raw: string): ParsedLine {
  const trimmed = raw.trim();

  if (trimmed === '') return { type: 'empty', raw };

  // ChordPro directive: {title: My Song} or {chorus}
  const dirMatch = trimmed.match(DIRECTIVE_RE);
  if (dirMatch) {
    return {
      type: 'directive',
      directive: dirMatch[1].trim().toLowerCase(),
      directiveValue: dirMatch[2]?.trim(),
      raw,
    };
  }

  // Comment line
  if (trimmed.startsWith('#')) {
    return { type: 'comment', raw };
  }

  // Chord-lyric line — parse [Chord]lyric pairs
  const segments: ChordSegment[] = [];
  let remaining = trimmed;
  let currentLyric = '';

  while (remaining.length > 0) {
    const bracketIdx = remaining.indexOf('[');
    if (bracketIdx === -1) {
      currentLyric += remaining;
      segments.push({ chord: '', lyric: currentLyric });
      currentLyric = '';
      break;
    }

    if (bracketIdx > 0) {
      currentLyric += remaining.slice(0, bracketIdx);
    }

    const closeIdx = remaining.indexOf(']', bracketIdx);
    if (closeIdx === -1) {
      // Malformed — treat rest as lyric
      currentLyric += remaining.slice(bracketIdx);
      segments.push({ chord: '', lyric: currentLyric });
      break;
    }

    const chord = remaining.slice(bracketIdx + 1, closeIdx);
    segments.push({ chord, lyric: currentLyric });
    currentLyric = '';
    remaining = remaining.slice(closeIdx + 1);
  }

  if (currentLyric) {
    segments.push({ chord: '', lyric: currentLyric });
  }

  return { type: 'chord-lyric', segments, raw };
}

/** Parse full ChordPro text into an array of lines. */
export function parseChordPro(text: string): ParsedLine[] {
  return text.split('\n').map(parseLine);
}

/** Check if any segment in a line has a chord. */
export function lineHasChords(line: ParsedLine): boolean {
  return !!line.segments?.some((s) => s.chord !== '');
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
