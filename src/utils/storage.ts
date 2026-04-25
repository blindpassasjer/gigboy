import type { Recording, Song } from '../types';

const RECORDINGS_KEY = 'songbook:recordings';

type RecordingsStore = Record<string, Recording[]>;

function load(): RecordingsStore {
  try {
    return JSON.parse(localStorage.getItem(RECORDINGS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function save(store: RecordingsStore) {
  localStorage.setItem(RECORDINGS_KEY, JSON.stringify(store));
}

export function getRecordings(songId: string): Recording[] {
  return load()[songId] ?? [];
}

export function saveRecording(songId: string, recording: Recording) {
  const store = load();
  store[songId] = [recording, ...(store[songId] ?? [])];
  save(store);
}

export function deleteRecording(songId: string, recordingId: string) {
  const store = load();
  store[songId] = (store[songId] ?? []).filter((r) => r.id !== recordingId);
  save(store);
}

/** Merge persisted recordings into a song object. */
export function withRecordings(song: Song): Song {
  const persisted = getRecordings(song.id);
  const builtin = song.recordings ?? [];
  return { ...song, recordings: [...persisted, ...builtin] };
}
