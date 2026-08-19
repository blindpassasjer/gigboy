import type { Response } from 'express';
import multer from 'multer';
import type { songRecordings } from '../db/schema.js';
import type { localStorageAdapter } from '../storage/localStorageAdapter.js';
import { removeNullish } from './serialize.js';

/** Mirrors the recorder in SongRecorder.tsx — MediaRecorder output is webm/ogg; mp3/m4a cover imported files. */
export const RECORDING_MAX_SIZE_BYTES = 50 * 1024 * 1024;
export const RECORDING_ACCEPTED_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
];

type SongRecordingRow = typeof songRecordings.$inferSelect;

export const recordingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RECORDING_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!RECORDING_ACCEPTED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

/** Extension to use for a recording's storage key, derived from its (already-validated) mime type. */
export function extensionForAudioMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'audio/webm':
      return 'webm';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/mp4':
      return 'm4a';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    default:
      return 'bin';
  }
}

/** Maps a DB row to the wire shape `SongRecording` (src/lib/songRecordings.ts) expects. */
export function songRecordingToApi(row: SongRecordingRow, urlBase: string) {
  return removeNullish({
    id: row.id,
    name: row.name,
    storagePath: row.storageKey,
    downloadUrl: `${urlBase}/${row.id}/download`,
    durationMs: row.durationMs,
    sizeBytes: row.sizeBytes,
    mimeType: row.mimeType,
    createdAt: row.createdAt.toISOString(),
    recorder: row.recorderUserId
      ? {
          userId: row.recorderUserId,
          displayName: row.recorderDisplayName ?? '',
          avatar: row.recorderAvatar ?? null,
        }
      : undefined,
    waveformBars: Array.isArray(row.waveformBars) && row.waveformBars.length ? row.waveformBars : undefined,
  });
}

/** Streams a stored recording to the response, or 404s. */
export async function streamSongRecording(
  res: Response,
  storageAdapter: typeof localStorageAdapter,
  row: SongRecordingRow,
): Promise<void> {
  const file = await storageAdapter.read(row.storageKey);
  if (!file) {
    res.status(404).json({ error: 'Recording file not found.' });
    return;
  }
  res.setHeader('Content-Type', row.mimeType);
  res.setHeader('Content-Length', String(file.sizeBytes));
  file.stream.pipe(res);
}
