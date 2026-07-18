import { GUITAR_CHORDS } from '../data/guitarChords';
import { UKULELE_CHORDS } from '../data/ukuleleChords';

// Union of every chord name we have a diagram for, used to power typeahead
// suggestions in the ChordPro editor toolbar.
export const ALL_CHORD_NAMES: string[] = Array.from(
  new Set([...Object.keys(GUITAR_CHORDS), ...Object.keys(UKULELE_CHORDS)]),
).sort((a, b) => a.localeCompare(b));

// Ranks a startsWith match: exact match first, then natural-note continuations
// (Am, A7, Asus4...), then accidental continuations (A#, A#m...) — typing "A"
// should surface the common A-chords before the sharps/flats.
function rank(name: string, q: string): number {
  const lower = name.toLowerCase();
  if (lower === q) return 0;
  const next = lower[q.length];
  return next === '#' || next === 'b' ? 2 : 1;
}

export function suggestChordNames(query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = ALL_CHORD_NAMES
    .filter((name) => name.toLowerCase().startsWith(q))
    .sort((a, b) => rank(a, q) - rank(b, q));
  const contains = ALL_CHORD_NAMES.filter(
    (name) => !name.toLowerCase().startsWith(q) && name.toLowerCase().includes(q),
  );
  return [...starts, ...contains].slice(0, limit);
}
