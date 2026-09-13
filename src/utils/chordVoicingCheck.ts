import { GUITAR_CHORDS } from '../data/guitarChords';
import { UKULELE_CHORDS } from '../data/ukuleleChords';
import { normalizeChordForLookup } from './chordLookup';

/** Open-string pitch classes, low-to-high string index, matching the fret arrays in
 * `src/data/{guitar,ukulele}Chords.ts` (standard tuning: guitar EADGBE, ukulele GCEA). */
const GUITAR_OPEN_PITCH_CLASSES = [4, 9, 2, 7, 11, 4];
const UKULELE_OPEN_PITCH_CLASSES = [7, 0, 4, 9];

function pitchClassSet(openPitchClasses: number[], frets: number[]): Set<number> {
  const set = new Set<number>();
  frets.forEach((fret, i) => {
    if (fret < 0) return;
    const open = openPitchClasses[i];
    if (open === undefined) return;
    set.add(((open + fret) % 12 + 12) % 12);
  });
  return set;
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export interface VoicingCheckResult {
  /** false only when the edited voicing was checkable and its notes don't match the name. */
  matches: boolean;
  /** An existing chord name (from the same built-in table) whose known shape produces the
   * exact same notes as the edited frets, if one was found — offered as a rename suggestion. */
  suggestedName?: string;
}

/**
 * Checks an edited voicing against the built-in chord diagram tables (the only place this
 * app already encodes "what notes make up this chord"), rather than a separate music-theory
 * model. If the edited frets no longer produce the same notes as the chord's known shape,
 * this looks for another entry in the same table whose known shape matches the edited notes
 * exactly, to suggest as the chord's real name.
 */
export function checkVoicingAgainstChordName(
  instrument: 'guitar' | 'ukulele',
  chordName: string,
  frets: number[],
): VoicingCheckResult {
  const table = instrument === 'guitar' ? GUITAR_CHORDS : UKULELE_CHORDS;
  const openPitchClasses = instrument === 'guitar' ? GUITAR_OPEN_PITCH_CLASSES : UKULELE_OPEN_PITCH_CLASSES;

  const normalized = normalizeChordForLookup(chordName);
  const knownFrets = table[normalized];
  if (!knownFrets) return { matches: true }; // not a shape we can verify against — don't flag it

  const expected = pitchClassSet(openPitchClasses, knownFrets);
  const actual = pitchClassSet(openPitchClasses, frets);
  if (setsEqual(expected, actual)) return { matches: true };

  const suggestedName = Object.entries(table).find(
    ([name, otherFrets]) => name !== normalized && setsEqual(pitchClassSet(openPitchClasses, otherFrets), actual),
  )?.[0];

  return { matches: false, suggestedName };
}
