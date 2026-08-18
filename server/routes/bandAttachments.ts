import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attachments, songs, users } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandMember } from '../middleware/bandAccess.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';
import {
  ATTACHMENT_ACCEPTED_MIME_TYPE,
  attachmentToApi,
  attachmentUpload,
  streamAttachment,
} from '../lib/attachments.js';
import { insertTrashItem } from '../lib/trash.js';

export const bandAttachmentsRouter = Router({ mergeParams: true });
bandAttachmentsRouter.use(requireAuth, requireBandMember);

/** Resolves :songId, 404ing unless it belongs to the route's :bandId (mirrors bandResources.ts's check). */
async function loadBandSong(req: Request, res: Response): Promise<{ id: string } | null> {
  const rows = await db
    .select()
    .from(songs)
    .where(and(eq(songs.id, req.params.songId), eq(songs.bandId, req.params.bandId)))
    .limit(1);
  const song = rows[0];
  if (!song) {
    res.status(404).json({ error: 'Song not found.' });
    return null;
  }
  return song;
}

function downloadUrlBase(req: Request): string {
  return `/api/bands/${req.params.bandId}/songs/${req.params.songId}/attachments`;
}

/** Reads :bandId via a widened Request type — route handlers on '/:id' otherwise infer params as {id}. */
function bandIdFromReq(req: Request): string {
  return req.params.bandId;
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

/** Loads the attachment row scoped to the band song, 404ing if missing. */
async function loadAttachment(req: Request, res: Response, songId: string) {
  const existing = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, req.params.id), eq(attachments.songId, songId)))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: 'Attachment not found.' });
    return null;
  }
  return existing[0];
}

bandAttachmentsRouter.get('/', async (req, res) => {
  try {
    const song = await loadBandSong(req, res);
    if (!song) return;
    const rows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.songId, song.id))
      .orderBy(desc(attachments.createdAt));
    res.json({ attachments: rows.map((row) => attachmentToApi(row, downloadUrlBase(req))) });
  } catch (err) {
    console.error('Failed to list band attachments:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandAttachmentsRouter.post(
  '/',
  (req: Request, res: Response, next: NextFunction) => {
    attachmentUpload.single('file')(req, res, (err) => {
      if (handleUploadErrors(err, res)) return;
      next();
    });
  },
  async (req, res) => {
    try {
      const song = await loadBandSong(req, res);
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
      console.error('Failed to save band attachment:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  },
);

bandAttachmentsRouter.patch('/:id', async (req, res) => {
  try {
    const song = await loadBandSong(req, res);
    if (!song) return;
    const name = (req.body ?? {}).name;
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required.' });
      return;
    }
    const attachment = await loadAttachment(req, res, song.id);
    if (!attachment) return;
    if (attachment.uploaderUserId !== req.userId) {
      res.status(403).json({ error: 'Only the uploader can rename this attachment.' });
      return;
    }
    const [row] = await db
      .update(attachments)
      .set({ name })
      .where(eq(attachments.id, req.params.id))
      .returning();
    res.json({ attachment: attachmentToApi(row, downloadUrlBase(req)) });
  } catch (err) {
    console.error('Failed to rename band attachment:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandAttachmentsRouter.delete('/:id', async (req, res) => {
  try {
    const song = await loadBandSong(req, res);
    if (!song) return;
    const attachment = await loadAttachment(req, res, song.id);
    if (!attachment) return;
    if (attachment.uploaderUserId !== req.userId) {
      res.status(403).json({ error: 'Only the uploader can delete this attachment.' });
      return;
    }
    await insertTrashItem({ bandId: bandIdFromReq(req) }, 'attachment', {
      attachment: attachmentToApi(attachment, downloadUrlBase(req)),
      songId: attachment.songId,
      storageKey: attachment.storageKey,
    });
    await db.delete(attachments).where(eq(attachments.id, req.params.id));
    res.json({});
  } catch (err) {
    console.error('Failed to delete band attachment:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandAttachmentsRouter.get('/:id/download', async (req, res) => {
  try {
    const song = await loadBandSong(req, res);
    if (!song) return;
    const attachment = await loadAttachment(req, res, song.id);
    if (!attachment) return;
    await streamAttachment(res, localStorageAdapter, attachment);
  } catch (err) {
    console.error('Failed to download band attachment:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
