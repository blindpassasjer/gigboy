import { useCallback, useEffect, useState } from 'react';
import {
  deleteSongRecording,
  loadSongRecordings,
  uploadSongRecording,
  type RecorderIdentity,
  type SongRecording,
  renameSongRecording,
} from '../lib/songRecordings';

interface Params {
  bandId: string;
  songId: string;
}

export function useSongRecordings({ bandId, songId }: Params) {
  const [recordings, setRecordings] = useState<SongRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!songId || !bandId) {
      setRecordings([]);
      return;
    }
    setLoading(true);
    loadSongRecordings(bandId, songId)
      .then(setRecordings)
      .catch((err) => console.error('Failed to load recordings', err))
      .finally(() => setLoading(false));
  }, [bandId, songId]);

  const uploadRecording = useCallback(
    async (blob: Blob, name: string, durationMs: number, recorder: RecorderIdentity, waveformBars?: number[]) => {
      setUploading(true);
      setUploadError(null);
      try {
        const rec = await uploadSongRecording(bandId, songId, blob, name, durationMs, recorder, waveformBars);
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
    [bandId, songId],
  );

  const renameRecording = useCallback(
    async (recording: SongRecording, newName: string) => {
      try {
        await renameSongRecording(bandId, songId, recording, newName);
        setRecordings((prev) =>
          prev.map((r) => (r.id === recording.id ? { ...r, name: newName } : r)),
        );
      } catch (err) {
        console.error('Failed to rename recording', err);
      }
    },
    [bandId, songId],
  );

  const deleteRecording = useCallback(
    async (recording: SongRecording) => {
      try {
        await deleteSongRecording(bandId, songId, recording);
        setRecordings((prev) => prev.filter((r) => r.id !== recording.id));
      } catch (err) {
        console.error('Failed to delete recording', err);
      }
    },
    [bandId, songId],
  );

  return { recordings, loading, uploading, uploadError, uploadRecording, deleteRecording, renameRecording };
}
