import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { expandSongImportSelection, parseImportedSongText } from './songImport';

// jsdom's File doesn't implement text()/arrayBuffer(), so build minimal stand-ins that
// satisfy the parts of the File interface songImport actually touches.
function textFile(name: string, content: string, type = 'text/plain'): File {
  return {
    name,
    type,
    text: () => Promise.resolve(content),
  } as unknown as File;
}

function zipFile(name: string, buffer: ArrayBuffer): File {
  return {
    name,
    type: 'application/zip',
    arrayBuffer: () => Promise.resolve(buffer),
  } as unknown as File;
}

describe('parseImportedSongText', () => {
  it('derives a title from the file name when the content has none', () => {
    const draft = parseImportedSongText('songs/Wagon Wheel.cho', '[G]Rock me [D]mama');
    expect(draft.title).toBe('Wagon Wheel');
    expect(draft.chordpro).toContain('[G]Rock me [D]mama');
  });

  it('reads YAML frontmatter', () => {
    const draft = parseImportedSongText('x.chordpro', '---\ntitle: Test Song\nartist: Someone\n---\n[C]hi');
    expect(draft.title).toBe('Test Song');
    expect(draft.artist).toBe('Someone');
    expect(draft.detectedSource).toBe('Frontmatter');
  });
});

describe('expandSongImportSelection', () => {
  it('parses loose song files and collects per-file errors', async () => {
    const result = await expandSongImportSelection([
      textFile('One.cho', '[G]one'),
      textFile('Two.txt', '[C]two'),
      textFile('empty.cho', '   '),
    ]);

    expect(result.items.map((i) => i.draft.title).sort()).toEqual(['One', 'Two']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe('empty.cho');
  });

  it('flattens a .zip archive of song files', async () => {
    const zip = new JSZip();
    zip.file('backup/Song A.cho', '[G]a');
    zip.file('backup/Song B.onsong', 'Song B\nArtist Name\n[C]b');
    zip.file('backup/notes.pdf', 'not a song');
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await expandSongImportSelection([zipFile('my-backup.zip', buffer)]);

    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.draft.title).sort()).toEqual(['Song A', 'Song B']);
    expect(result.items.every((i) => i.name.startsWith('my-backup.zip › '))).toBe(true);
  });

  it('reports a zip with no recognisable song files', async () => {
    const zip = new JSZip();
    zip.file('readme.pdf', 'x');
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await expandSongImportSelection([zipFile('empty.zip', buffer)]);
    expect(result.items).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/no song files/i);
  });
});
