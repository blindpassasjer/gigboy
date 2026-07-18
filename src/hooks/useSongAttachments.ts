import { useCallback, useEffect, useState } from 'react';
import { db, storage } from '../lib/firebase';
import {
  deleteSongAttachment,
  loadSongAttachments,
  uploadSongAttachment,
  type AttachmentsScope,
  type SongAttachment,
  type UploaderIdentity,
  renameSongAttachment,
} from '../lib/songAttachments';

interface Params {
  scope: AttachmentsScope;
  songId: string;
}

export function useSongAttachments({ scope, songId }: Params) {
  const [attachments, setAttachments] = useState<SongAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const scopeKey = scope.type === 'band' ? `band:${scope.bandId}` : `user:${scope.ownerId}`;

  useEffect(() => {
    if (!db || !songId) {
      setAttachments([]);
      return;
    }
    setLoading(true);
    loadSongAttachments(db, storage, scope, songId)
      .then(setAttachments)
      .catch((err) => console.error('Failed to load attachments', err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, songId]);

  const uploadAttachment = useCallback(
    async (file: File, uploader: UploaderIdentity) => {
      if (!db || !storage) return;
      setUploading(true);
      setUploadError(null);
      try {
        const attachment = await uploadSongAttachment(db, storage, scope, songId, file, uploader);
        setAttachments((prev) => [attachment, ...prev]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save attachment';
        console.error('Failed to upload attachment', err);
        setUploadError(msg);
        throw err;
      } finally {
        setUploading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey, songId],
  );

  const renameAttachment = useCallback(
    async (attachment: SongAttachment, newName: string) => {
      if (!db) return;
      try {
        await renameSongAttachment(db, scope, songId, attachment, newName);
        setAttachments((prev) =>
          prev.map((a) => (a.id === attachment.id ? { ...a, name: newName } : a)),
        );
      } catch (err) {
        console.error('Failed to rename attachment', err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey, songId],
  );

  const deleteAttachment = useCallback(
    async (attachment: SongAttachment) => {
      if (!db || !storage) return;
      try {
        await deleteSongAttachment(db, storage, scope, songId, attachment);
        setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      } catch (err) {
        console.error('Failed to delete attachment', err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey, songId],
  );

  return { attachments, loading, uploading, uploadError, uploadAttachment, deleteAttachment, renameAttachment };
}
