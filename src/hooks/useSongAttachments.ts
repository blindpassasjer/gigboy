import { useCallback, useEffect, useState } from 'react';
import { dataClient } from '../lib/dataClient';
import type { SongAttachment } from '../lib/songAttachments';

interface Params {
  bandId: string;
  songId: string;
}

export function useSongAttachments({ bandId, songId }: Params) {
  const [attachments, setAttachments] = useState<SongAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!songId || !bandId) {
      setAttachments([]);
      return;
    }
    setLoading(true);
    dataClient.bandAttachments.list(bandId, songId)
      .then(setAttachments)
      .catch((err) => console.error('Failed to load attachments', err))
      .finally(() => setLoading(false));
  }, [bandId, songId]);

  const uploadAttachment = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadError(null);
      try {
        const attachment = await dataClient.bandAttachments.upload(bandId, songId, file);
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
    [bandId, songId],
  );

  const renameAttachment = useCallback(
    async (attachment: SongAttachment, newName: string) => {
      try {
        await dataClient.bandAttachments.rename(bandId, songId, attachment.id, newName);
        setAttachments((prev) =>
          prev.map((a) => (a.id === attachment.id ? { ...a, name: newName } : a)),
        );
      } catch (err) {
        console.error('Failed to rename attachment', err);
      }
    },
    [bandId, songId],
  );

  const deleteAttachment = useCallback(
    async (attachment: SongAttachment) => {
      try {
        await dataClient.bandAttachments.remove(bandId, songId, attachment.id);
        setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      } catch (err) {
        console.error('Failed to move attachment to trash', err);
      }
    },
    [bandId, songId],
  );

  return { attachments, loading, uploading, uploadError, uploadAttachment, deleteAttachment, renameAttachment };
}
