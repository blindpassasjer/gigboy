/**
 * Normalizes a chord name to the canonical key used by the built-in diagram tables
 * (`src/data/{guitar,ukulele}Chords.ts`) and by band chord-voicing overrides. Shared by
 * `ChordDiagram` and `useBandChordVoicings` so overrides key off the exact same string.
 */

const ROOT_LOOKUP_ALIAS: Record<string, string> = {
  C: 'C', 'C#': 'C#', Db: 'C#',
  D: 'D', 'D#': 'D#', Eb: 'D#',
  E: 'E',
  F: 'F', 'F#': 'F#', Gb: 'F#',
  G: 'G', 'G#': 'G#', Ab: 'G#',
  A: 'A', 'A#': 'A#', Bb: 'A#',
  B: 'B',
};

function normalizeQualityForLookup(suffix: string): string {
  const compact = suffix.replace(/\s+/g, '');
  const lower = compact.toLowerCase();

  if (!compact) return '';

  // Treat common major aliases as plain major triads when no 7th is present.
  if (compact === 'M' || lower === 'maj') return '';

  if (compact === 'M7' || compact === 'Δ7' || lower === 'maj7' || lower === 'ma7') return 'maj7';
  if (lower === 'm7' || lower === 'min7' || lower === 'mi7' || compact === '-7') return 'm7';
  if (lower === 'm' || lower === 'min' || lower === 'mi' || compact === '-') return 'm';
  if (lower === 'sus') return 'sus4';

  // Already canonical in our current lookup set.
  if (lower === '7' || lower === 'sus2' || lower === 'sus4' || lower === 'maj7' || lower === 'm7' || lower === 'm') {
    return lower;
  }

  return compact;
}

export function normalizeChordForLookup(chord: string): string {
  const base = chord.split('/')[0].trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const match = base.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return base;

  const root = `${match[1].toUpperCase()}${match[2]}`;
  const normalizedRoot = ROOT_LOOKUP_ALIAS[root] ?? root;
  const normalizedQuality = normalizeQualityForLookup(match[3] ?? '');

  return `${normalizedRoot}${normalizedQuality}`;
}
