import type { Request, Response } from 'express';
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

/**
 * Parses an HTTP `Range` header for a single byte range. Returns null when absent or
 * not a form we serve (multi-range, non-`bytes` unit); returns 'unsatisfiable' when the
 * range falls outside the file so the caller can answer 416.
 */
function parseByteRange(header: string | undefined, size: number): { start: number; end: number } | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;

  let start: number;
  let end: number;
  if (rawStart === '') {
    // Suffix range: last N bytes.
    const suffix = Number(rawEnd);
    if (suffix <= 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return 'unsatisfiable';
  }
  return { start, end };
}

/** Streams a stored recording to the response, honouring HTTP Range requests, or 404s. */
export async function streamSongRecording(
  req: Request,
  res: Response,
  storageAdapter: typeof localStorageAdapter,
  row: SongRecordingRow,
): Promise<void> {
  const head = await storageAdapter.read(row.storageKey);
  if (!head) {
    res.status(404).json({ error: 'Recording file not found.' });
    return;
  }
  const size = head.sizeBytes;
  // We only needed the size here; discard the unread stream.
  (head.stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();

  res.setHeader('Content-Type', row.mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

  const range = parseByteRange(req.headers.range, size);
  if (range === 'unsatisfiable') {
    res.setHeader('Content-Range', `bytes */${size}`);
    res.status(416).end();
    return;
  }

  if (range) {
    const slice = await storageAdapter.read(row.storageKey, range);
    if (!slice) {
      res.status(404).json({ error: 'Recording file not found.' });
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader('Content-Length', String(range.end - range.start + 1));
    slice.stream.pipe(res);
    return;
  }

  const full = await storageAdapter.read(row.storageKey);
  if (!full) {
    res.status(404).json({ error: 'Recording file not found.' });
    return;
  }
  res.setHeader('Content-Length', String(size));
  full.stream.pipe(res);
}
