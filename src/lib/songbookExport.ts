import JSZip from 'jszip';
import type { Band, Setlist, Song, SongList } from '../types';

export interface SongbookExportInput {
  songs: Song[];
  songLists: SongList[];
  setlists: Setlist[];
  bands: Band[];
  bandSongsByBandId: Record<string, Song[]>;
  bandSongListsByBandId: Record<string, SongList[]>;
  bandSetlistsByBandId: Record<string, Setlist[]>;
}

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled';
}

function songToChordPro(song: Song): string {
  const directives: string[] = [];
  directives.push(`{title: ${song.title}}`);
  if (song.artist) directives.push(`{artist: ${song.artist}}`);
  if (song.key) directives.push(`{key: ${song.key}}`);
  if (typeof song.capo === 'number') directives.push(`{capo: ${song.capo}}`);
  if (typeof song.tempo === 'number') directives.push(`{tempo: ${song.tempo}}`);
  if (song.timeSignature) directives.push(`{time: ${song.timeSignature}}`);

  return `${directives.join('\n')}\n\n${song.chordpro}`;
}

function songListToManifest(list: SongList, songs: Song[]): string {
  const songById = new Map(songs.map((song) => [song.id, song]));
  const lines = list.songIds.map((songId, index) => {
    const song = songById.get(songId);
    return `${index + 1}. ${song ? `${song.title}${song.artist ? ` — ${song.artist}` : ''}` : `(missing song ${songId})`}`;
  });
  return [`Songlist: ${list.name}`, '', ...lines].join('\n');
}

function setlistToManifest(setlist: Setlist, songs: Song[]): string {
  const songById = new Map(songs.map((song) => [song.id, song]));
  const lines = setlist.songIds.map((songId, index) => {
    const song = songById.get(songId);
    const note = setlist.songNotes?.[songId];
    const label = song ? `${song.title}${song.artist ? ` — ${song.artist}` : ''}` : `(missing song ${songId})`;
    return `${index + 1}. ${label}${note ? `\n   note: ${note}` : ''}`;
  });
  return [`Setlist: ${setlist.name}`, '', ...lines].join('\n');
}

function addSongsFolder(zip: JSZip, songs: Song[]) {
  if (songs.length === 0) return;
  const folder = zip.folder('songs');
  const usedNames = new Set<string>();
  songs.forEach((song) => {
    let fileName = `${sanitizeFileName(song.title)}.cho`;
    let counter = 2;
    while (usedNames.has(fileName)) {
      fileName = `${sanitizeFileName(song.title)}-${counter}.cho`;
      counter += 1;
    }
    usedNames.add(fileName);
    folder?.file(fileName, songToChordPro(song));
  });
}

function addSongListsFolder(zip: JSZip, songLists: SongList[], songs: Song[]) {
  if (songLists.length === 0) return;
  const folder = zip.folder('songlists');
  songLists.forEach((list) => {
    folder?.file(`${sanitizeFileName(list.name)}.txt`, songListToManifest(list, songs));
  });
}

function addSetlistsFolder(zip: JSZip, setlists: Setlist[], songs: Song[]) {
  if (setlists.length === 0) return;
  const folder = zip.folder('setlists');
  setlists.forEach((setlist) => {
    folder?.file(`${sanitizeFileName(setlist.name)}.txt`, setlistToManifest(setlist, songs));
  });
}

/**
 * Bundles everything a user owns — personal library plus every band they
 * belong to — into a single ZIP of plain ChordPro/text files, so nothing
 * is locked into gigboy's own storage.
 */
export async function buildSongbookExportZip(input: SongbookExportInput): Promise<Blob> {
  const zip = new JSZip();
  const generatedAt = new Date().toISOString();

  const personal = zip.folder('personal');
  if (personal) {
    addSongsFolder(personal, input.songs);
    addSongListsFolder(personal, input.songLists, input.songs);
    addSetlistsFolder(personal, input.setlists, input.songs);
  }

  input.bands.forEach((band) => {
    const bandSongs = input.bandSongsByBandId[band.id] ?? [];
    const bandSongLists = input.bandSongListsByBandId[band.id] ?? [];
    const bandSetlists = input.bandSetlistsByBandId[band.id] ?? [];
    if (bandSongs.length === 0 && bandSongLists.length === 0 && bandSetlists.length === 0) return;

    const bandFolder = zip.folder(`bands/${sanitizeFileName(band.name)}`);
    if (!bandFolder) return;
    addSongsFolder(bandFolder, bandSongs);
    addSongListsFolder(bandFolder, bandSongLists, bandSongs);
    addSetlistsFolder(bandFolder, bandSetlists, bandSongs);
  });

  zip.file(
    'README.txt',
    [
      'GIGBOY songbook export',
      `Generated: ${generatedAt}`,
      '',
      'Each song is a plain ChordPro (.cho) file — chords in [brackets] above the lyrics they belong to.',
      'Songlists and setlists are exported as plain text order manifests referencing the song titles.',
      'This archive is portable: the .cho files can be opened by any ChordPro-compatible app.',
    ].join('\n')
  );

  return zip.generateAsync({ type: 'blob' });
}

export function triggerSongbookExportDownload(blob: Blob): void {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `gigboy-export-${new Date().toISOString().slice(0, 10)}.zip`;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}
