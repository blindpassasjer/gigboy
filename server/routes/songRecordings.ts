import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { songRecordings, users } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandMember } from '../middleware/bandAccess.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';
import {
  extensionForAudioMimeType,
  RECORDING_ACCEPTED_MIME_TYPES,
  recordingUpload,
  songRecordingToApi,
  streamSongRecording,
} from '../lib/songRecordings.js';
import { loadBandSongScope, type ResolvedSongScope } from '../lib/songScope.js';

function handleUploadErrors(err: unknown, res: Response): boolean {
  if (!err) return false;
  const asAny = err as { code?: string; message?: string };
  if (asAny.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'File is too large. Maximum size is 50MB.' });
    return true;
  }
  if (asAny.message === 'INVALID_FILE_TYPE') {
    res.status(400).json({ error: 'Only audio recordings (webm, ogg, mp3, m4a, wav) are accepted.' });
    return true;
  }
  console.error('Recording upload failed:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
  return true;
}

async function loadRecording(req: Request, res: Response, songId: string) {
  const existing = await db
    .select()
    .from(songRecordings)
    .where(and(eq(songRecordings.id, req.params.id), eq(songRecordings.songId, songId)))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: 'Recording not found.' });
    return null;
  }
  return existing[0];
}

function buildRecordingsRouter(
  loadScope: (req: Request, res: Response) => Promise<ResolvedSongScope | null>,
  urlBase: (req: Request) => string,
) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    try {
      const scope = await loadScope(req, res);
      if (!scope) return;
      const rows = await db
        .select()
        .from(songRecordings)
        .where(eq(songRecordings.songId, scope.song.id))
        .orderBy(desc(songRecordings.createdAt));
      res.json({ recordings: rows.map((row) => songRecordingToApi(row, urlBase(req))) });
    } catch (err) {
      console.error('Failed to list song recordings:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.post(
    '/',
    (req: Request, res: Response, next: NextFunction) => {
      recordingUpload.single('file')(req, res, (err) => {
        if (handleUploadErrors(err, res)) return;
        next();
      });
    },
    async (req, res) => {
      try {
        const scope = await loadScope(req, res);
        if (!scope) return;
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: 'No file was uploaded.' });
          return;
        }
        if (!RECORDING_ACCEPTED_MIME_TYPES.includes(file.mimetype)) {
          res.status(400).json({ error: 'Only audio recordings (webm, ogg, mp3, m4a, wav) are accepted.' });
          return;
        }

        const body = (req.body ?? {}) as Record<string, unknown>;
        const durationMs = Number(body.durationMs);
        const waveformBars = (() => {
          if (typeof body.waveformBars !== 'string') return null;
          try {
            const parsed = JSON.parse(body.waveformBars);
            return Array.isArray(parsed)
              ? parsed.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
              : null;
          } catch {
            return null;
          }
        })();

        const userRows = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
        const recorder = userRows[0];

        const id = crypto.randomUUID();
        const ext = extensionForAudioMimeType(file.mimetype);
        const storageKey = `${scope.song.id}/recordings/${id}.${ext}`;
        await localStorageAdapter.save(storageKey, file.buffer, file.mimetype);

        const [row] = await db
          .insert(songRecordings)
          .values({
            id,
            songId: scope.song.id,
            bandId: scope.bandId,
            name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled',
            storageKey,
            sizeBytes: file.size,
            mimeType: file.mimetype,
            durationMs: Number.isFinite(durationMs) ? Math.round(durationMs) : 0,
            waveformBars,
            recorderUserId: recorder?.id ?? null,
            recorderDisplayName: recorder?.fullName || recorder?.username || '',
            recorderAvatar: recorder?.avatar ?? null,
          })
          .returning();

        res.json({ recording: songRecordingToApi(row, urlBase(req)) });
      } catch (err) {
        console.error('Failed to save song recording:', err);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
    },
  );

  router.patch('/:id', async (req, res) => {
    try {
      const scope = await loadScope(req, res);
      if (!scope) return;
      const name = (req.body ?? {}).name;
      if (typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'name is required.' });
        return;
      }
      const recording = await loadRecording(req, res, scope.song.id);
      if (!recording) return;
      if (recording.recorderUserId !== req.userId && !scope.canManageOthers) {
        res.status(403).json({ error: 'You do not have permission to rename this recording.' });
        return;
      }
      const [row] = await db
        .update(songRecordings)
        .set({ name: name.trim() })
        .where(eq(songRecordings.id, req.params.id))
        .returning();
      res.json({ recording: songRecordingToApi(row, urlBase(req)) });
    } catch (err) {
      console.error('Failed to rename song recording:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const scope = await loadScope(req, res);
      if (!scope) return;
      const recording = await loadRecording(req, res, scope.song.id);
      if (!recording) return;
      if (recording.recorderUserId !== req.userId && !scope.canManageOthers) {
        res.status(403).json({ error: 'You do not have permission to delete this recording.' });
        return;
      }
      await db.delete(songRecordings).where(eq(songRecordings.id, req.params.id));
      await localStorageAdapter.delete(recording.storageKey);
      res.json({});
    } catch (err) {
      console.error('Failed to delete song recording:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  router.get('/:id/download', async (req, res) => {
    try {
      const scope = await loadScope(req, res);
      if (!scope) return;
      const recording = await loadRecording(req, res, scope.song.id);
      if (!recording) return;
      await streamSongRecording(res, localStorageAdapter, recording);
    } catch (err) {
      console.error('Failed to download song recording:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  return router;
}

export const bandSongRecordingsRouter = Router({ mergeParams: true });
bandSongRecordingsRouter.use(requireAuth, requireBandMember);
bandSongRecordingsRouter.use(
  buildRecordingsRouter(
    loadBandSongScope,
    (req) => `/api/bands/${req.params.bandId}/songs/${req.params.songId}/recordings`,
  ),
);
