import JSZip from 'jszip';
import type { Band, InputList, PressKit, Setlist, Song, SongList } from '../types';
import type { SongRecording } from './songRecordings';
import { extensionFromImageMimeType, riderAsText, sanitizeFileName } from './pressKitZip';

export interface PressKitImageAsset {
  id: string;
  title: string;
  url: string;
  mimeType: string;
}

export interface SongbookExportInput {
  bands: Band[];
  bandSongsByBandId: Record<string, Song[]>;
  bandSongListsByBandId: Record<string, SongList[]>;
  bandSetlistsByBandId: Record<string, Setlist[]>;
  bandInputListsByBandId: Record<string, InputList[]>;
  bandPressKitsByBandId: Record<string, PressKit[]>;
  bandPressKitImagesByBandId: Record<string, PressKitImageAsset[]>;
  /** Recordings for band songs, keyed by band ID then song ID. */
  bandRecordingsBySongId: Record<string, Record<string, SongRecording[]>>;
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

/** Portable song reference: songs are matched by title+artist on import, since IDs don't carry across accounts/instances. */
function songRef(song: Song, note?: string): { title: string; artist: string | null; note?: string } {
  return note !== undefined
    ? { title: song.title, artist: song.artist ?? null, note }
    : { title: song.title, artist: song.artist ?? null };
}

function songListToJson(list: SongList, songs: Song[], generatedAt: string): string {
  const songById = new Map(songs.map((song) => [song.id, song]));
  const refs = list.songIds
    .map((id) => songById.get(id))
    .filter((song): song is Song => Boolean(song))
    .map((song) => songRef(song));
  return JSON.stringify({
    type: 'gigboy.songlist',
    version: 1,
    exportedAt: generatedAt,
    name: list.name,
    icon: list.icon ?? null,
    songs: refs,
  }, null, 2);
}

function setlistToJson(setlist: Setlist, songs: Song[], generatedAt: string): string {
  const songById = new Map(songs.map((song) => [song.id, song]));
  const refs = setlist.songIds
    .map((id) => songById.get(id))
    .filter((song): song is Song => Boolean(song))
    .map((song) => songRef(song, setlist.songNotes?.[song.id]));
  return JSON.stringify({
    type: 'gigboy.setlist',
    version: 1,
    exportedAt: generatedAt,
    name: setlist.name,
    icon: setlist.icon ?? null,
    songs: refs,
  }, null, 2);
}

function riderToJson(rider: InputList, generatedAt: string): string {
  return JSON.stringify({
    type: 'gigboy.technicalRider',
    version: 1,
    exportedAt: generatedAt,
    name: rider.name,
    icon: rider.icon ?? null,
    hospitalityNotes: rider.hospitalityNotes ?? null,
    logisticsNotes: rider.logisticsNotes ?? null,
    items: rider.items ?? [],
    drawingLayers: rider.drawingLayers ?? [],
  }, null, 2);
}

function pressKitToJson(
  kit: PressKit,
  imagesById: Map<string, PressKitImageAsset>,
  generatedAt: string,
): string {
  const images = kit.imageIds
    .map((id) => imagesById.get(id))
    .filter((img): img is PressKitImageAsset => Boolean(img))
    .map((img) => ({
      title: img.title,
      filename: `${sanitizeFileName(img.title)}.${extensionFromImageMimeType(img.mimeType)}`,
    }));
  return JSON.stringify({
    type: 'gigboy.pressKit',
    version: 1,
    exportedAt: generatedAt,
    name: kit.name,
    icon: kit.icon ?? null,
    richText: kit.richText,
    images,
    videoUrls: kit.videoUrls ?? [],
    selectedVideoUrls: kit.selectedVideoUrls ?? [],
    presaveReleaseName: kit.presaveReleaseName ?? null,
    presaveReleaseDate: kit.presaveReleaseDate ?? null,
    presaveUrls: kit.presaveUrls ?? [],
    selectedPresaveUrls: kit.selectedPresaveUrls ?? [],
  }, null, 2);
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

function addSongListsFolder(zip: JSZip, songLists: SongList[], songs: Song[], generatedAt: string) {
  if (songLists.length === 0) return;
  const folder = zip.folder('songlists');
  songLists.forEach((list) => {
    const baseName = sanitizeFileName(list.name);
    folder?.file(`${baseName}.txt`, songListToManifest(list, songs));
    folder?.file(`${baseName}.json`, songListToJson(list, songs, generatedAt));
  });
}

function addSetlistsFolder(zip: JSZip, setlists: Setlist[], songs: Song[], generatedAt: string) {
  if (setlists.length === 0) return;
  const folder = zip.folder('setlists');
  setlists.forEach((setlist) => {
    const baseName = sanitizeFileName(setlist.name);
    folder?.file(`${baseName}.txt`, setlistToManifest(setlist, songs));
    folder?.file(`${baseName}.json`, setlistToJson(setlist, songs, generatedAt));
  });
}

function addInputListsFolder(zip: JSZip, riders: InputList[], generatedAt: string) {
  if (riders.length === 0) return;
  const folder = zip.folder('technical-riders');
  riders.forEach((rider) => {
    const baseName = sanitizeFileName(rider.name);
    folder?.file(`${baseName}.txt`, riderAsText(rider));
    folder?.file(`${baseName}.json`, riderToJson(rider, generatedAt));
  });
}

async function addPressKitImagesFolder(zip: JSZip, images: PressKitImageAsset[]) {
  if (images.length === 0) return;
  const folder = zip.folder('images');
  const failedDownloads: string[] = [];
  const usedNames = new Set<string>();

  await Promise.all(images.map(async (image) => {
    try {
      const response = await fetch(image.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const extension = extensionFromImageMimeType(image.mimeType);
      let fileName = `${sanitizeFileName(image.title)}.${extension}`;
      let counter = 2;
      while (usedNames.has(fileName)) {
        fileName = `${sanitizeFileName(image.title)}-${counter}.${extension}`;
        counter += 1;
      }
      usedNames.add(fileName);
      folder?.file(fileName, bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      failedDownloads.push(`${image.title}: ${image.url} (${message})`);
    }
  }));

  if (failedDownloads.length > 0) {
    folder?.file('_failed-downloads.txt', failedDownloads.join('\n'));
  }
}

function addPressKitsFolder(
  zip: JSZip,
  kits: PressKit[],
  imagesById: Map<string, PressKitImageAsset>,
  generatedAt: string,
) {
  if (kits.length === 0) return;
  const folder = zip.folder('press-kits');
  kits.forEach((kit) => {
    const kitFolder = folder?.folder(sanitizeFileName(kit.name));
    if (!kitFolder) return;
    if (kit.richText) kitFolder.file('content.html', kit.richText);
    kitFolder.file('kit.json', pressKitToJson(kit, imagesById, generatedAt));
    const attachedImageNames = kit.imageIds
      .map((id) => imagesById.get(id)?.title)
      .filter((title): title is string => Boolean(title));
    const videoUrls = kit.selectedVideoUrls ?? kit.videoUrls ?? [];
    const presaveUrls = kit.selectedPresaveUrls ?? kit.presaveUrls ?? [];
    kitFolder.file(
      'info.txt',
      [
        `Press Kit: ${kit.name}`,
        '',
        'Attached images (see ../../images):',
        attachedImageNames.length > 0 ? attachedImageNames.map((t) => `- ${t}`).join('\n') : '- None',
        '',
        'Music & Videos:',
        videoUrls.length > 0 ? videoUrls.map((u) => `- ${u}`).join('\n') : '- None',
        '',
        'Presaves:',
        presaveUrls.length > 0 ? presaveUrls.map((u) => `- ${u}`).join('\n') : '- None',
      ].join('\n'),
    );
  });
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.split(';')[0].trim().toLowerCase();
  if (normalized === 'audio/mpeg') return 'mp3';
  if (normalized === 'audio/wav' || normalized === 'audio/x-wav') return 'wav';
  if (normalized === 'audio/ogg') return 'ogg';
  if (normalized === 'audio/webm') return 'webm';
  if (normalized === 'audio/mp4' || normalized === 'audio/x-m4a') return 'm4a';
  return normalized.includes('/') ? normalized.split('/')[1] : 'bin';
}

async function addRecordingsFolder(
  zip: JSZip,
  songs: Song[],
  recordingsBySongId: Record<string, SongRecording[]>,
) {
  const entries = songs
    .map((song) => ({ song, recordings: recordingsBySongId[song.id] ?? [] }))
    .filter((entry) => entry.recordings.length > 0);
  if (entries.length === 0) return;

  const folder = zip.folder('recordings');
  const failedDownloads: string[] = [];

  await Promise.all(entries.map(async ({ song, recordings }) => {
    const songFolder = folder?.folder(sanitizeFileName(song.title));
    const usedNames = new Set<string>();
    await Promise.all(recordings.map(async (recording) => {
      if (!recording.downloadUrl) {
        failedDownloads.push(`${song.title} / ${recording.name}: missing download URL`);
        return;
      }
      try {
        const response = await fetch(recording.downloadUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        const extension = extensionFromMimeType(recording.mimeType);
        let fileName = `${sanitizeFileName(recording.name)}.${extension}`;
        let counter = 2;
        while (usedNames.has(fileName)) {
          fileName = `${sanitizeFileName(recording.name)}-${counter}.${extension}`;
          counter += 1;
        }
        usedNames.add(fileName);
        songFolder?.file(fileName, bytes);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        failedDownloads.push(`${song.title} / ${recording.name}: ${message}`);
      }
    }));
  }));

  if (failedDownloads.length > 0) {
    folder?.file('_failed-downloads.txt', failedDownloads.join('\n'));
  }
}

/**
 * Bundles every band a user belongs to into a single ZIP, so nothing is
 * locked into gigboy's own storage. Songs export as plain ChordPro/text
 * files; recordings, press kit images, technical riders, and press kits
 * export as their native files.
 */
export async function buildSongbookExportZip(input: SongbookExportInput): Promise<Blob> {
  const zip = new JSZip();
  const generatedAt = new Date().toISOString();

  await Promise.all(input.bands.map(async (band) => {
    const bandSongs = input.bandSongsByBandId[band.id] ?? [];
    const bandSongLists = input.bandSongListsByBandId[band.id] ?? [];
    const bandSetlists = input.bandSetlistsByBandId[band.id] ?? [];
    const bandRiders = input.bandInputListsByBandId[band.id] ?? [];
    const bandPressKits = input.bandPressKitsByBandId[band.id] ?? [];
    const bandImages = input.bandPressKitImagesByBandId[band.id] ?? [];
    const bandRecordings = input.bandRecordingsBySongId[band.id] ?? {};

    const isEmpty = bandSongs.length === 0
      && bandSongLists.length === 0
      && bandSetlists.length === 0
      && bandRiders.length === 0
      && bandPressKits.length === 0
      && bandImages.length === 0
      && Object.keys(bandRecordings).length === 0;
    if (isEmpty) return;

    const bandFolder = zip.folder(`bands/${sanitizeFileName(band.name)}`);
    if (!bandFolder) return;
    addSongsFolder(bandFolder, bandSongs);
    addSongListsFolder(bandFolder, bandSongLists, bandSongs, generatedAt);
    addSetlistsFolder(bandFolder, bandSetlists, bandSongs, generatedAt);
    addInputListsFolder(bandFolder, bandRiders, generatedAt);
    const imagesById = new Map(bandImages.map((img) => [img.id, img]));
    addPressKitsFolder(bandFolder, bandPressKits, imagesById, generatedAt);
    await addPressKitImagesFolder(bandFolder, bandImages);
    await addRecordingsFolder(bandFolder, bandSongs, bandRecordings);
  }));

  zip.file(
    'README.txt',
    [
      'GIGBOY export',
      `Generated: ${generatedAt}`,
      '',
      'Each song is a plain ChordPro (.cho) file — chords in [brackets] above the lyrics they belong to.',
      'Songlists, setlists, technical riders, and press kits each ship as a human-readable .txt/.html',
      'file AND a matching .json file — the .json can be re-imported into gigboy from that item\'s',
      'page (Songlists, Setlists, Riders, Press Kits); the .txt/.html is just for reading by eye.',
      'Recordings are exported as their original audio files, grouped by song.',
      'Press kit images live in each band\'s images/ folder.',
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
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer revocation so Safari/Firefox have started the download before the
  // blob URL is invalidated; revoking synchronously can truncate the download.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}
