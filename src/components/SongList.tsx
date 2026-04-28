import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
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
  Trash2,
  ListMinus,
  Palette,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { Song } from '../types';
import LanguageBadge from './LanguageBadge';
import ShareMenu from './ShareMenu';
import { languageName } from '../utils/languages';
import { parseChordPro } from '../utils/chordParser';
import { buildSongSurfaceStyle, buildSongSurfaceStyleFromPalette } from '../utils/songColorStyles';

type SortBy =
  | 'custom'
  | 'name-asc'
  | 'name-desc'
  | 'artist-asc'
  | 'artist-desc'
  | 'language';

const SORT_OPTIONS_WITH_CUSTOM: SortBy[] = ['custom', 'name-asc', 'name-desc', 'artist-asc', 'artist-desc', 'language'];
const SORT_OPTIONS_NO_CUSTOM: SortBy[] = ['name-asc', 'name-desc', 'artist-asc', 'artist-desc', 'language'];

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

const COLOR_OPTIONS = [
  '#5c4fa6',
  '#2563eb',
  '#0f766e',
  '#16a34a',
  '#ca8a04',
  '#ea580c',
  '#dc2626',
  '#db2777',
  '#7c3aed',
  '#0e7490',
  '#64748b',
  '#374151',
] as const;

const EMOJI_OPTIONS = ['🎵', '🎶', '🎤', '🎸', '🎹', '🥁', '🎷', '🎺', '🪕', '📀', '✨', '🔥', '📁'] as const;

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

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate)) {
    return null;
  }

  return candidate.toLowerCase();
}

function normalizeEmojiIcon(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return [...trimmed].slice(0, 2).join('');
}

interface Props {
  songs: Song[];
  listName?: string;
  listColor?: string;
  songListColorsBySongId?: Record<string, string[]>;
  listIcon?: string;
  allSongs?: Song[];
  onMoveSong?: (songId: string, beforeSongId: string | null) => void;
  onDeleteSong: (song: Song) => void | Promise<void>;
  onSetSongColor?: (song: Song, color: string | undefined) => void | Promise<void>;
  onUpdateListAppearance?: (appearance: { color?: string; icon?: string }) => void;
  onRemoveSong?: (song: Song) => void;
  onAddSong?: (songId: string) => void;
  shareConfig?: {
    resourceId: string;
    resourceName: string;
    songsForPdf: Song[];
    disabled?: boolean;
  };
}

export default function SongList({
  songs,
  listName,
  listColor,
  songListColorsBySongId,
  listIcon,
  allSongs,
  onMoveSong,
  onDeleteSong,
  onSetSongColor,
  onUpdateListAppearance,
  onRemoveSong,
  onAddSong,
  shareConfig,
}: Props) {
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
  const [songColorPickerSongId, setSongColorPickerSongId] = useState<string | null>(null);
  const [listColorDraft, setListColorDraft] = useState(listColor ?? '#5c4fa6');
  const [listIconDraft, setListIconDraft] = useState(listIcon ?? '🎵');
  const songPageStateBase = onRemoveSong && listName
    ? { backTo: '/', backLabel: listName }
    : undefined;

  const canAddSongs = Boolean(allSongs && onAddSong);

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
    }
    return sorted;
  }, [songs, query, langFilter, sortBy]);

  const songPreviews = useMemo(
    () => Object.fromEntries(filtered.map((song) => [song.id, getSongPreview(song)])),
    [filtered]
  );

  useEffect(() => {
    setListColorDraft(listColor ?? '#5c4fa6');
  }, [listColor]);

  useEffect(() => {
    setListIconDraft(listIcon ?? '🎵');
  }, [listIcon]);

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

      if (songColorPickerSongId) {
        setSongColorPickerSongId(null);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showSongPicker, showListAppearanceEditor, songColorPickerSongId]);

  useEffect(() => {
    if (!songColorPickerSongId) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.song-color-picker-wrap')) return;
      setSongColorPickerSongId(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [songColorPickerSongId]);

  const openSongPicker = () => {
    setPickerQuery('');
    setShowSongPicker(true);
  };

  const closeSongPicker = () => {
    setShowSongPicker(false);
    setPickerQuery('');
  };

  const handleApplyListAppearance = () => {
    if (!onUpdateListAppearance) return;

    const normalizedColor = normalizeHexColor(listColorDraft);
    if (!normalizedColor) {
      toast.error('Please choose a valid color. Example: #4f46e5');
      return;
    }

    onUpdateListAppearance({
      color: normalizedColor,
      icon: normalizeEmojiIcon(listIconDraft),
    });
    setShowListAppearanceEditor(false);
  };

  const handleResetListAppearance = () => {
    if (!onUpdateListAppearance) return;
    onUpdateListAppearance({ color: undefined, icon: undefined });
    setListColorDraft('#5c4fa6');
    setListIconDraft('🎵');
    setShowListAppearanceEditor(false);
  };

  const handleSetSongColor = (song: Song, color: string | undefined) => {
    if (!onSetSongColor) return;
    onSetSongColor(song, color);
    setSongColorPickerSongId(null);
  };

  const handleSongDragStart = (song: Song, event: React.DragEvent<HTMLElement>) => {
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
    if (!onMoveSong || !event.dataTransfer.types.includes(SONG_DRAG_MIME)) {
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
    if (!onMoveSong || !event.dataTransfer.types.includes(SONG_DRAG_MIME)) {
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

  return (
    <div className="song-list-page">
      <div className="song-list-sticky">
      <div className="songlist-header setlist-header">
        <div className="setlist-title-block">
          {listName && (
            <h2 className="song-list-heading setlist-title">
              {listIcon && <span className="song-list-heading-icon" aria-hidden="true">{listIcon}</span>}
              <span>{listName}</span>
            </h2>
          )}
          <p className="song-list-summary setlist-song-count">{filtered.length} song{filtered.length === 1 ? '' : 's'}</p>
        </div>
        <div className="setlist-header-actions">
          {onUpdateListAppearance && listName && (
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary"
              onClick={() => setShowListAppearanceEditor((value) => !value)}
              title="Customize songlist color and icon"
            >
              <Palette size={14} /> Style list
            </button>
          )}
          {canAddSongs && (
            <ShareMenu
              resourceType="songlist"
              resourceId={shareConfig?.resourceId ?? ''}
              resourceName={shareConfig?.resourceName ?? listName ?? 'Songlist'}
              songsForPdf={shareConfig?.songsForPdf ?? songs}
              disabled={shareConfig?.disabled ?? !shareConfig?.resourceId}
              buttonClassName="setlist-action-btn setlist-action-btn--secondary"
              buttonTitle="Share this songlist"
            />
          )}
          {canAddSongs && (
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary"
              onClick={openSongPicker}
              title="Add songs"
            >
              <Plus size={14} /> Add songs
            </button>
          )}
          <div className="view-toggle" role="tablist" aria-label="Song view mode">
            <button
              type="button"
              className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
              onClick={() => handleSetViewMode('list')}
              aria-pressed={viewMode === 'list'}
            >
              <Rows3 size={15} /> List
            </button>
            <button
              type="button"
              className={`view-toggle-btn${viewMode === 'cards' ? ' active' : ''}`}
              onClick={() => handleSetViewMode('cards')}
              aria-pressed={viewMode === 'cards'}
            >
              <LayoutGrid size={15} /> Cards
            </button>
          </div>
        </div>
      </div>
      {showListAppearanceEditor && onUpdateListAppearance && (
        <div className="list-appearance-editor" role="region" aria-label="Songlist style settings">
          <div className="list-appearance-group">
            <span className="list-appearance-label">Color</span>
            <div className="color-swatch-grid" role="listbox" aria-label="Songlist color options">
              {COLOR_OPTIONS.map((color) => {
                const selected = normalizeHexColor(listColorDraft) === color;
                return (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch-btn${selected ? ' active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setListColorDraft(color)}
                    aria-label={`Choose color ${color}`}
                    aria-pressed={selected}
                  />
                );
              })}
            </div>
          </div>
          <div className="list-appearance-group">
            <span className="list-appearance-label">Emoji</span>
            <div className="emoji-choice-grid" role="listbox" aria-label="Songlist emoji options">
              {EMOJI_OPTIONS.map((emoji) => {
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
          <label className="list-appearance-field">
            <span>Custom color</span>
            <input
              type="color"
              value={normalizeHexColor(listColorDraft) ?? '#5c4fa6'}
              onChange={(event) => setListColorDraft(event.target.value)}
            />
          </label>
          <button type="button" className="setlist-action-btn" onClick={handleApplyListAppearance}>Save</button>
          <button type="button" className="setlist-action-btn setlist-action-btn--secondary" onClick={handleResetListAppearance}>Reset</button>
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
          </select>
        </div>
      </div>
      </div>{/* end song-list-sticky */}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Music size={48} />
          <p>No songs found.</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="song-card-grid" onDragOver={handleListEndDragOver} onDrop={handleListEndDrop}>
          {filtered.map((song) => {
            const songListColors = songListColorsBySongId?.[song.id] ?? [];
            const effectiveSongColor = song.color ?? listColor ?? songListColors[0];
            const cardStyle =
              !song.color && !listColor && songListColors.length > 1
                ? buildSongSurfaceStyleFromPalette(songListColors)
                : buildSongSurfaceStyle(effectiveSongColor);
            const songPageState = songPageStateBase
              ? { ...songPageStateBase, accentColor: effectiveSongColor }
              : undefined;

            return (
            <article
              key={song.id}
              className={`song-preview-card${dropTargetSongId === song.id ? ' drop-before' : ''}`}
              style={cardStyle}
              onDragOver={(event) => handleSongDragOver(song.id, event)}
              onDrop={(event) => handleSongDrop(song.id, event)}
            >
              {sortBy === 'custom' && onMoveSong && (
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
                  className="song-action-btn song-action-btn--edit"
                  title={`Edit ${song.title}`}
                  aria-label={`Edit ${song.title}`}
                >
                  <SquarePen size={14} />
                </Link>
                {onSetSongColor && (
                  <div className="song-color-picker-wrap">
                    <button
                      className="song-action-btn song-action-btn--color"
                      onClick={() => setSongColorPickerSongId((current) => (current === song.id ? null : song.id))}
                      title={`Set color for ${song.title}`}
                      aria-label={`Set color for ${song.title}`}
                    >
                      <Palette size={14} />
                    </button>
                    {songColorPickerSongId === song.id && (
                      <div className="song-color-picker" role="menu" aria-label={`Color options for ${song.title}`}>
                        <button
                          type="button"
                          className="song-color-picker-clear"
                          onClick={() => handleSetSongColor(song, undefined)}
                        >
                          Use list color
                        </button>
                        <div className="color-swatch-grid color-swatch-grid--compact">
                          {COLOR_OPTIONS.map((color) => (
                            <button
                              key={`${song.id}-${color}`}
                              type="button"
                              className={`color-swatch-btn${song.color === color ? ' active' : ''}`}
                              style={{ backgroundColor: color }}
                              onClick={() => handleSetSongColor(song, color)}
                              aria-label={`Set song color ${color}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
                <button
                  className="song-action-btn song-action-btn--delete"
                  onClick={() => onDeleteSong(song)}
                  title={`Delete ${song.title}`}
                  aria-label={`Delete ${song.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
            );
          })}
          {filtered.length > 0 && <div className={`song-reorder-dropzone${dropAtEnd ? ' active' : ''}`} aria-hidden="true" />}
        </div>
      ) : (
        <ul className="song-list" onDragOver={handleListEndDragOver} onDrop={handleListEndDrop}>
          {filtered.map((song) => {
            const songListColors = songListColorsBySongId?.[song.id] ?? [];
            const effectiveSongColor = song.color ?? listColor ?? songListColors[0];
            const cardStyle =
              !song.color && !listColor && songListColors.length > 1
                ? buildSongSurfaceStyleFromPalette(songListColors)
                : buildSongSurfaceStyle(effectiveSongColor);
            const songPageState = songPageStateBase
              ? { ...songPageStateBase, accentColor: effectiveSongColor }
              : undefined;

            return (
            <li key={song.id} className={dropTargetSongId === song.id ? 'drop-before' : ''}>
              <div
                className="song-card"
                style={cardStyle}
                onDragOver={(event) => handleSongDragOver(song.id, event)}
                onDrop={(event) => handleSongDrop(song.id, event)}
              >
                {sortBy === 'custom' && onMoveSong && (
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
                    className="song-action-btn song-action-btn--edit"
                    title={`Edit ${song.title}`}
                    aria-label={`Edit ${song.title}`}
                  >
                    <SquarePen size={14} />
                  </Link>
                  {onSetSongColor && (
                    <div className="song-color-picker-wrap">
                      <button
                        className="song-action-btn song-action-btn--color"
                        onClick={() => setSongColorPickerSongId((current) => (current === song.id ? null : song.id))}
                        title={`Set color for ${song.title}`}
                        aria-label={`Set color for ${song.title}`}
                      >
                        <Palette size={14} />
                      </button>
                      {songColorPickerSongId === song.id && (
                        <div className="song-color-picker" role="menu" aria-label={`Color options for ${song.title}`}>
                          <button
                            type="button"
                            className="song-color-picker-clear"
                            onClick={() => handleSetSongColor(song, undefined)}
                          >
                            Use list color
                          </button>
                          <div className="color-swatch-grid color-swatch-grid--compact">
                            {COLOR_OPTIONS.map((color) => (
                              <button
                                key={`${song.id}-${color}`}
                                type="button"
                                className={`color-swatch-btn${song.color === color ? ' active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => handleSetSongColor(song, color)}
                                aria-label={`Set song color ${color}`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                  <button
                    className="song-action-btn song-action-btn--delete"
                    onClick={() => onDeleteSong(song)}
                    title={`Delete ${song.title}`}
                    aria-label={`Delete ${song.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </li>
            );
          })}
          {filtered.length > 0 && <li className={`song-reorder-dropzone${dropAtEnd ? ' active' : ''}`} aria-hidden="true" />}
        </ul>
      )}

      {showSongPicker && canAddSongs && (
        <div className="song-picker-overlay" role="dialog" aria-modal="true" aria-label="Add songs to songlist">
          <div className="song-picker-panel">
            <div className="song-picker-header">
              <h2>Add songs to {listName ?? 'songlist'}</h2>
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
