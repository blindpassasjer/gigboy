const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Diatonic triad qualities by scale degree (I..VII).
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_QUALITIES = ['', 'm', 'm', '', '', 'm', 'dim'];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const MINOR_QUALITIES = ['m', 'dim', '', 'm', 'm', '', ''];

/**
 * Diatonic triads for a song key like "G", "F#", "Am", "Bbm".
 * Returns them in scale-degree order (I..VII), root position only.
 * Used to surface the handful of chords most likely to appear in a song
 * written in this key, ahead of the full chord dictionary.
 */
export function diatonicChords(key: string): string[] {
  const trimmed = key.trim();
  const match = trimmed.match(/^([A-Ga-g])([#b]?)(m(?!aj)|min)?/);
  if (!match) return [];
  const [, letter, accidental, minorMarker] = match;
  const isMinor = !!minorMarker;
  const noteName = letter.toUpperCase() + accidental;
  const scale = accidental === 'b' ? FLAT_NOTES : SHARP_NOTES;
  const rootIdx = scale.indexOf(noteName);
  if (rootIdx === -1) return [];

  const steps = isMinor ? MINOR_STEPS : MAJOR_STEPS;
  const qualities = isMinor ? MINOR_QUALITIES : MAJOR_QUALITIES;
  return steps.map((step, i) => `${scale[(rootIdx + step) % 12]}${qualities[i]}`);
}
