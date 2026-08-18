import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attachments, songs, users } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';
import {
  ATTACHMENT_ACCEPTED_MIME_TYPE,
  attachmentToApi,
  attachmentUpload,
  streamAttachment,
} from '../lib/attachments.js';
import { insertTrashItem } from '../lib/trash.js';

export const attachmentsRouter = Router({ mergeParams: true });
attachmentsRouter.use(requireAuth);

/** Resolves the personal (owner-only) song for :songId, 404ing if missing or not owned by req.userId. */
async function loadOwnedSong(req: Request, res: Response): Promise<{ id: string } | null> {
  const rows = await db.select().from(songs).where(eq(songs.id, req.params.songId)).limit(1);
  const song = rows[0];
  if (!song || song.userId !== req.userId) {
    res.status(404).json({ error: 'Song not found.' });
    return null;
  }
  return song;
}

function downloadUrlBase(req: Request): string {
  return `/api/songs/${req.params.songId}/attachments`;
}

function handleUploadErrors(err: unknown, res: Response): boolean {
  if (!err) return false;
  const asAny = err as { code?: string; message?: string };
  if (asAny.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'File is too large. Maximum size is 20MB.' });
    return true;
  }
  if (asAny.message === 'INVALID_FILE_TYPE') {
    res.status(400).json({ error: 'Only PDF files are accepted.' });
    return true;
  }
  console.error('Attachment upload failed:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
  return true;
}

attachmentsRouter.get('/', async (req, res) => {
  try {
    const song = await loadOwnedSong(req, res);
    if (!song) return;
    const rows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.songId, song.id))
      .orderBy(desc(attachments.createdAt));
    res.json({ attachments: rows.map((row) => attachmentToApi(row, downloadUrlBase(req))) });
  } catch (err) {
    console.error('Failed to list attachments:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

attachmentsRouter.post(
  '/',
  (req: Request, res: Response, next: NextFunction) => {
    attachmentUpload.single('file')(req, res, (err) => {
      if (handleUploadErrors(err, res)) return;
      next();
    });
  },
  async (req, res) => {
    try {
      const song = await loadOwnedSong(req, res);
      if (!song) return;
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file was uploaded.' });
        return;
      }
      if (file.mimetype !== ATTACHMENT_ACCEPTED_MIME_TYPE) {
        res.status(400).json({ error: 'Only PDF files are accepted.' });
        return;
      }

      const userRows = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
      const uploader = userRows[0];

      const id = crypto.randomUUID();
      const storageKey = `${song.id}/${id}.pdf`;
      await localStorageAdapter.save(storageKey, file.buffer, file.mimetype);

      const [row] = await db
        .insert(attachments)
        .values({
          id,
          songId: song.id,
          name: file.originalname || 'attachment.pdf',
          storageKey,
          sizeBytes: file.size,
          mimeType: file.mimetype,
          uploaderUserId: uploader?.id ?? null,
          uploaderDisplayName: uploader?.fullName || uploader?.username || '',
          uploaderAvatar: uploader?.avatar ?? null,
        })
        .returning();

      res.json({ attachment: attachmentToApi(row, downloadUrlBase(req)) });
    } catch (err) {
      console.error('Failed to save attachment:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  },
);

attachmentsRouter.patch('/:id', async (req, res) => {
  try {
    const song = await loadOwnedSong(req, res);
    if (!song) return;
    const name = (req.body ?? {}).name;
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required.' });
      return;
    }
    const existing = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, req.params.id), eq(attachments.songId, song.id)))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: 'Attachment not found.' });
      return;
    }
    const [row] = await db
      .update(attachments)
      .set({ name })
      .where(eq(attachments.id, req.params.id))
      .returning();
    res.json({ attachment: attachmentToApi(row, downloadUrlBase(req)) });
  } catch (err) {
    console.error('Failed to rename attachment:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

attachmentsRouter.delete('/:id', async (req, res) => {
  try {
    const song = await loadOwnedSong(req, res);
    if (!song) return;
    const existing = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, req.params.id), eq(attachments.songId, song.id)))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: 'Attachment not found.' });
      return;
    }
    await insertTrashItem({ userId: req.userId! }, 'attachment', {
      attachment: attachmentToApi(existing[0], downloadUrlBase(req)),
      songId: existing[0].songId,
      storageKey: existing[0].storageKey,
    });
    await db.delete(attachments).where(eq(attachments.id, req.params.id));
    res.json({});
  } catch (err) {
    console.error('Failed to delete attachment:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

attachmentsRouter.get('/:id/download', async (req, res) => {
  try {
    const song = await loadOwnedSong(req, res);
    if (!song) return;
    const existing = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, req.params.id), eq(attachments.songId, song.id)))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: 'Attachment not found.' });
      return;
    }
    await streamAttachment(res, localStorageAdapter, existing[0]);
  } catch (err) {
    console.error('Failed to download attachment:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
