import { useCallback, useEffect, useState } from 'react';
import { dataClient } from '../lib/dataClient';
import type { AttachmentsScope, SongAttachment } from '../lib/songAttachments';

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
    if (!songId) {
      setAttachments([]);
      return;
    }
    setLoading(true);
    const listPromise = scope.type === 'band'
      ? dataClient.bandAttachments.list(scope.bandId, songId)
      : dataClient.attachments.list(songId);
    listPromise
      .then(setAttachments)
      .catch((err) => console.error('Failed to load attachments', err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, songId]);

  const uploadAttachment = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadError(null);
      try {
        const attachment = scope.type === 'band'
          ? await dataClient.bandAttachments.upload(scope.bandId, songId, file)
          : await dataClient.attachments.upload(songId, file);
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
      try {
        if (scope.type === 'band') {
          await dataClient.bandAttachments.rename(scope.bandId, songId, attachment.id, newName);
        } else {
          await dataClient.attachments.rename(songId, attachment.id, newName);
        }
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
      try {
        if (scope.type === 'band') {
          await dataClient.bandAttachments.remove(scope.bandId, songId, attachment.id);
        } else {
          await dataClient.attachments.remove(songId, attachment.id);
        }
        setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      } catch (err) {
        console.error('Failed to move attachment to trash', err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey, songId],
  );

  return { attachments, loading, uploading, uploadError, uploadAttachment, deleteAttachment, renameAttachment };
}
