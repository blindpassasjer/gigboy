import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Setlist } from '../types';

const KEY_SETLISTS = 'songbook-setlists';

function readLocalSetlists(): Setlist[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(KEY_SETLISTS);
    return raw ? (JSON.parse(raw) as Setlist[]) : [];
  } catch {
    return [];
  }
}

export default function SharedSetlistPage() {
  const { shareToken } = useParams<{ shareToken: string }>();

  const setlist = useMemo(() => {
    if (!shareToken) return null;
    return readLocalSetlists().find((entry) => entry.shareToken === shareToken) ?? null;
  }, [shareToken]);

  if (!setlist) {
    return (
      <main className="page-content">
        <section className="card">
          <h1>Shared setlist not found</h1>
          <p>The share link is invalid or this setlist is no longer shared.</p>
          <p>
            <Link to="/">Go to Folio</Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-content">
      <section className="card">
        <h1>{setlist.name}</h1>
        <p>{setlist.songIds.length} songs</p>
        <p>This shared view currently lists song IDs only on this device.</p>
        <ul>
          {setlist.songIds.map((songId) => (
            <li key={songId}>{songId}</li>
          ))}
        </ul>
        <p>
          <Link to="/">Open Folio</Link>
        </p>
      </section>
    </main>
  );
}
