import { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, Trash2, Music, Plus, Search, X } from 'lucide-react';
import type { Song } from '../types';
import { useSetlists } from '../context/SetlistsContext';
import LanguageBadge from './LanguageBadge';

interface Props {
  setlistId: string;
  setlistName: string;
  songs: Song[];
  allSongs: Song[];
  onMoveSong: (songId: string, beforeSongId: string | null) => void;
  onRemoveSong: (songId: string) => void;
  onAddSong: (songId: string) => void;
}

const SONG_DRAG_MIME = 'application/x-songbook-song-id';
const SONG_DRAG_FALLBACK_MIME = 'text/x-songbook-song-id';

export default function SetlistsView({
  setlistId,
  setlistName,
  songs,
  allSongs,
  onMoveSong,
  onRemoveSong,
  onAddSong,
}: Props) {
  const { renameSetlist } = useSetlists();
  const [draggingSongId, setDraggingSongId] = useState<string | null>(null);
  const [dropTargetSongId, setDropTargetSongId] = useState<string | null>(null);
  const [dropTargetPosition, setDropTargetPosition] = useState<'before' | 'after'>('before');
  const [dropAtEnd, setDropAtEnd] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(setlistName);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const availableSongs = useMemo(() => {
    const songIdsInSetlist = new Set(songs.map((song) => song.id));
    return allSongs
      .filter((song) => !songIdsInSetlist.has(song.id))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [allSongs, songs]);

  const filteredAvailableSongs = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    if (!query) return availableSongs;

    return availableSongs.filter((song) => {
      const inTitle = song.title.toLowerCase().includes(query);
      const inArtist = (song.artist ?? '').toLowerCase().includes(query);
      const inTags = (song.tags ?? []).some((tag) => tag.toLowerCase().includes(query));
      return inTitle || inArtist || inTags;
    });
  }, [availableSongs, pickerQuery]);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    if (!showSongPicker) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSongPicker(false);
        setPickerQuery('');
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showSongPicker]);

  const openSongPicker = () => {
    setPickerQuery('');
    setShowSongPicker(true);
  };

  const closeSongPicker = () => {
    setShowSongPicker(false);
    setPickerQuery('');
  };

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
    setDropTargetPosition('before');
    setDropAtEnd(false);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(SONG_DRAG_MIME, song.id);
    event.dataTransfer.setData(SONG_DRAG_FALLBACK_MIME, song.id);
    event.dataTransfer.setData('text/plain', song.title);
  };

  const handleSongDragEnd = () => {
    setDraggingSongId(null);
    setDropTargetSongId(null);
    setDropTargetPosition('before');
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

    const target = event.currentTarget;
    const targetRect = target.getBoundingClientRect();
    const dropPosition = event.clientY < targetRect.top + targetRect.height / 2 ? 'before' : 'after';

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetSongId((current) => (current === songId ? current : songId));
    setDropTargetPosition((current) => (current === dropPosition ? current : dropPosition));
    setDropAtEnd((current) => (current ? false : current));
  };

  const handleSongDrop = (targetSongId: string, event: React.DragEvent<HTMLElement>) => {
    const isSongDrop = event.dataTransfer.types.includes(SONG_DRAG_MIME)
      || event.dataTransfer.types.includes(SONG_DRAG_FALLBACK_MIME);
    if (!isSongDrop) {
      return;
    }

    const sourceSongId = event.dataTransfer.getData(SONG_DRAG_MIME) || draggingSongId;
    if (!sourceSongId || sourceSongId === targetSongId) {
      handleSongDragEnd();
      return;
    }

    const target = event.currentTarget;
    const targetRect = target.getBoundingClientRect();
    const dropPosition = event.clientY < targetRect.top + targetRect.height / 2 ? 'before' : 'after';
    const targetIndex = songs.findIndex((song) => song.id === targetSongId);

    if (targetIndex < 0) {
      handleSongDragEnd();
      return;
    }

    const beforeSongId = dropPosition === 'before'
      ? targetSongId
      : songs[targetIndex + 1]?.id ?? null;

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
        <div className="setlist-header-actions">
          {songs.length > 0 ? (
            <Link
              className="setlist-action-btn setlist-action-btn--concert"
              to={`/setlists/${setlistId}/concert`}
              title={`Start concert for ${setlistName}`}
            >
              Start Concert
            </Link>
          ) : (
            <button
              className="setlist-action-btn setlist-action-btn--concert"
              type="button"
              disabled
              title="Add songs to enable concert mode"
            >
              Start Concert
            </button>
          )}
          <button
            className="setlist-action-btn setlist-action-btn--secondary"
            onClick={openSongPicker}
            title="Add songs"
          >
            <Plus size={14} /> Add songs
          </button>
          <button
            className="setlist-action-btn"
            onClick={() => setIsRenaming(true)}
            title="Rename setlist"
          >
            Rename
          </button>
        </div>
      </div>

      {songs.length === 0 ? (
        <div className="empty-state">
          <Music size={48} />
          <p>No songs in this setlist yet.</p>
          <p className="empty-state-hint">Drag songs from the library to add them.</p>
        </div>
      ) : (
        <ul
          className={`setlist-songs${draggingSongId ? ' is-dragging' : ''}${dropAtEnd ? ' drop-at-end' : ''}`}
          onDragOver={handleListEndDragOver}
          onDrop={handleListEndDrop}
        >
          {songs.map((song, index) => (
            <li
              key={song.id}
              className={`setlist-song-item${dropTargetSongId === song.id ? ` drop-${dropTargetPosition}` : ''}${draggingSongId === song.id ? ' dragging' : ''}`}
            >
              <div
                className={`setlist-song-card${dropTargetSongId === song.id ? ' drop-target' : ''}`}
                onDragOver={(event) => handleSongDragOver(song.id, event)}
                onDrop={(event) => handleSongDrop(song.id, event)}
              >
                <button
                  type="button"
                  className={`setlist-drag-handle${draggingSongId === song.id ? ' dragging' : ''}`}
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

      {showSongPicker && (
        <div className="song-picker-overlay" role="dialog" aria-modal="true" aria-label="Add songs to setlist">
          <div className="song-picker-panel">
            <div className="song-picker-header">
              <h2>Add songs to {setlistName}</h2>
              <button className="song-picker-close" onClick={closeSongPicker} aria-label="Close song picker">
                <X size={16} />
              </button>
            </div>

            <div className="song-picker-search-wrap">
              <Search size={15} className="song-picker-search-icon" />
              <input
                type="text"
                className="song-picker-search"
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
                placeholder="Search by title, artist, or tag"
              />
            </div>

            <div className="song-picker-results" role="list">
              {filteredAvailableSongs.length === 0 ? (
                <p className="song-picker-empty">No songs available to add.</p>
              ) : (
                filteredAvailableSongs.map((song) => (
                  <div key={song.id} className="song-picker-item" role="listitem">
                    <div className="song-picker-item-main">
                      <span className="song-picker-song-title">{song.title}</span>
                      {song.artist && <span className="song-picker-song-artist">{song.artist}</span>}
                    </div>
                    <button
                      className="song-picker-add-btn"
                      onClick={() => onAddSong(song.id)}
                      title={`Add ${song.title}`}
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="song-picker-footer">
              <button className="setlist-action-btn" onClick={closeSongPicker}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
