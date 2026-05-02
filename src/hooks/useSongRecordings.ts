import { useCallback, useEffect, useState } from 'react';
import { db, storage } from '../lib/firebase';
import {
  deleteSongRecording,
  loadSongRecordings,
  uploadSongRecording,
  type RecorderIdentity,
  type RecordingsScope,
  type SongRecording,
  renameSongRecording,
} from '../lib/songRecordings';

interface Params {
  scope: RecordingsScope;
  songId: string;
}

export function useSongRecordings({ scope, songId }: Params) {
  const [recordings, setRecordings] = useState<SongRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const scopeKey = scope.type === 'band' ? `band:${scope.bandId}` : `user:${scope.ownerId}`;

  useEffect(() => {
    if (!db || !songId) {
      setRecordings([]);
      return;
    }
    setLoading(true);
    loadSongRecordings(db, scope, songId)
      .then(setRecordings)
      .catch((err) => console.error('Failed to load recordings', err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, songId]);

  const uploadRecording = useCallback(
    async (blob: Blob, name: string, durationMs: number, recorder: RecorderIdentity) => {
      if (!db || !storage) return;
      setUploading(true);
      setUploadError(null);
      try {
        const rec = await uploadSongRecording(db, storage, scope, songId, blob, name, durationMs, recorder);
        setRecordings((prev) => [rec, ...prev]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save recording';
        console.error('Failed to upload recording', err);
        setUploadError(msg);
        throw err; // re-throw so SongRecorder can skip discardPreview
      } finally {
        setUploading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey, songId],
  );

  const renameRecording = useCallback(
    async (recording: SongRecording, newName: string) => {
      if (!db) return;
      try {
        await renameSongRecording(db, scope, songId, recording, newName);
        setRecordings((prev) =>
          prev.map((r) => (r.id === recording.id ? { ...r, name: newName } : r)),
        );
      } catch (err) {
        console.error('Failed to rename recording', err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey, songId],
  );

  const deleteRecording = useCallback(
    async (recording: SongRecording) => {
      if (!db || !storage) return;
      try {
        await deleteSongRecording(db, storage, scope, songId, recording);
        setRecordings((prev) => prev.filter((r) => r.id !== recording.id));
      } catch (err) {
        console.error('Failed to delete recording', err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey, songId],
  );

  return { recordings, loading, uploading, uploadError, uploadRecording, deleteRecording, renameRecording };
}
