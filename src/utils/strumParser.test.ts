import { describe, it, expect } from 'vitest';
import {
  parseStrumBar,
  serializeStrumBar,
  extractStrumBlocks,
  replaceNthStrumBlock,
  slotLabels,
  strumNotes,
  guitarVoicing,
  uniqueChords,
} from './strumParser';
import { parseChordPro } from './chordParser';

describe('parseStrumBar', () => {
  it('parses downs, ups and rests', () => {
    const bar = parseStrumBar('D . D U . U D U');
    expect(bar.map((s) => s.stroke)).toEqual(['D', null, 'D', 'U', null, 'U', 'D', 'U']);
  });

  it('is case-insensitive and tolerates compact input and bar lines', () => {
    expect(parseStrumBar('| d-duudu |').map((s) => s.stroke)).toEqual(['D', null, 'D', 'U', 'U', 'D', 'U']);
  });

  it('parses accents and muted strokes', () => {
    const [accent, muted, mutedAccent, bareX] = parseStrumBar('D+ Ux Dx+ x');
    expect(accent).toEqual({ stroke: 'D', accent: true, muted: false });
    expect(muted).toEqual({ stroke: 'U', accent: false, muted: true });
    expect(mutedAccent).toEqual({ stroke: 'D', accent: true, muted: true });
    expect(bareX).toEqual({ stroke: 'D', accent: false, muted: true });
  });

  it('round-trips through serializeStrumBar', () => {
    const text = 'D . D+ U . Ux Dx+ U';
    expect(serializeStrumBar(parseStrumBar(text))).toBe(text);
  });
});

describe('extractStrumBlocks', () => {
  const song = [
    '{start_of_strum: Verse}',
    'D . D U . U D U',
    'D . D U',
    '{end_of_strum}',
    '[C]La la',
    '{start_of_strum}',
    'D U D U',
    '{end_of_strum}',
  ].join('\n');

  it('finds blocks with labels and one bar per line', () => {
    const blocks = extractStrumBlocks(song);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].label).toBe('Verse');
    expect(blocks[0].bars.map((b) => b.length)).toEqual([8, 4]);
    expect(blocks[1].label).toBeUndefined();
  });

  it('replaces only the requested block', () => {
    const next = replaceNthStrumBlock(song, 1, { label: 'Chorus', bars: [parseStrumBar('D D D D')] });
    expect(next).toContain('{start_of_strum: Verse}\nD . D U . U D U');
    expect(next).toContain('{start_of_strum: Chorus}\nD D D D\n{end_of_strum}');
    expect(extractStrumBlocks(next)).toHaveLength(2);
  });
});

describe('parseChordPro integration', () => {
  it('collapses a strum block into a strum line, including inside sections', () => {
    const lines = parseChordPro('{start_of_verse}\n{start_of_strum: Feel}\nD U D U\n{end_of_strum}\n[C]Hi\n{end_of_verse}');
    const section = lines[0];
    expect(section.type).toBe('section');
    const strum = section.sectionLines?.[0];
    expect(strum?.type).toBe('strum');
    expect(strum?.strumLabel).toBe('Feel');
    expect(strum?.strumLines).toEqual(['D U D U']);
    expect(section.sectionLines?.[1].type).toBe('chord-lyric');
  });

  it('does not swallow the song when {end_of_strum} is missing', () => {
    const lines = parseChordPro('{start_of_strum}\nD U D U\n[C]Lyrics here');
    expect(lines[0].type).toBe('strum');
    expect(lines.some((l) => l.type === 'chord-lyric')).toBe(true);
  });
});

describe('slotLabels', () => {
  it('counts eighths, sixteenths and quarters', () => {
    expect(slotLabels(8, 4)).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    expect(slotLabels(4, 4)).toEqual(['1', '2', '3', '4']);
    expect(slotLabels(16, 4).slice(0, 4)).toEqual(['1', 'e', '&', 'a']);
    expect(slotLabels(6, 3)).toEqual(['1', '&', '2', '&', '3', '&']);
  });

  it('leaves irregular grids unlabeled', () => {
    expect(slotLabels(7, 4)).toEqual(Array(7).fill(''));
  });
});

describe('strumNotes', () => {
  const c = guitarVoicing('C')!; // x32010

  it('plays down-strokes low → high over played strings', () => {
    expect(strumNotes(c, { stroke: 'D', accent: false, muted: false })).toEqual([48, 52, 55, 60, 64]);
  });

  it('plays up-strokes high → low on the top four strings', () => {
    expect(strumNotes(c, { stroke: 'U', accent: false, muted: false })).toEqual([64, 60, 55, 52]);
  });

  it('applies transposition', () => {
    expect(strumNotes(c, { stroke: 'D', accent: false, muted: false }, 2)[0]).toBe(50);
  });
});

describe('chord helpers', () => {
  it('resolves aliases and finds nothing for unknown chords', () => {
    expect(guitarVoicing('Am')).toBeTruthy();
    expect(guitarVoicing('Qzz')).toBeNull();
  });

  it('lists distinct real chords, skipping bracketed words', () => {
    expect(uniqueChords('[Am]a [G]b [Am]c [Bridge]d')).toEqual(['Am', 'G']);
  });
});
