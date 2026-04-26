import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Music } from 'lucide-react';
import type { Song } from '../types';
import LanguageBadge from './LanguageBadge';
import { languageName } from '../utils/languages';

interface Props {
  songs: Song[];
  listName?: string;
}

export default function SongList({ songs, listName }: Props) {
  const [query, setQuery] = useState('');
  const [langFilter, setLangFilter] = useState('');

  const languages = useMemo(
    () => Array.from(new Set(songs.map((s) => s.language))).sort(),
    [songs]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return songs.filter((s) => {
      const matchesQuery =
        !q ||
        s.title.toLowerCase().includes(q) ||
        (s.artist ?? '').toLowerCase().includes(q) ||
        (s.tags ?? []).some((t) => t.toLowerCase().includes(q));
      const matchesLang = !langFilter || s.language === langFilter;
      return matchesQuery && matchesLang;
    });
  }, [songs, query, langFilter]);

  return (
    <div className="song-list-page">
      {listName && <h2 className="song-list-heading">{listName}</h2>}
      <div className="song-list-controls">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search songs, artists, tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
          className="lang-select"
        >
          <option value="">All languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {languageName(l)}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Music size={48} />
          <p>No songs found.</p>
        </div>
      ) : (
        <ul className="song-list">
          {filtered.map((song) => (
            <li key={song.id}>
              <Link to={`/songs/${song.id}`} className="song-card">
                <div className="song-card-main">
                  <span className="song-card-title">{song.title}</span>
                  {song.artist && <span className="song-card-artist">{song.artist}</span>}
                </div>
                <div className="song-card-meta">
                  <LanguageBadge code={song.language} size="sm" />
                  {song.tags?.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
