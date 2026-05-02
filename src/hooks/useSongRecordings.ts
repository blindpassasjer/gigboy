import { useCallback, useEffect, useState } from 'react';
import { db, storage } from '../lib/firebase';
import {
  deleteSongRecording,
  loadSongRecordings,
  uploadSongRecording,
  type SongRecording,
} from '../lib/songRecordings';

interface Params {
  ownerId: string;
  songId: string;
  userId: string;
}

export function useSongRecordings({ ownerId, songId, userId }: Params) {
  const [recordings, setRecordings] = useState<SongRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!db || !ownerId || !songId) {
      setRecordings([]);
      return;
    }
    setLoading(true);
    loadSongRecordings(db, ownerId, songId)
      .then(setRecordings)
      .catch((err) => console.error('Failed to load recordings', err))
      .finally(() => setLoading(false));
  }, [ownerId, songId, userId]);

  const uploadRecording = useCallback(
    async (blob: Blob, name: string, durationMs: number) => {
      if (!db || !storage) return;
      setUploading(true);
      try {
        const rec = await uploadSongRecording(db, storage, ownerId, songId, blob, name, durationMs);
        setRecordings((prev) => [rec, ...prev]);
      } catch (err) {
        console.error('Failed to upload recording', err);
      } finally {
        setUploading(false);
      }
    },
    [ownerId, songId],
  );

  const deleteRecording = useCallback(
    async (recording: SongRecording) => {
      if (!db || !storage) return;
      try {
        await deleteSongRecording(db, storage, ownerId, songId, recording);
        setRecordings((prev) => prev.filter((r) => r.id !== recording.id));
      } catch (err) {
        console.error('Failed to delete recording', err);
      }
    },
    [ownerId, songId],
  );

  return { recordings, loading, uploading, uploadRecording, deleteRecording };
}
