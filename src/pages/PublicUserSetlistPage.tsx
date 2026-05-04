import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { PublicSetlistSongEntry } from '../types';

interface PublicSetlist {
  name: string;
  icon?: string;
  songs: PublicSetlistSongEntry[];
}

type Status = 'loading' | 'not-found' | 'private' | 'error' | 'ready';

export default function PublicUserSetlistPage() {
  const { userId, setlistId } = useParams<{ userId: string; setlistId: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [setlist, setSetlist] = useState<PublicSetlist | null>(null);

  useEffect(() => {
    if (!userId || !setlistId || !db) {
      setStatus('error');
      return;
    }

    const firestore = db;
    let cancelled = false;

    const load = async () => {
      try {
        const setlistSnap = await getDoc(doc(firestore, 'users', userId, 'setlists', setlistId));
        if (cancelled) return;

        if (!setlistSnap.exists()) {
          setStatus('not-found');
          return;
        }

        const data = setlistSnap.data() as Record<string, unknown>;

        if (data.publicShareEnabled !== true) {
          setStatus('private');
          return;
        }

        const rawSongs = Array.isArray(data.publicSongs) ? data.publicSongs as unknown[] : [];
        const rawPublicSongNotes =
          typeof data.publicSongNotes === 'object' && data.publicSongNotes !== null
            ? data.publicSongNotes as Record<string, unknown>
            : {};
        const publicSongNotes = Object.fromEntries(
          Object.entries(rawPublicSongNotes).filter(([, value]) => typeof value === 'string')
        ) as Record<string, string>;

        const songs: PublicSetlistSongEntry[] = rawSongs
          .filter((entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>).id === 'string'
          )
          .map((entry) => ({
            id: entry.id as string,
            title: typeof entry.title === 'string' ? entry.title : 'Untitled',
            ...(typeof entry.artist === 'string' ? { artist: entry.artist } : {}),
            ...(typeof publicSongNotes[entry.id as string] === 'string'
              ? { note: publicSongNotes[entry.id as string] }
              : {}),
          }));

        setSetlist({
          name: typeof data.name === 'string' ? data.name : 'Setlist',
          icon: typeof data.icon === 'string' ? data.icon : undefined,
          songs,
        });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [userId, setlistId]);

  if (status === 'loading') {
    return (
      <div className="public-setlist-page">
        <p className="public-setlist-status">Loading setlist...</p>
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <div className="public-setlist-page">
        <p className="public-setlist-status">Setlist not found.</p>
      </div>
    );
  }

  if (status === 'private') {
    return (
      <div className="public-setlist-page">
        <p className="public-setlist-status">This setlist is not publicly shared.</p>
      </div>
    );
  }

  if (status === 'error' || !setlist) {
    return (
      <div className="public-setlist-page">
        <p className="public-setlist-status">Failed to load setlist.</p>
      </div>
    );
  }

  return (
    <div className="public-setlist-page">
      <header className="public-setlist-header">
        <h1 className="public-setlist-title">
          {setlist.icon && <span aria-hidden="true">{setlist.icon} </span>}
          {setlist.name}
        </h1>
        <p className="public-setlist-count">
          {setlist.songs.length} song{setlist.songs.length === 1 ? '' : 's'}
        </p>
      </header>

      {setlist.songs.length === 0 ? (
        <p className="public-setlist-status">No songs in this setlist.</p>
      ) : (
        <ol className="public-setlist-songs">
          {setlist.songs.map((song, index) => (
            <li key={song.id} className="public-setlist-song">
              <span className="public-setlist-song-position">{index + 1}</span>
              <div className="public-setlist-song-info">
                <span className="public-setlist-song-title">{song.title}</span>
                {song.artist && (
                  <span className="public-setlist-song-artist">{song.artist}</span>
                )}
                {song.note && (
                  <span className="public-setlist-song-note">{song.note}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <footer className="public-setlist-footer">
        <Link to="/" className="public-setlist-footer-link">Folio</Link>
      </footer>
    </div>
  );
}
