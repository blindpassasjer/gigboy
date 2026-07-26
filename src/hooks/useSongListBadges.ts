import { useEffect, useRef, useState } from 'react';
import { collection, getCountFromServer } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Song } from '../types';

export interface SongBadgeCounts {
  notes: number;
  attachments: number;
  recordings: number;
}

function collectionPath(bandId: string | undefined, ownerId: string | undefined, songId: string, sub: string) {
  if (bandId) return `bands/${bandId}/songs/${songId}/${sub}`;
  if (ownerId) return `users/${ownerId}/songs/${songId}/${sub}`;
  return null;
}

/**
 * Best-effort badge counts (notes/attachments/recordings) for songs shown in a list.
 * Uses count aggregation queries so cards can show "has content" indicators without
 * downloading every subcollection doc for every song.
 */
export function useSongListBadges(songs: Song[], bandId: string | undefined, currentUserId: string | undefined) {
  const [counts, setCounts] = useState<Record<string, SongBadgeCounts>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!db) return;
    const firestore = db;

    songs.forEach((song) => {
      const ownerId = bandId ? undefined : (song.ownerId ?? currentUserId);
      const fetchKey = bandId ? `band:${bandId}:${song.id}` : `user:${ownerId}:${song.id}`;
      if (!bandId && !ownerId) return;
      if (fetchedRef.current.has(fetchKey)) return;
      fetchedRef.current.add(fetchKey);

      const notesPath = collectionPath(bandId, ownerId, song.id, 'handNotes');
      const attachmentsPath = collectionPath(bandId, ownerId, song.id, 'attachments');
      const recordingsPath = collectionPath(bandId, ownerId, song.id, 'recordings');
      if (!notesPath || !attachmentsPath || !recordingsPath) return;

      Promise.all([
        getCountFromServer(collection(firestore, notesPath)),
        getCountFromServer(collection(firestore, attachmentsPath)),
        getCountFromServer(collection(firestore, recordingsPath)),
      ])
        .then(([notesSnap, attachmentsSnap, recordingsSnap]) => {
          setCounts((prev) => ({
            ...prev,
            [song.id]: {
              notes: notesSnap.data().count,
              attachments: attachmentsSnap.data().count,
              recordings: recordingsSnap.data().count,
            },
          }));
        })
        .catch(() => {
          // Badges are best-effort — leave the song without counts on failure.
        });
    });
  }, [songs, bandId, currentUserId]);

  return counts;
}
