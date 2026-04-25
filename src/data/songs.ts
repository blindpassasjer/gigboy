import type { Song } from '../types';
import { parseSongFile } from '../utils/parseSongFile';

const rawFiles = import.meta.glob('./songs/*.cho', { as: 'raw', eager: true }) as Record<string, string>;

const songs: Song[] = Object.entries(rawFiles).map(([path, raw]) => {
  const id = path.replace('./songs/', '').replace('.cho', '');
  return parseSongFile(raw, id);
});

export default songs;
