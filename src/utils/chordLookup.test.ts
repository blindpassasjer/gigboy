import { describe, expect, it } from 'vitest';
import { normalizeChordForLookup } from './chordLookup';

describe('normalizeChordForLookup', () => {
  it('drops the bass note and normalizes enharmonic roots', () => {
    expect(normalizeChordForLookup('Db')).toBe('C#');
    expect(normalizeChordForLookup('Bb/D')).toBe('A#');
  });

  it('collapses major aliases and canonicalizes minor / maj7', () => {
    expect(normalizeChordForLookup('CM')).toBe('C');
    expect(normalizeChordForLookup('Amin')).toBe('Am');
    expect(normalizeChordForLookup('GMaj7')).toBe('Gmaj7');
  });

  it('is stable for names already canonical', () => {
    expect(normalizeChordForLookup('F#m')).toBe('F#m');
    expect(normalizeChordForLookup('Dsus4')).toBe('Dsus4');
  });
});
