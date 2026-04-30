import { Fragment, useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, Trash2, Music, Plus, Search, X, Printer, PenLine, Play, Smile } from 'lucide-react';
import type { Song } from '../types';
import { useSetlists } from '../context/SetlistsContext';
import LanguageBadge from './LanguageBadge';
import ShareMenu from './ShareMenu';
import { showConfirmToast } from '../utils/toastDialogs';

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
const EMOJI_OPTIONS = ['🎵', '🎶', '🎤', '🎸', '🎹', '🥁', '🎷', '🎺', '🪕', '📀', '✨', '🔥', '📁'] as const;

function normalizeEmojiIcon(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return [...trimmed].slice(0, 2).join('');
}

export default function SetlistsView({
  setlistId,
  setlistName,
  songs,
  allSongs,
  onMoveSong,
  onRemoveSong,
  onAddSong,
}: Props) {
  const { renameSetlist, updateSetlistIcon, deleteSetlist, setlists } = useSetlists();
  const currentSetlist = setlists.find((l) => l.id === setlistId);
  const [draggingSongId, setDraggingSongId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(setlistName);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [showIconEditor, setShowIconEditor] = useState(false);
  const [iconDraft, setIconDraft] = useState(currentSetlist?.icon ?? '🎵');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRenaming = () => {
    setRenameValue(setlistName);
    setIsRenaming(true);
  };

  useEffect(() => {
    setIconDraft(currentSetlist?.icon ?? '🎵');
  }, [currentSetlist?.icon]);

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

  const handlePrintSetlist = () => {
    window.print();
  };

  const handleDeleteSetlist = async () => {
    const confirmed = await showConfirmToast(`Delete setlist "${setlistName}"? This cannot be undone.`, {
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    deleteSetlist(setlistId);
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
    setDropTargetIndex(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(SONG_DRAG_MIME, song.id);
    event.dataTransfer.setData(SONG_DRAG_FALLBACK_MIME, song.id);
    event.dataTransfer.setData('text/plain', song.title);
  };

  const handleSongDragEnd = () => {
    setDraggingSongId(null);
    setDropTargetIndex(null);
  };

  const isSongDrop = (event: React.DragEvent<HTMLElement>) => (
    event.dataTransfer.types.includes(SONG_DRAG_MIME)
      || event.dataTransfer.types.includes(SONG_DRAG_FALLBACK_MIME)
  );

  const handleDropSlotDragOver = (index: number, event: React.DragEvent<HTMLElement>) => {
    if (!isSongDrop(event)) return;

    const sourceSongId = event.dataTransfer.getData(SONG_DRAG_MIME) || draggingSongId;
    if (!sourceSongId) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetIndex((current) => (current === index ? current : index));
  };

  const handleDropSlotDrop = (index: number, event: React.DragEvent<HTMLElement>) => {
    if (!isSongDrop(event)) {
      return;
    }

    const sourceSongId = event.dataTransfer.getData(SONG_DRAG_MIME) || draggingSongId;
    if (!sourceSongId) {
      handleSongDragEnd();
      return;
    }

    const sourceIndex = songs.findIndex((song) => song.id === sourceSongId);
    if (sourceIndex < 0) {
      handleSongDragEnd();
      return;
    }

    const adjustedIndex = sourceIndex < index ? index - 1 : index;
    if (adjustedIndex === sourceIndex) {
      handleSongDragEnd();
      return;
    }

    const beforeSongId = songs[adjustedIndex]?.id ?? null;

    event.preventDefault();
    event.stopPropagation();
    onMoveSong(sourceSongId, beforeSongId);
    handleSongDragEnd();
  };

  const handleDropSlotDragLeave = (index: number) => {
    setDropTargetIndex((current) => (current === index ? null : current));
  };

  const handleListDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setDropTargetIndex(null);
  };

  const handleSongCardDragOver = (songIndex: number, event: React.DragEvent<HTMLElement>) => {
    if (!isSongDrop(event)) return;

    const sourceSongId = event.dataTransfer.getData(SONG_DRAG_MIME) || draggingSongId;
    if (!sourceSongId) return;

    const sourceIndex = songs.findIndex((song) => song.id === sourceSongId);
    if (sourceIndex < 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const insertIndex = event.clientY < rect.top + rect.height / 2 ? songIndex : songIndex + 1;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetIndex((current) => (current === insertIndex ? current : insertIndex));
  };

  const handleSongCardDrop = (songIndex: number, event: React.DragEvent<HTMLElement>) => {
    if (!isSongDrop(event)) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const insertIndex = event.clientY < rect.top + rect.height / 2 ? songIndex : songIndex + 1;
    handleDropSlotDrop(insertIndex, event);
  };

  return (
    <div className="setlist-view">
      <div className="song-list-sticky">
        <div className="setlist-header songlist-header">
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
              <div className="song-list-title-row">
                <h1 className="song-list-heading setlist-title" onDoubleClick={startRenaming}>
                  {currentSetlist?.icon ? <span className="song-list-heading-icon" aria-hidden="true">{currentSetlist.icon}</span> : null}
                  {setlistName}
                </h1>
                <button
                  type="button"
                  className="title-rename-btn"
                  onClick={startRenaming}
                  title="Rename setlist"
                  aria-label="Rename setlist"
                >
                  <PenLine size={14} />
                </button>
              </div>
            )}
            <p className="song-list-summary setlist-song-count">
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
                <Play size={14} />
              </Link>
            ) : (
              <button
                className="setlist-action-btn setlist-action-btn--concert"
                type="button"
                disabled
                title="Add songs to enable concert mode"
              >
                <Play size={14} />
              </button>
            )}
            <button
              className="setlist-action-btn setlist-action-btn--secondary"
              type="button"
              onClick={handlePrintSetlist}
              title={`Print ${setlistName}`}
            >
              <Printer size={14} />
            </button>
            <ShareMenu
              resourceType="setlist"
              resourceId={setlistId}
              resourceName={currentSetlist?.name ?? setlistName}
              buttonClassName="setlist-action-btn setlist-action-btn--secondary"
              buttonTitle="Share this setlist"
              iconOnly
            />
            <button
              className="setlist-action-btn setlist-action-btn--secondary"
              onClick={openSongPicker}
              title="Add songs"
            >
              <Plus size={14} />
            </button>
            <button
              className="setlist-action-btn setlist-action-btn--secondary"
              onClick={() => setShowIconEditor((value) => !value)}
              title="Set setlist icon"
            >
              <Smile size={14} />
            </button>
            <button
              className="setlist-action-btn setlist-action-btn--secondary"
              onClick={() => void handleDeleteSetlist()}
              title={`Delete setlist ${setlistName}`}
              aria-label={`Delete setlist ${setlistName}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {showIconEditor ? (
          <div className="list-appearance-editor" role="region" aria-label="Setlist icon settings">
          <div className="list-appearance-group">
            <span className="list-appearance-label">Emoji</span>
            <div className="emoji-choice-grid" role="listbox" aria-label="Setlist emoji options">
              {EMOJI_OPTIONS.map((emoji) => {
                const selected = iconDraft === emoji;
                return (
                  <button
                    key={emoji}
                    type="button"
                    className={`emoji-choice-btn${selected ? ' active' : ''}`}
                    onClick={() => setIconDraft(emoji)}
                    aria-label={`Choose icon ${emoji}`}
                    aria-pressed={selected}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            className="setlist-action-btn"
            onClick={() => {
              updateSetlistIcon(setlistId, normalizeEmojiIcon(iconDraft));
              setShowIconEditor(false);
            }}
          >
            Save
          </button>
          <button
            type="button"
            className="setlist-action-btn setlist-action-btn--secondary"
            onClick={() => {
              updateSetlistIcon(setlistId, undefined);
              setIconDraft('🎵');
              setShowIconEditor(false);
            }}
          >
            Reset
          </button>
        </div>
      ) : null}
      </div>{/* end song-list-sticky */}

      {songs.length === 0 ? (
        <div className="empty-state">
          <Music size={48} />
          <p>No songs in this setlist yet.</p>
          <p className="empty-state-hint">Drag songs from the library to add them.</p>
        </div>
      ) : (
        <ul
          className={`setlist-songs${draggingSongId ? ' is-dragging' : ''}`}
          onDragLeave={handleListDragLeave}
        >
          {songs.map((song, index) => (
            <Fragment key={song.id}>
              <li
                className={`setlist-drop-slot${dropTargetIndex === index ? ' active' : ''}`}
                onDragOver={(event) => handleDropSlotDragOver(index, event)}
                onDrop={(event) => handleDropSlotDrop(index, event)}
                onDragLeave={() => handleDropSlotDragLeave(index)}
                aria-hidden="true"
              />
              <li
                className={`setlist-song-item${draggingSongId === song.id ? ' dragging' : ''}`}
              >
                <div
                  className="setlist-song-card"
                  onDragOver={(event) => handleSongCardDragOver(index, event)}
                  onDrop={(event) => handleSongCardDrop(index, event)}
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
            </Fragment>
          ))}
          {songs.length > 0 && (
            <li
              className={`setlist-drop-slot setlist-drop-slot-end${dropTargetIndex === songs.length ? ' active' : ''}`}
              onDragOver={(event) => handleDropSlotDragOver(songs.length, event)}
              onDrop={(event) => handleDropSlotDrop(songs.length, event)}
              onDragLeave={() => handleDropSlotDragLeave(songs.length)}
              aria-hidden="true"
            />
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
                  <div
                    key={song.id}
                    className="song-picker-item"
                    role="listitem"
                  >
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
