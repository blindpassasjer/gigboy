import { useCallback, useEffect, useState } from 'react';
import {
  addRecordingComment,
  deleteRecordingComment,
  loadRecordingComments,
  type RecordingComment,
} from '../lib/recordingComments';

interface Params {
  bandId: string;
  songId: string;
  recordingId: string;
  /** Only fetch once this is true (e.g. the comments section is expanded). */
  enabled: boolean;
}

export function useRecordingComments({ bandId, songId, recordingId, enabled }: Params) {
  const [comments, setComments] = useState<RecordingComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    loadRecordingComments(bandId, songId, recordingId)
      .then((rows) => {
        if (!cancelled) setComments(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load comments.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, songId, recordingId, enabled]);

  const add = useCallback(
    async (body: string, atMs: number | null) => {
      const created = await addRecordingComment(bandId, songId, recordingId, { body, atMs });
      setComments((prev) => [...prev, created]);
      return created;
    },
    [bandId, songId, recordingId],
  );

  const remove = useCallback(
    async (commentId: string) => {
      await deleteRecordingComment(bandId, songId, recordingId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    },
    [bandId, songId, recordingId],
  );

  return { comments, loading, error, add, remove };
}
