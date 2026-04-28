import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Music } from 'lucide-react';
import { db } from '../lib/firebase';
import type { Song } from '../types';
import LanguageBadge from '../components/LanguageBadge';

interface SharedSetlistDoc {
  name: string;
  songs: Song[];
  ownerId: string;
  createdAt: string;
  setlistId: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: SharedSetlistDoc };

export default function SharedSetlistPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!shareToken) {
      setState({ status: 'not-found' });
      return;
    }

    if (!db) {
      setState({ status: 'error', message: 'Database not configured.' });
      return;
    }

    getDoc(doc(db, 'sharedSetlists', shareToken))
      .then((snapshot) => {
        if (!snapshot.exists()) {
          setState({ status: 'not-found' });
          return;
        }
        setState({ status: 'loaded', data: snapshot.data() as SharedSetlistDoc });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load setlist.';
        setState({ status: 'error', message });
      });
  }, [shareToken]);

  return (
    <div className="shared-setlist-page">
      <div className="shared-setlist-header">
        <Link to="/" className="shared-setlist-logo">Folio</Link>
      </div>

      <div className="shared-setlist-content">
        {state.status === 'loading' && (
          <p className="shared-setlist-status">Loading…</p>
        )}

        {state.status === 'not-found' && (
          <div className="shared-setlist-empty">
            <Music size={48} />
            <h1>Setlist not found</h1>
            <p>This link may have expired or been removed by the owner.</p>
            <Link to="/" className="shared-setlist-cta">Open Folio</Link>
          </div>
        )}

        {state.status === 'error' && (
          <div className="shared-setlist-empty">
            <h1>Something went wrong</h1>
            <p>{state.message}</p>
            <Link to="/" className="shared-setlist-cta">Open Folio</Link>
          </div>
        )}

        {state.status === 'loaded' && (
          <>
            <div className="shared-setlist-title-block">
              <h1 className="shared-setlist-title">{state.data.name}</h1>
              <p className="shared-setlist-meta">
                {state.data.songs.length} song{state.data.songs.length === 1 ? '' : 's'}
              </p>
            </div>

            {state.data.songs.length === 0 ? (
              <p className="shared-setlist-status">No songs in this setlist.</p>
            ) : (
              <ol className="shared-setlist-songs">
                {state.data.songs.map((song, index) => (
                  <li key={song.id} className="shared-setlist-song-item">
                    <span className="shared-setlist-song-position">{index + 1}</span>
                    <div className="shared-setlist-song-info">
                      <span className="shared-setlist-song-title">{song.title}</span>
                      {song.artist && (
                        <span className="shared-setlist-song-artist">{song.artist}</span>
                      )}
                    </div>
                    <div className="shared-setlist-song-meta">
                      <LanguageBadge code={song.language} size="sm" />
                      {song.tags?.map((tag) => (
                        <span key={tag} className="tag">{tag}</span>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <div className="shared-setlist-footer">
              <Link to="/" className="shared-setlist-cta">Open Folio to manage your own setlists</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
