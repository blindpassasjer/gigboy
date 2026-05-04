import { useEffect, useState, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Search,
  Music,
  LayoutGrid,
  Rows3,
  GripVertical,
  ArrowUpDown,
  Plus,
  X,
  SquarePen,
  PenLine,
  Trash2,
  ListMinus,
  Smile,
} from 'lucide-react';
import type { Song } from '../types';
import LanguageBadge from './LanguageBadge';
import { languageName } from '../utils/languages';
import { parseChordPro } from '../utils/chordParser';
import { ICON_OPTIONS } from '../lib/iconOptions';

type SortBy =
  | 'custom'
  | 'name-asc'
  | 'name-desc'
  | 'artist-asc'
  | 'artist-desc'
  | 'language'
  | 'date-asc'
  | 'date-desc';

const SORT_OPTIONS_WITH_CUSTOM: SortBy[] = ['custom', 'name-asc', 'name-desc', 'artist-asc', 'artist-desc', 'language', 'date-asc', 'date-desc'];
const SORT_OPTIONS_NO_CUSTOM: SortBy[] = ['name-asc', 'name-desc', 'artist-asc', 'artist-desc', 'language', 'date-asc', 'date-desc'];

function getInitialSortBy(canUseCustomOrder: boolean): SortBy {
  const fallback: SortBy = canUseCustomOrder ? 'custom' : 'name-asc';

  if (typeof window === 'undefined') {
    return fallback;
  }

  const stored = window.localStorage.getItem('folio-sort-by');
  if (!stored) {
    return fallback;
  }

  const allowed = canUseCustomOrder ? SORT_OPTIONS_WITH_CUSTOM : SORT_OPTIONS_NO_CUSTOM;
  return allowed.includes(stored as SortBy) ? (stored as SortBy) : fallback;
}

const SONG_DRAG_MIME = 'application/x-folio-song-id';
const SONG_DRAG_FALLBACK_MIME = 'text/x-folio-song-id';

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

function normalizeEmojiIcon(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return [...trimmed].slice(0, 2).join('');
}

interface Props {
  songs: Song[];
  listName?: string;
  listEntityLabel?: 'songlist' | 'band';
  headerMeta?: string;
  headerVariant?: 'songlist' | 'bands';
  headerActions?: ReactNode;
  onDeleteList?: () => void | Promise<void>;
  deleteListLabel?: string;
  listIcon?: string;
  allSongs?: Song[];
  onMoveSong?: (songId: string, beforeSongId: string | null) => void;
  onDeleteSong: (song: Song) => void | Promise<void>;
  canDeleteSong?: (song: Song) => boolean;
  onRenameList?: (name: string) => void | Promise<void>;
  onUpdateListAppearance?: (appearance: { icon?: string }) => void;
  onRemoveSong?: (song: Song) => void;
  onAddSong?: (songId: string) => void;
  onAddSongsClick?: () => void;
  pickerSourceNote?: string;
  /** When songs belong to a band, pass the bandId so SongView can use band recordings */
  bandId?: string;
}

export default function SongList({
  songs,
  listName,
  listEntityLabel = 'songlist',
  headerMeta,
  headerVariant = 'songlist',
  headerActions,
  onDeleteList,
  deleteListLabel,
  listIcon,
  allSongs,
  onMoveSong,
  onDeleteSong,
  canDeleteSong,
  onRenameList,
  onUpdateListAppearance,
  onRemoveSong,
  onAddSong,
  onAddSongsClick,
  pickerSourceNote,
  bandId,
}: Props) {
  const { pathname } = useLocation();
  const [query, setQuery] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'cards'>(
    () => (localStorage.getItem('folio-view-mode') === 'cards' ? 'cards' : 'list')
  );
  const [sortBy, setSortBy] = useState<SortBy>(() => getInitialSortBy(Boolean(onMoveSong)));

  function handleSetViewMode(mode: 'list' | 'cards') {
    localStorage.setItem('folio-view-mode', mode);
    setViewMode(mode);
  }

  function handleSetSortBy(sort: SortBy) {
    localStorage.setItem('folio-sort-by', sort);
    setSortBy(sort);
  }
  const [draggingSongId, setDraggingSongId] = useState<string | null>(null);
  const [dropTargetSongId, setDropTargetSongId] = useState<string | null>(null);
  const [dropAtEnd, setDropAtEnd] = useState(false);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [showListAppearanceEditor, setShowListAppearanceEditor] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(listName ?? '');
  const [listIconDraft, setListIconDraft] = useState(listIcon ?? '🎵');

  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(listName ?? '');
    }
  }, [listName, isRenaming]);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const songNodeRefs = useRef<Map<string, HTMLElement>>(new Map());
  const canDragReorder = Boolean(onMoveSong);
  const songPageStateBase = listName
    ? { backTo: pathname, backLabel: listName, bandId: bandId ?? undefined }
    : undefined;

  const canAddSongsToList = Boolean(allSongs && onAddSong);
  const canTriggerAddSongs = canAddSongsToList || Boolean(onAddSongsClick);

  const languages = useMemo(
    () => Array.from(new Set(songs.map((s) => s.language))).sort(),
    [songs]
  );

  const availableSongs = useMemo(() => {
    if (!allSongs) return [];

    const songIdsInList = new Set(songs.map((song) => song.id));
    return allSongs
      .filter((song) => !songIdsInList.has(song.id))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [allSongs, songs]);

  const filteredAvailableSongs = useMemo(() => {
    const normalizedQuery = pickerQuery.trim().toLowerCase();
    if (!normalizedQuery) return availableSongs;

    return availableSongs.filter((song) => {
      const inTitle = song.title.toLowerCase().includes(normalizedQuery);
      const inArtist = (song.artist ?? '').toLowerCase().includes(normalizedQuery);
      const inTags = (song.tags ?? []).some((tag) => tag.toLowerCase().includes(normalizedQuery));
      return inTitle || inArtist || inTags;
    });
  }, [availableSongs, pickerQuery]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const base = songs.filter((s) => {
      const matchesQuery =
        !q ||
        s.title.toLowerCase().includes(q) ||
        (s.artist ?? '').toLowerCase().includes(q) ||
        (s.tags ?? []).some((t) => t.toLowerCase().includes(q));
      const matchesLang = !langFilter || s.language === langFilter;
      return matchesQuery && matchesLang;
    });

    if (sortBy === 'custom') return base;

    const sorted = [...base];
    if (sortBy === 'name-asc') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'name-desc') {
      sorted.sort((a, b) => b.title.localeCompare(a.title));
    } else if (sortBy === 'artist-asc') {
      sorted.sort((a, b) => {
        const artistA = (a.artist ?? '').trim().toLowerCase();
        const artistB = (b.artist ?? '').trim().toLowerCase();
        return artistA.localeCompare(artistB) || a.title.localeCompare(b.title);
      });
    } else if (sortBy === 'artist-desc') {
      sorted.sort((a, b) => {
        const artistA = (a.artist ?? '').trim().toLowerCase();
        const artistB = (b.artist ?? '').trim().toLowerCase();
        return artistB.localeCompare(artistA) || a.title.localeCompare(b.title);
      });
    } else if (sortBy === 'language') {
      sorted.sort((a, b) => languageName(a.language).localeCompare(languageName(b.language)) || a.title.localeCompare(b.title));
    } else if (sortBy === 'date-asc') {
      sorted.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.title.localeCompare(b.title));
    } else if (sortBy === 'date-desc') {
      sorted.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.title.localeCompare(b.title));
    }
    return sorted;
  }, [songs, query, langFilter, sortBy]);

  const songPreviews = useMemo(
    () => Object.fromEntries(filtered.map((song) => [song.id, getSongPreview(song)])),
    [filtered]
  );

  useEffect(() => {
    setListIconDraft(listIcon ?? '🎵');
  }, [listIcon]);

  useEffect(() => {
    setRenameValue(listName ?? '');
  }, [listName]);

  useEffect(() => {
    if (!isRenaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenaming]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (showSongPicker) {
        setShowSongPicker(false);
        setPickerQuery('');
      }

      if (showListAppearanceEditor) {
        setShowListAppearanceEditor(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showSongPicker, showListAppearanceEditor]);

  const openSongPicker = () => {
    setPickerQuery('');
    setShowSongPicker(true);
  };

  const closeSongPicker = () => {
    setShowSongPicker(false);
    setPickerQuery('');
  };

  const handleApplyListAppearance = async () => {
    if (!onUpdateListAppearance) return;

    await onUpdateListAppearance({
      icon: normalizeEmojiIcon(listIconDraft),
    });
    setShowListAppearanceEditor(false);
  };

  const handleResetListAppearance = async () => {
    if (!onUpdateListAppearance) return;
    await onUpdateListAppearance({ icon: undefined });
    setListIconDraft('🎵');
    setShowListAppearanceEditor(false);
  };

  const commitRename = () => {
    if (!onRenameList || !listName) {
      setIsRenaming(false);
      return;
    }

    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== listName) {
      void onRenameList(trimmed);
    }

    setRenameValue(listName);
    setIsRenaming(false);
  };

  const handleSongDragStart = (song: Song, event: React.DragEvent<HTMLElement>) => {
    if (!canDragReorder) {
      return;
    }

    setDraggingSongId(song.id);
    setDropTargetSongId(null);
    setDropAtEnd(false);
    event.dataTransfer.effectAllowed = onMoveSong ? 'copyMove' : 'copy';
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
    if (!onMoveSong || !canDragReorder || !event.dataTransfer.types.includes(SONG_DRAG_MIME)) {
      return;
    }

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
    if (!onMoveSong || !canDragReorder || !event.dataTransfer.types.includes(SONG_DRAG_MIME)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetSongId((current) => (current === null ? current : null));
    setDropAtEnd((current) => (current ? current : true));
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

  const setSongNodeRef = (songId: string, node: HTMLElement | null) => {
    if (node) {
      songNodeRefs.current.set(songId, node);
      return;
    }

    songNodeRefs.current.delete(songId);
  };

  const resolveTouchDropTarget = (touchY: number) => {
    const entries = filtered
      .map((song) => {
        const node = songNodeRefs.current.get(song.id);
        if (!node) return null;
        return {
          id: song.id,
          midpoint: node.getBoundingClientRect().top + (node.getBoundingClientRect().height / 2),
        };
      })
      .filter((entry): entry is { id: string; midpoint: number } => Boolean(entry));

    for (const entry of entries) {
      if (touchY <= entry.midpoint) {
        return {
          beforeSongId: entry.id,
          highlightSongId: entry.id,
          atEnd: false,
        };
      }
    }

    return {
      beforeSongId: null,
      highlightSongId: null,
      atEnd: true,
    };
  };

  const updateTouchDropPreview = (touchY: number) => {
    const nextTarget = resolveTouchDropTarget(touchY);
    setDropTargetSongId(nextTarget.highlightSongId);
    setDropAtEnd(nextTarget.atEnd);
  };

  const handleSongTouchStart = (song: Song, event: React.TouchEvent<HTMLButtonElement>) => {
    if (!onMoveSong || event.touches.length !== 1) {
      return;
    }

    event.preventDefault();
    setDraggingSongId(song.id);
    updateTouchDropPreview(event.touches[0].clientY);
  };

  const handleSongTouchMove = (event: React.TouchEvent<HTMLButtonElement>) => {
    if (!onMoveSong || !draggingSongId || event.touches.length !== 1) {
      return;
    }

    event.preventDefault();
    updateTouchDropPreview(event.touches[0].clientY);
  };

  const handleSongTouchEnd = (event: React.TouchEvent<HTMLButtonElement>) => {
    if (!onMoveSong || !draggingSongId) {
      handleSongDragEnd();
      return;
    }

    const touch = event.changedTouches[0];
    const nextTarget = touch ? resolveTouchDropTarget(touch.clientY) : null;
    const beforeSongId = nextTarget
      ? nextTarget.beforeSongId
      : dropAtEnd
        ? null
        : dropTargetSongId;

    if (beforeSongId && beforeSongId === draggingSongId) {
      handleSongDragEnd();
      return;
    }

    onMoveSong(draggingSongId, beforeSongId ?? null);
    handleSongDragEnd();
  };

  const handleSongTouchCancel = () => {
    handleSongDragEnd();
  };

  return (
    <div className="song-list-page">
      <div className="song-list-sticky">
      <div className={`${headerVariant === 'bands' ? 'bands-header' : 'songlist-header'} setlist-header`}>
        <div className="setlist-title-block">
          {listName && (
            isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitRename();
                  if (event.key === 'Escape') {
                    setRenameValue(listName);
                    setIsRenaming(false);
                  }
                }}
                onBlur={commitRename}
                className="setlist-name-input"
              />
            ) : (
              <div className="song-list-title-row">
                <h2 className="song-list-heading setlist-title">
                  {listIcon && <span className="song-list-heading-icon" aria-hidden="true">{listIcon}</span>}
                  <span>{listName}</span>
                </h2>
                {onRenameList && (
                  <button
                    type="button"
                    className="title-rename-btn"
                    onClick={() => setIsRenaming(true)}
                    title={`Rename ${listEntityLabel}`}
                    aria-label={`Rename ${listEntityLabel}`}
                  >
                    <PenLine size={14} />
                  </button>
                )}
              </div>
            )
          )}
          <p className="song-list-summary setlist-song-count">{filtered.length} song{filtered.length === 1 ? '' : 's'}</p>
          {headerMeta ? <p className="song-list-summary setlist-song-count">{headerMeta}</p> : null}
        </div>
        <div className="setlist-header-actions">
          {headerActions}
          {onUpdateListAppearance && listName && (
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary"
              onClick={() => setShowListAppearanceEditor((value) => !value)}
              title={`Set ${listEntityLabel} icon`}
            >
              <Smile size={14} />
            </button>
          )}
          {canTriggerAddSongs && (
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary setlist-action-btn--accent"
              onClick={canAddSongsToList ? openSongPicker : onAddSongsClick}
              title="Add songs"
            >
              <Plus size={14} />
            </button>
          )}
          <div className="view-toggle" role="tablist" aria-label="Song view mode">
            <button
              type="button"
              className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
              onClick={() => handleSetViewMode('list')}
              aria-pressed={viewMode === 'list'}
            >
              <Rows3 size={15} />
            </button>
            <button
              type="button"
              className={`view-toggle-btn${viewMode === 'cards' ? ' active' : ''}`}
              onClick={() => handleSetViewMode('cards')}
              aria-pressed={viewMode === 'cards'}
            >
              <LayoutGrid size={15} />
            </button>
          </div>
          {onDeleteList && (
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary"
              onClick={() => void onDeleteList()}
              title={deleteListLabel ?? `Delete ${listEntityLabel}`}
              aria-label={deleteListLabel ?? `Delete ${listEntityLabel}`}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      {showListAppearanceEditor && onUpdateListAppearance && (
        <div className="list-appearance-editor" role="region" aria-label={`${listEntityLabel} icon settings`}>
          <div className="list-appearance-group">
            <span className="list-appearance-label">Icon</span>
            <div className="emoji-choice-grid" role="listbox" aria-label={`${listEntityLabel} icon options`}>
              {ICON_OPTIONS.map((emoji) => {
                const selected = listIconDraft === emoji;
                return (
                  <button
                    key={emoji}
                    type="button"
                    className={`emoji-choice-btn${selected ? ' active' : ''}`}
                    onClick={() => setListIconDraft(emoji)}
                    aria-label={`Choose icon ${emoji}`}
                    aria-pressed={selected}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>
          <button type="button" className="setlist-action-btn" onClick={() => void handleApplyListAppearance()}>Save</button>
          <button type="button" className="setlist-action-btn setlist-action-btn--secondary" onClick={() => void handleResetListAppearance()}>Reset</button>
        </div>
      )}
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
        <div className="sort-select-wrapper">
          <ArrowUpDown size={14} className="sort-select-icon" />
          <select
            value={sortBy}
            onChange={(e) => handleSetSortBy(e.target.value as SortBy)}
            className="lang-select sort-select"
            aria-label="Sort songs"
          >
            {onMoveSong && <option value="custom">Custom order</option>}
            <option value="name-asc">Song name A → Z</option>
            <option value="name-desc">Song name Z → A</option>
            <option value="artist-asc">Artist A → Z</option>
            <option value="artist-desc">Artist Z → A</option>
            <option value="language">Language</option>
            <option value="date-desc">Date added (newest first)</option>
            <option value="date-asc">Date added (oldest first)</option>
          </select>
        </div>
      </div>
      </div>{/* end song-list-sticky */}

      <div className="song-list-results">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Music size={48} />
            <p>No songs found.</p>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="song-card-grid" onDragOver={handleListEndDragOver} onDrop={handleListEndDrop}>
            {filtered.map((song) => {
              const songPageState = songPageStateBase
                ? { ...songPageStateBase }
                : undefined;

              return (
              <article
                key={song.id}
                className={`song-preview-card${dropTargetSongId === song.id ? ' drop-before' : ''}${draggingSongId === song.id ? ' is-dragging' : ''}`}
                ref={(node) => setSongNodeRef(song.id, node)}
                onDragOver={(event) => handleSongDragOver(song.id, event)}
                onDrop={(event) => handleSongDrop(song.id, event)}
              >
                {sortBy === 'custom' && onMoveSong && canDragReorder && (
                <button
                  type="button"
                  className="song-drag-handle"
                  draggable
                  onDragStart={(event) => handleSongDragStart(song, event)}
                  onDragEnd={handleSongDragEnd}
                  onTouchStart={(event) => handleSongTouchStart(song, event)}
                  onTouchMove={handleSongTouchMove}
                  onTouchEnd={handleSongTouchEnd}
                  onTouchCancel={handleSongTouchCancel}
                  aria-label={`Drag ${song.title}`}
                >
                  <GripVertical size={16} />
                </button>
                )}
                <Link to={`/songs/${song.id}`} state={songPageState} className="song-preview-card-link">
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
                  <Link
                    to={`/songs/${song.id}/edit`}
                    state={songPageState}
                    className="song-action-btn song-action-btn--edit"
                    title={`Edit ${song.title}`}
                    aria-label={`Edit ${song.title}`}
                  >
                    <SquarePen size={14} />
                  </Link>
                  {onRemoveSong && (
                    <button
                      className="song-action-btn song-action-btn--remove"
                      onClick={() => onRemoveSong(song)}
                      title={`Remove ${song.title}`}
                      aria-label={`Remove ${song.title}`}
                    >
                      <ListMinus size={14} />
                    </button>
                  )}
                  {(canDeleteSong?.(song) ?? true) ? (
                    <button
                      className="song-action-btn song-action-btn--delete"
                      onClick={() => onDeleteSong(song)}
                      title={`Delete ${song.title}`}
                      aria-label={`Delete ${song.title}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              </article>
              );
            })}
            {filtered.length > 0 && <div className={`song-reorder-dropzone${dropAtEnd ? ' active' : ''}`} aria-hidden="true" />}
          </div>
        ) : (
          <ul className="song-list" onDragOver={handleListEndDragOver} onDrop={handleListEndDrop}>
            {filtered.map((song) => {
              const songPageState = songPageStateBase
                ? { ...songPageStateBase }
                : undefined;

              return (
              <li
                key={song.id}
                className={dropTargetSongId === song.id ? 'drop-before' : ''}
                ref={(node) => setSongNodeRef(song.id, node)}
              >
                <div
                  className={`song-card${draggingSongId === song.id ? ' is-dragging' : ''}`}
                  onDragOver={(event) => handleSongDragOver(song.id, event)}
                  onDrop={(event) => handleSongDrop(song.id, event)}
                >
                  {sortBy === 'custom' && onMoveSong && canDragReorder && (
                  <button
                    type="button"
                    className="song-drag-handle"
                    draggable
                    onDragStart={(event) => handleSongDragStart(song, event)}
                    onDragEnd={handleSongDragEnd}
                    onTouchStart={(event) => handleSongTouchStart(song, event)}
                    onTouchMove={handleSongTouchMove}
                    onTouchEnd={handleSongTouchEnd}
                    onTouchCancel={handleSongTouchCancel}
                    aria-label={`Drag ${song.title}`}
                  >
                    <GripVertical size={16} />
                  </button>
                  )}
                  <Link to={`/songs/${song.id}`} state={songPageState} className="song-card-link">
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
                    <Link
                      to={`/songs/${song.id}/edit`}
                      state={songPageState}
                      className="song-action-btn song-action-btn--edit"
                      title={`Edit ${song.title}`}
                      aria-label={`Edit ${song.title}`}
                    >
                      <SquarePen size={14} />
                    </Link>
                    {onRemoveSong && (
                      <button
                        className="song-action-btn song-action-btn--remove"
                        onClick={() => onRemoveSong(song)}
                        title={`Remove ${song.title}`}
                        aria-label={`Remove ${song.title}`}
                      >
                        <ListMinus size={14} />
                      </button>
                    )}
                    {(canDeleteSong?.(song) ?? true) ? (
                      <button
                        className="song-action-btn song-action-btn--delete"
                        onClick={() => onDeleteSong(song)}
                        title={`Delete ${song.title}`}
                        aria-label={`Delete ${song.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
              );
            })}
            {filtered.length > 0 && <li className={`song-reorder-dropzone${dropAtEnd ? ' active' : ''}`} aria-hidden="true" />}
          </ul>
        )}
      </div>

      {showSongPicker && canAddSongsToList && (
        <div className="song-picker-overlay" role="dialog" aria-modal="true" aria-label="Add songs to songlist">
          <div className="song-picker-panel">
            <div className="song-picker-header">
              <h2>Add songs to {listName ?? 'songlist'}</h2>
              <button className="song-picker-close" onClick={closeSongPicker} aria-label="Close song picker">
                <X size={16} />
              </button>
            </div>
            {headerVariant === 'bands' && pickerSourceNote && (
              <p className="song-picker-source-note">{pickerSourceNote}</p>
            )}

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
                      onClick={() => onAddSong?.(song.id)}
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
