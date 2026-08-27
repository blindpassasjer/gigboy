import { describe, expect, it } from 'vitest';
import { parsePastedSong } from './chordFormatParser';

describe('parsePastedSong', () => {
  it('parses Ultimate Guitar chord and tab markup', () => {
    const parsed = parsePastedSong(`Wonderwall
by Oasis

[Verse 1]
[ch]Em7[/ch]Today is gonna be the day that they're gonna throw it back to [ch]G[/ch]you
[tab]e|--3--|
B|--3--|
G|--0--|
D|--0--|
A|--2--|
E|--3--|[/tab]`);

    expect(parsed.title).toBe('Wonderwall');
    expect(parsed.artist).toBe('Oasis');
    expect(parsed.detectedSource).toBe('Ultimate Guitar');
    expect(parsed.chordpro).toContain('{start_of_verse: Verse 1}');
    expect(parsed.chordpro).toContain('[Em7]Today is gonna be the day');
    expect(parsed.chordpro).toContain('{start_of_tab}');
  });

  it('parses Chordify-style chord rows with bar separators and metadata labels', () => {
    const parsed = parsePastedSong(`Wonderwall
Artist: Oasis
Key: F#m
Capo: 2

Verse 1
| Em7 | G | Dsus4 | A7sus4 |
Today is gonna be the day that they're gonna throw it back to you`);

    expect(parsed.title).toBe('Wonderwall');
    expect(parsed.artist).toBe('Oasis');
    expect(parsed.key).toBe('F#m');
    expect(parsed.capo).toBe(2);
    expect(parsed.chordpro).toContain('{key: F#m}');
    expect(parsed.chordpro).toContain('{capo: 2}');
    expect(parsed.chordpro).toContain('{start_of_verse: Verse 1}');
  });

  it('parses Songsterr-style pasted tabs into ChordPro tab blocks', () => {
    const parsed = parsePastedSong(`Nothing Else Matters
Metallica
Intro
e|-------0-------|
B|-----0---0-----|
G|---0-------0---|
D|---------------|
A|---------------|
E|-0-------------|`);

    expect(parsed.title).toBe('Nothing Else Matters');
    expect(parsed.artist).toBe('Metallica');
    expect(parsed.chordpro).toContain('{comment: Intro}');
    expect(parsed.chordpro).toContain('{start_of_tab}');
    expect(parsed.chordpro).toContain('e|-------0-------|');
  });

  it('does not swallow the e string when a chord annotation sits directly above the tab', () => {
    const parsed = parsePastedSong(`Mi Unicornio Azul
Silvio Rodriguez

   C                   Em
e|----------------------------------------|
B|-1---1-------------1-0---0------------0-|
G|-0---0-----------0---0---0-----------0--|
D|---2---2---2-2/3-------2---2---2-2/3----|
A|-3---3---3------------------------------|
E|---------------------0---0---0----------|`);

    expect(parsed.chordpro).toContain('{start_of_tab}');
    // All 6 strings must be inside the tab block
    expect(parsed.chordpro).toContain('e|--');
    expect(parsed.chordpro).toContain('E|--');
    // The e string must not be merged into a chord-lyric line
    const tabBlockMatch = parsed.chordpro.match(/\{start_of_tab\}([\s\S]*?)\{end_of_tab\}/);
    expect(tabBlockMatch).not.toBeNull();
    const tabBlock = tabBlockMatch![1];
    expect(tabBlock).toContain('e|');
    expect(tabBlock).toContain('E|');
  });

  it('parses GuitarTuna-style key and capo metadata', () => {
    const parsed = parsePastedSong(`Let Her Go
Passenger
Key Bm
Capo 7

[Chorus]
Bm G D A
Only know you've been high when you're feeling low`);

    expect(parsed.key).toBe('Bm');
    expect(parsed.capo).toBe(7);
    expect(parsed.chordpro).toContain('{key: Bm}');
    expect(parsed.chordpro).toContain('{capo: 7}');
    expect(parsed.chordpro).toContain('{start_of_chorus: Chorus}');
  });

  it('parses CCLI SongSelect-style metadata and slash repeats', () => {
    const parsed = parsePastedSong(`Good Good Father
Artist: Chris Tomlin, Pat Barrett
CCLI Song # 7036612
Key: Ab
Tempo: 85

Verse 1
Ab / / / Db / / /
I've heard a thousand stories of what they think You're like`);

    expect(parsed.artist).toBe('Chris Tomlin, Pat Barrett');
    expect(parsed.key).toBe('Ab');
    expect(parsed.tempo).toBe(85);
    expect(parsed.chordpro).toContain('{tempo: 85}');
    expect(parsed.chordpro).toContain('[Ab]');
    expect(parsed.chordpro).toContain('[Db]');
  });

  it('parses LaCuerda-style spanish metadata and inline chords', () => {
    const parsed = parsePastedSong(`La Bamba
Tradicional
Tono: C
Capo en 2do traste

Verso:
(C)Para bailar la (F)bamba`);

    expect(parsed.key).toBe('C');
    expect(parsed.capo).toBe(2);
    expect(parsed.chordpro).toContain('{key: C}');
    expect(parsed.chordpro).toContain('{capo: 2}');
    expect(parsed.chordpro).toContain('{start_of_verse: Verso}');
    expect(parsed.chordpro).toContain('[C]Para bailar la [F]bamba');
  });

  it('parses an OnSong-style file: header metadata, Flow line, and colon section labels', () => {
    const parsed = parsePastedSong(`Amazing Grace
John Newton
Key: G
Tempo: 70
Capo: 0
Flow: Verse 1, Chorus, Verse 2

Verse 1:
[G]Amazing [C]grace how [G]sweet the sound

Chorus:
That [D]saved a [G]wretch like me`);

    expect(parsed.title).toBe('Amazing Grace');
    expect(parsed.artist).toBe('John Newton');
    expect(parsed.key).toBe('G');
    expect(parsed.tempo).toBe(70);
    expect(parsed.detectedSource).toBe('OnSong');
    expect(parsed.chordpro).toContain('{start_of_verse: Verse 1}');
    expect(parsed.chordpro).toContain('{start_of_chorus: Chorus}');
    expect(parsed.chordpro).toContain('[G]Amazing [C]grace');
    expect(parsed.chordpro).not.toContain('Flow:');
  });

  it('parses Cifra Club-style portuguese metadata and section labels', () => {
    const parsed = parsePastedSong(`Tempo Perdido
Legião Urbana
Tom: D
Capotraste na 2a casa

Primeira Parte
D A Bm G
Todos os dias quando acordo`);

    expect(parsed.key).toBe('D');
    expect(parsed.capo).toBe(2);
    expect(parsed.chordpro).toContain('{key: D}');
    expect(parsed.chordpro).toContain('{capo: 2}');
    expect(parsed.chordpro).toContain('{start_of_verse: Primeira Parte}');
  });
});