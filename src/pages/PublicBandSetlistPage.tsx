import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { PublicSetlistSongEntry } from '../types';

interface PublicSetlist {
  name: string;
  icon?: string;
  bandName?: string;
  bandLogo?: string;
  songs: PublicSetlistSongEntry[];
}

type Status = 'loading' | 'not-found' | 'private' | 'error' | 'ready';

export default function PublicBandSetlistPage() {
  const { bandId, setlistId } = useParams<{ bandId: string; setlistId: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [setlist, setSetlist] = useState<PublicSetlist | null>(null);

  useEffect(() => {
    if (!bandId || !setlistId || !db) {
      setStatus('error');
      return;
    }

    const firestore = db;
    let cancelled = false;

    const load = async () => {
      try {
        const setlistSnap = await getDoc(doc(firestore, 'bands', bandId, 'setlists', setlistId));
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

        let bandLogo: string | undefined;
        try {
          const bandSnap = await getDoc(doc(firestore, 'bands', bandId));
          if (bandSnap.exists()) {
            const bandData = bandSnap.data() as Record<string, unknown>;
            bandLogo = typeof bandData.logo === 'string' ? bandData.logo : undefined;
          }
        } catch {
          bandLogo = undefined;
        }

        setSetlist({
          name: typeof data.name === 'string' ? data.name : 'Setlist',
          icon: typeof data.icon === 'string' ? data.icon : undefined,
          bandName: typeof data.bandName === 'string' ? data.bandName : undefined,
          bandLogo,
          songs,
        });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [bandId, setlistId]);

  if (status === 'loading') {
    return (
      <div className="public-setlist-page">
        <p className="public-setlist-status">Loading setlist…</p>
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
        <Link to="/" className="public-page-nav-brand public-page-nav-brand--large"><BrandMark size={22} /></Link>
        <div className="public-share-branding-row public-share-branding-row--header">
          {(setlist.bandName || setlist.bandLogo) ? (
            <div className="public-share-band-stack public-share-band-stack--header">
              {setlist.bandLogo ? <img src={setlist.bandLogo} alt={`${setlist.bandName ?? 'Band'} logo`} className="public-setlist-band-logo public-setlist-band-logo--large" loading="lazy" /> : null}
              {setlist.bandName ? <h1 className="public-setlist-band public-setlist-band--stack">{setlist.bandName}</h1> : null}
            </div>
          ) : null}
        </div>
        <h2 className="public-setlist-title">
          {setlist.icon && <span aria-hidden="true">{setlist.icon} </span>}
          {setlist.name}
        </h2>
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
        <div className="public-share-branding-row public-share-branding-row--footer">
          <Link to="/" className="public-setlist-footer-link public-page-nav-brand--large"><BrandMark size={18} /></Link>
        </div>
        <p className="public-setlist-signoff">From Norway - with chords</p>
      </footer>
    </div>
  );
}
