import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Music, LayoutGrid, Rows3, GripVertical } from 'lucide-react';
import type { Song } from '../types';
import LanguageBadge from './LanguageBadge';
import { languageName } from '../utils/languages';
import { parseChordPro } from '../utils/chordParser';

const SONG_DRAG_MIME = 'application/x-songbook-song-id';

function getSongPreview(song: Song): string {
  const lyricLines = parseChordPro(song.chordpro)
    .filter((line) => line.type === 'chord-lyric')
    .map((line) => line.segments?.map((segment) => segment.lyric).join('').trim() ?? '')
    .filter(Boolean);

  if (lyricLines.length === 0) {
    return 'No lyric preview available yet.';
  }

  const preview = lyricLines.slice(0, 2).join(' ');
  return preview.length > 150 ? `${preview.slice(0, 147).trimEnd()}...` : preview;
}

interface Props {
  songs: Song[];
  listName?: string;
  onMoveSong?: (songId: string, beforeSongId: string | null) => void;
  onRenameSong: (song: Song) => void | Promise<void>;
  onDeleteSong: (song: Song) => void | Promise<void>;
}

export default function SongList({ songs, listName, onMoveSong, onRenameSong, onDeleteSong }: Props) {
  const [query, setQuery] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const [draggingSongId, setDraggingSongId] = useState<string | null>(null);
  const [dropTargetSongId, setDropTargetSongId] = useState<string | null>(null);
  const [dropAtEnd, setDropAtEnd] = useState(false);

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

  const songPreviews = useMemo(
    () => Object.fromEntries(filtered.map((song) => [song.id, getSongPreview(song)])),
    [filtered]
  );

  const handleSongDragStart = (song: Song, event: React.DragEvent<HTMLElement>) => {
    setDraggingSongId(song.id);
    setDropTargetSongId(null);
    setDropAtEnd(false);
    event.dataTransfer.effectAllowed = onMoveSong ? 'copyMove' : 'copy';
    event.dataTransfer.setData(SONG_DRAG_MIME, song.id);
    event.dataTransfer.setData('text/plain', song.title);
  };

  const handleSongDragEnd = () => {
    setDraggingSongId(null);
    setDropTargetSongId(null);
    setDropAtEnd(false);
  };

  const handleSongDragOver = (songId: string, event: React.DragEvent<HTMLElement>) => {
    if (!onMoveSong || !event.dataTransfer.types.includes(SONG_DRAG_MIME)) {
      return;
    }

    const sourceSongId = event.dataTransfer.getData(SONG_DRAG_MIME) || draggingSongId;
    if (!sourceSongId || sourceSongId === songId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetSongId(songId);
    setDropAtEnd(false);
  };

  const handleSongDrop = (beforeSongId: string, event: React.DragEvent<HTMLElement>) => {
    if (!onMoveSong) {
      return;
    }

    const sourceSongId = event.dataTransfer.getData(SONG_DRAG_MIME) || draggingSongId;
    if (!sourceSongId || sourceSongId === beforeSongId) {
      handleSongDragEnd();
      return;
    }

    event.preventDefault();
    onMoveSong(sourceSongId, beforeSongId);
    handleSongDragEnd();
  };

  const handleListEndDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!onMoveSong || !event.dataTransfer.types.includes(SONG_DRAG_MIME)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetSongId(null);
    setDropAtEnd(true);
  };

  const handleListEndDrop = (event: React.DragEvent<HTMLElement>) => {
    if (!onMoveSong) {
      return;
    }

    const sourceSongId = event.dataTransfer.getData(SONG_DRAG_MIME) || draggingSongId;
    if (!sourceSongId) {
      handleSongDragEnd();
      return;
    }

    event.preventDefault();
    onMoveSong(sourceSongId, null);
    handleSongDragEnd();
  };

  return (
    <div className="song-list-page">
      <div className="song-list-header">
        <div>
          {listName && <h2 className="song-list-heading">{listName}</h2>}
          <p className="song-list-summary">{filtered.length} song{filtered.length === 1 ? '' : 's'}</p>
        </div>
        <div className="view-toggle" role="tablist" aria-label="Song view mode">
          <button
            type="button"
            className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
          >
            <Rows3 size={15} /> List
          </button>
          <button
            type="button"
            className={`view-toggle-btn${viewMode === 'cards' ? ' active' : ''}`}
            onClick={() => setViewMode('cards')}
            aria-pressed={viewMode === 'cards'}
          >
            <LayoutGrid size={15} /> Cards
          </button>
        </div>
      </div>
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
      ) : viewMode === 'cards' ? (
        <div className="song-card-grid" onDragOver={handleListEndDragOver} onDrop={handleListEndDrop}>
          {filtered.map((song) => (
            <article
              key={song.id}
              className={`song-preview-card${dropTargetSongId === song.id ? ' drop-before' : ''}`}
              onDragOver={(event) => handleSongDragOver(song.id, event)}
              onDrop={(event) => handleSongDrop(song.id, event)}
            >
              <button
                type="button"
                className="song-drag-handle"
                draggable
                onDragStart={(event) => handleSongDragStart(song, event)}
                onDragEnd={handleSongDragEnd}
                aria-label={`Drag ${song.title}`}
              >
                <GripVertical size={16} />
              </button>
              <Link to={`/songs/${song.id}`} className="song-preview-card-link">
                <div className="song-preview-card-main">
                  <span className="song-card-title">{song.title}</span>
                  {song.artist && <span className="song-card-artist">{song.artist}</span>}
                </div>
                <p className="song-preview-text">{songPreviews[song.id]}</p>
                <div className="song-card-meta">
                  <LanguageBadge code={song.language} size="sm" />
                  {song.tags?.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
              <div className="song-actions song-actions--stacked">
                <Link to={`/songs/${song.id}/edit`} className="song-action-btn song-action-btn--link">
                  Edit
                </Link>
                <button className="song-action-btn" onClick={() => onRenameSong(song)}>
                  Rename
                </button>
                <button
                  className="song-action-btn song-action-btn--danger"
                  onClick={() => onDeleteSong(song)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
          {filtered.length > 0 && <div className={`song-reorder-dropzone${dropAtEnd ? ' active' : ''}`} aria-hidden="true" />}
        </div>
      ) : (
        <ul className="song-list" onDragOver={handleListEndDragOver} onDrop={handleListEndDrop}>
          {filtered.map((song) => (
            <li key={song.id} className={dropTargetSongId === song.id ? 'drop-before' : ''}>
              <div
                className="song-card"
                onDragOver={(event) => handleSongDragOver(song.id, event)}
                onDrop={(event) => handleSongDrop(song.id, event)}
              >
                <button
                  type="button"
                  className="song-drag-handle"
                  draggable
                  onDragStart={(event) => handleSongDragStart(song, event)}
                  onDragEnd={handleSongDragEnd}
                  aria-label={`Drag ${song.title}`}
                >
                  <GripVertical size={16} />
                </button>
                <Link to={`/songs/${song.id}`} className="song-card-link">
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
                <div className="song-actions">
                  <Link to={`/songs/${song.id}/edit`} className="song-action-btn song-action-btn--link">
                    Edit
                  </Link>
                  <button className="song-action-btn" onClick={() => onRenameSong(song)}>
                    Rename
                  </button>
                  <button
                    className="song-action-btn song-action-btn--danger"
                    onClick={() => onDeleteSong(song)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
          {filtered.length > 0 && <li className={`song-reorder-dropzone${dropAtEnd ? ' active' : ''}`} aria-hidden="true" />}
        </ul>
      )}
    </div>
  );
}
