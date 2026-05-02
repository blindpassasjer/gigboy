import { useCallback, useEffect, useState } from 'react';
import { db, storage } from '../lib/firebase';
import {
  deleteSongRecording,
  loadSongRecordings,
  uploadSongRecording,
  type RecorderIdentity,
  type RecordingsScope,
  type SongRecording,
} from '../lib/songRecordings';

interface Params {
  scope: RecordingsScope;
  songId: string;
}

export function useSongRecordings({ scope, songId }: Params) {
  const [recordings, setRecordings] = useState<SongRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      try {
        const rec = await uploadSongRecording(db, storage, scope, songId, blob, name, durationMs, recorder);
        setRecordings((prev) => [rec, ...prev]);
      } catch (err) {
        console.error('Failed to upload recording', err);
      } finally {
        setUploading(false);
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

  return { recordings, loading, uploading, uploadRecording, deleteRecording };
}
