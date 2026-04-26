import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, Trash2, Music } from 'lucide-react';
import type { Song } from '../types';
import { useSetlists } from '../context/SetlistsContext';
import LanguageBadge from './LanguageBadge';

interface Props {
  setlistId: string;
  setlistName: string;
  songs: Song[];
  onMoveSong: (songId: string, beforeSongId: string | null) => void;
  onRemoveSong: (songId: string) => void;
}

const SONG_DRAG_MIME = 'application/x-songbook-song-id';
const SONG_DRAG_FALLBACK_MIME = 'text/x-songbook-song-id';

export default function SetlistsView({
  setlistId,
  setlistName,
  songs,
  onMoveSong,
  onRemoveSong,
}: Props) {
  const { renameSetlist } = useSetlists();
  const [draggingSongId, setDraggingSongId] = useState<string | null>(null);
  const [dropTargetSongId, setDropTargetSongId] = useState<string | null>(null);
  const [dropAtEnd, setDropAtEnd] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(setlistName);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const handleRenameCommit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== setlistName) {
      renameSetlist(setlistId, trimmed);
    }
    setRenameValue(setlistName);
    setIsRenaming(false);
  };

  const handleSongDragStart = (song: Song, event: React.DragEvent<HTMLElement>) => {
    setDraggingSongId(song.id);
    setDropTargetSongId(null);
    setDropAtEnd(false);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(SONG_DRAG_MIME, song.id);
    event.dataTransfer.setData(SONG_DRAG_FALLBACK_MIME, song.id);
    event.dataTransfer.setData('text/plain', song.title);
  };

  const handleSongDragEnd = () => {
    setDraggingSongId(null);
    setDropTargetSongId(null);
    setDropAtEnd(false);
  };

  const handleSongDragOver = (songId: string, event: React.DragEvent<HTMLElement>) => {
    const isSongDrop = event.dataTransfer.types.includes(SONG_DRAG_MIME)
      || event.dataTransfer.types.includes(SONG_DRAG_FALLBACK_MIME);
    if (!isSongDrop) return;

    const sourceSongId = event.dataTransfer.getData(SONG_DRAG_MIME) || draggingSongId;
    if (!sourceSongId || sourceSongId === songId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetSongId((current) => (current === songId ? current : songId));
    setDropAtEnd((current) => (current ? false : current));
  };

  const handleSongDrop = (beforeSongId: string, event: React.DragEvent<HTMLElement>) => {
    const isSongDrop = event.dataTransfer.types.includes(SONG_DRAG_MIME)
      || event.dataTransfer.types.includes(SONG_DRAG_FALLBACK_MIME);
    if (!isSongDrop) {
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
    const isSongDrop = event.dataTransfer.types.includes(SONG_DRAG_MIME)
      || event.dataTransfer.types.includes(SONG_DRAG_FALLBACK_MIME);
    if (!isSongDrop) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetSongId((current) => (current === null ? current : null));
    setDropAtEnd((current) => (current ? current : true));
  };

  const handleListEndDrop = (event: React.DragEvent<HTMLElement>) => {
    const isSongDrop = event.dataTransfer.types.includes(SONG_DRAG_MIME)
      || event.dataTransfer.types.includes(SONG_DRAG_FALLBACK_MIME);
    if (!isSongDrop) {
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
    <div className="setlist-view">
      <div className="setlist-header">
        <div className="setlist-title-block">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameCommit();
                if (e.key === 'Escape') {
                  setRenameValue(setlistName);
                  setIsRenaming(false);
                }
              }}
              onBlur={handleRenameCommit}
              className="setlist-name-input"
            />
          ) : (
            <h1 className="setlist-title" onDoubleClick={() => setIsRenaming(true)}>
              {setlistName}
            </h1>
          )}
          <p className="setlist-song-count">
            {songs.length} song{songs.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          className="setlist-action-btn"
          onClick={() => setIsRenaming(true)}
          title="Rename setlist"
        >
          Rename
        </button>
      </div>

      <div className="setlist-info">
        <p className="setlist-hint">💡 Drag songs here to add them, or drag within the list to reorder</p>
      </div>

      {songs.length === 0 ? (
        <div className="empty-state">
          <Music size={48} />
          <p>No songs in this setlist yet.</p>
          <p className="empty-state-hint">Drag songs from the library to add them.</p>
        </div>
      ) : (
        <ul
          className="setlist-songs"
          onDragOver={handleListEndDragOver}
          onDrop={handleListEndDrop}
        >
          {songs.map((song, index) => (
            <li
              key={song.id}
              className={`setlist-song-item ${dropTargetSongId === song.id ? 'drop-before' : ''}`}
            >
              <div
                className="setlist-song-card"
                onDragOver={(event) => handleSongDragOver(song.id, event)}
                onDrop={(event) => handleSongDrop(song.id, event)}
              >
                <button
                  type="button"
                  className="setlist-drag-handle"
                  draggable
                  onDragStart={(event) => handleSongDragStart(song, event)}
                  onDragEnd={handleSongDragEnd}
                  aria-label={`Drag ${song.title}`}
                >
                  <GripVertical size={16} />
                </button>

                <div className="setlist-song-position">{index + 1}</div>

                <Link to={`/songs/${song.id}`} className="setlist-song-link">
                  <div className="setlist-song-info">
                    <span className="setlist-song-title">{song.title}</span>
                    {song.artist && <span className="setlist-song-artist">{song.artist}</span>}
                  </div>
                  <div className="setlist-song-meta">
                    <LanguageBadge code={song.language} size="sm" />
                    {song.tags?.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </Link>

                <button
                  className="setlist-remove-btn"
                  onClick={() => onRemoveSong(song.id)}
                  title={`Remove ${song.title} from setlist`}
                  aria-label={`Remove ${song.title}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
          {songs.length > 0 && (
            <li className={`setlist-drop-zone${dropAtEnd ? ' active' : ''}`} aria-hidden="true" />
          )}
        </ul>
      )}
    </div>
  );
}
