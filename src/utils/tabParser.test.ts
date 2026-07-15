import { describe, it, expect } from 'vitest';
import { stripStringLabel, parseTabLines, extractTabBlocks, fretToMidi, transposeTabLines } from './tabParser';

describe('stripStringLabel', () => {
  it('removes leading string label and pipe', () => {
    expect(stripStringLabel('e|--0--')).toBe('--0--');
    expect(stripStringLabel('B|--1--')).toBe('--1--');
    expect(stripStringLabel('E|--0--')).toBe('--0--');
  });

  it('removes all internal and trailing bar separators', () => {
    expect(stripStringLabel('e|--0--|--2--|')).toBe('--0----2--');
    expect(stripStringLabel('e|---0---|---2---|')).toBe('---0------2---');
  });

  it('handles colon separator format', () => {
    expect(stripStringLabel('e:--0--')).toBe('--0--');
  });

  it('handles label with space before separator', () => {
    expect(stripStringLabel('B |--1--')).toBe('--1--');
  });

  it('returns line unchanged when no label is present', () => {
    expect(stripStringLabel('--0--2--')).toBe('--0--2--');
  });
});

describe('parseTabLines', () => {
  it('parses basic single-string fret positions', () => {
    const events = parseTabLines([
      'e|--0--2--|',
      'B|--------|',
      'G|--------|',
      'D|--------|',
      'A|--------|',
      'E|--------|',
    ]);
    // e string: fret 0 at step 2, fret 2 at step 5
    expect(events.some(e => e.notes.includes(fretToMidi(0, 0)) && e.columnIndex === 2)).toBe(true);
    expect(events.some(e => e.notes.includes(fretToMidi(0, 2)) && e.columnIndex === 5)).toBe(true);
  });

  it('parses two-digit frets correctly', () => {
    const events = parseTabLines([
      'e|--12--|',
      'B|------|',
      'G|------|',
      'D|------|',
      'A|------|',
      'E|------|',
    ]);
    expect(events.some(e => e.notes.includes(fretToMidi(0, 12)))).toBe(true);
    // After a two-digit fret the step index should only advance by 1
    const twelveFretEvent = events.find(e => e.notes.includes(fretToMidi(0, 12)));
    expect(twelveFretEvent?.columnIndex).toBe(2);
  });

  it('ignores bar-separator | in content when computing step timing', () => {
    // Without | the note positions should be the same as with |
    const withSep = parseTabLines([
      'e|--0--|--2--|',
      'B|-----------|',
      'G|-----------|',
      'D|-----------|',
      'A|-----------|',
      'E|-----------|',
    ]);
    const withoutSep = parseTabLines([
      'e|--0----2--|',
      'B|----------|',
      'G|----------|',
      'D|----------|',
      'A|----------|',
      'E|----------|',
    ]);
    expect(withSep.map(e => e.columnIndex)).toEqual(withoutSep.map(e => e.columnIndex));
    expect(withSep.map(e => e.notes)).toEqual(withoutSep.map(e => e.notes));
  });

  it('parses simultaneous notes on multiple strings at the same step', () => {
    const events = parseTabLines([
      'e|-0-|',
      'B|-1-|',
      'G|----|',
      'D|----|',
      'A|----|',
      'E|----|',
    ]);
    const chord = events.find(e => e.columnIndex === 1);
    expect(chord).toBeDefined();
    expect(chord!.notes).toContain(fretToMidi(0, 0));
    expect(chord!.notes).toContain(fretToMidi(1, 1));
  });

  it('handles multi-section tabs separated by empty lines', () => {
    const section1 = [
      'e|--0--|',
      'B|-----|',
      'G|-----|',
      'D|-----|',
      'A|-----|',
      'E|-----|',
    ];
    const section2 = [
      'e|--5--|',
      'B|-----|',
      'G|-----|',
      'D|-----|',
      'A|-----|',
      'E|-----|',
    ];
    const events = parseTabLines([...section1, '', ...section2]);

    // Section 1: fret 0 on e at step 2
    expect(events.some(e => e.notes.includes(fretToMidi(0, 0)) && e.columnIndex === 2)).toBe(true);

    // Section 2: fret 5 on e — section 1 has 5 steps so offset is 5, note at step 2+5=7
    expect(events.some(e => e.notes.includes(fretToMidi(0, 5)) && e.columnIndex === 7)).toBe(true);
  });

  it('returns empty array for empty input', () => {
    expect(parseTabLines([])).toEqual([]);
    expect(parseTabLines(['', '  ', ''])).toEqual([]);
  });
});

describe('transposeTabLines', () => {
  it('returns lines unchanged when semitones is 0', () => {
    const lines = ['e|--0--2--|', 'B|--------|'];
    expect(transposeTabLines(lines, 0)).toBe(lines);
  });

  it('shifts fret numbers up by semitones', () => {
    expect(transposeTabLines(['e|--0--2--|'], 2)).toEqual(['e|--2--4--|']);
  });

  it('shifts fret numbers down by semitones', () => {
    expect(transposeTabLines(['e|--5--7--|'], -3)).toEqual(['e|--2--4--|']);
  });

  it('clamps transposed frets at 0', () => {
    expect(transposeTabLines(['e|--0--2--|'], -3)).toEqual(['e|--0--0--|']);
  });

  it('handles two-digit frets', () => {
    expect(transposeTabLines(['e|--12--|'], 2)).toEqual(['e|--14--|']);
  });

  it('preserves string labels and dashes', () => {
    const lines = ['e|--0--|', 'B|--1--|', 'G|-----|'];
    expect(transposeTabLines(lines, 2)).toEqual(['e|--2--|', 'B|--3--|', 'G|-----|']);
  });
});

describe('extractTabBlocks', () => {
  it('extracts a single tab block', () => {
    const chordpro = '{start_of_tab}\ne|--0--|\n{end_of_tab}';
    const blocks = extractTabBlocks(chordpro);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual(['e|--0--|']);
  });

  it('extracts multiple tab blocks', () => {
    const chordpro = [
      '{start_of_tab}',
      'e|--0--|',
      '{end_of_tab}',
      '{start_of_tab}',
      'e|--2--|',
      '{end_of_tab}',
    ].join('\n');
    const blocks = extractTabBlocks(chordpro);
    expect(blocks).toHaveLength(2);
  });

  it('handles {sot} and {eot} abbreviations', () => {
    const chordpro = '{sot}\ne|--0--|\n{eot}';
    expect(extractTabBlocks(chordpro)).toHaveLength(1);
  });

  it('preserves blank lines inside the block for multi-section detection', () => {
    const chordpro = [
      '{start_of_tab}',
      'e|--0--|',
      '',
      'e|--5--|',
      '{end_of_tab}',
    ].join('\n');
    const blocks = extractTabBlocks(chordpro);
    expect(blocks[0]).toContain('');
  });
});
