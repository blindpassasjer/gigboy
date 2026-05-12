import { useState, useRef, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronUp,
  ChevronDown,
  RotateCcw,
  ListPlus,
  Wrench,
  SlidersHorizontal,
  Check,
  Plus,
  FileUp,
  SquarePen,
  PenLine,
  Trash2,
  Play,
  Mic,
  AudioLines,
  Metronome,
} from 'lucide-react';
import toast from '../utils/anchoredToast';
import type { HandNoteStroke, Song } from '../types';
import ChordDisplay from './ChordDisplay';
import ChordDiagram, { type DiagramInstrument } from './ChordDiagram';
import LanguageBadge from './LanguageBadge';
import VisualMetronome from './VisualMetronome';
import VisualTuner from './VisualTuner';
import { transposeChord } from '../utils/chordParser';
import type { ChordNotation } from '../utils/chordParser';
import { useSongLists } from '../context/SongListsContext';
import { useBands } from '../context/BandsContext';
import { useSongs } from '../context/SongsContext';
import { useAuth } from '../context/AuthContext';
import { usePlan, useBandPlan } from '../hooks/usePlan';
import { useSongHandNotes } from '../hooks/useSongHandNotes';
import { buildSongSurfaceStyle } from '../utils/songColorStyles';
import { showConfirmToast, showPromptToast } from '../utils/toastDialogs';
import { getUserNoteColor } from '../lib/userColors';
import SongHandNotesOverlay from './SongHandNotesOverlay';
import SongMediaPlayer from './SongMediaPlayer';
import SongRecorder from './SongRecorder';
import { parseSongMedia } from '../utils/songMedia';
import { parseImportedSongFile, SONG_TEXT_IMPORT_ACCEPT } from '../utils/songImport';

interface Props {
  song: Song;
  accentColor?: string;
  /** Present when song is viewed from a band context */
  bandId?: string;
}

interface ActiveChord {
  chord: string;
  rect: DOMRect;
}

type SongPageState = {
  backTo?: string;
  backLabel?: string;
  bandId?: string;
};

export default function SongView({ song, accentColor, bandId }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const pageState = location.state as SongPageState | null;
  const [transpose, setTranspose] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [chordInstrument, setChordInstrument] = useState<DiagramInstrument>('guitar');
  const [chordNotation, setChordNotation] = useState<ChordNotation>('anglo');
  const [activeChord, setActiveChord] = useState<ActiveChord | null>(null);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [updatingFromFile, setUpdatingFromFile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const updateFromFileInputRef = useRef<HTMLInputElement>(null);
  const { updateSong, deleteSong } = useSongs();
  const { songLists, addSongToList, removeSongFromList } = useSongLists();
  const {
    bands,
    bandSongListsByBandId,
    updateBandSong,
    addSongToBandSongList,
    removeSongFromBandSongList,
    removeSongFromBandLibrary,
  } = useBands();
  const effectiveSongLists = bandId ? (bandSongListsByBandId[bandId] ?? []) : songLists;
  const { user } = useAuth();
  const availableBands = bands ?? [];
  
  // Use band plan if viewing from band context, otherwise use personal plan
  const band = bandId ? (availableBands.find((b) => b.id === bandId) ?? null) : null;
  const userPlanState = usePlan();
  const bandPlanState = useBandPlan(band);
  const { canUse } = bandId && band ? bandPlanState : userPlanState;

  // DIAGNOSTIC LOGGING: Remove after debugging
  if (typeof window !== 'undefined') {
    // Only log once per mount
    useEffect(() => {
      // Log band, bandPlanState, and metronome access
      // Avoid logging large objects repeatedly
      // eslint-disable-next-line no-console
      console.log('[SongView DIAG]', {
        bandId,
        band,
        bandPlanState,
        canUseMetronome: canUse('metronome'),
      });
    }, [bandId, band, bandPlanState, canUse]);
  }

  // Hand notes state
  const [showNotes, setShowNotes] = useState(false);
  const [drawEnabled, setDrawEnabled] = useState(false);
  const [undoStack, setUndoStack] = useState<HandNoteStroke[][]>([]);
  const [showMetronome, setShowMetronome] = useState(false);
  const [showTuner, setShowTuner] = useState(false);
  const [showMediaPlayer, setShowMediaPlayer] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [autoPlayMediaOnOpen, setAutoPlayMediaOnOpen] = useState(false);
  const media = song.playbackUrl ? parseSongMedia(song.playbackUrl) : null;
  const canDeleteSong = !song.ownerId || song.accessRole === 'owner';
  const songPageState = pageState ?? (bandId
    ? {
      backTo: `/bands/${bandId}/library`,
      backLabel: 'Band library',
      bandId,
    }
    : undefined);

  const handNotes = useSongHandNotes({
    ownerId: song.ownerId ?? user?.id ?? null,
    bandId: bandId ?? null,
    songId: song.id,
    user,
    enabled: Boolean(user && song.id),
  });

  const handleStrokesChange = useCallback((strokes: HandNoteStroke[], viewport: { width: number; height: number }) => {
    setUndoStack((prev) => [...prev, handNotes.myStrokes]);
    handNotes.saveMyNotes(strokes, viewport);
  }, [handNotes]);

  const handleUndoStroke = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const before = prev[prev.length - 1];
      const next = prev.slice(0, prev.length - 1);
      const canvas = document.querySelector('.song-hand-notes-overlay') as HTMLDivElement | null;
      const rect = canvas?.getBoundingClientRect();
      handNotes.saveMyNotes(before ?? [], {
        width: rect?.width ?? window.innerWidth,
        height: rect?.height ?? window.innerHeight,
      });
      return next;
    });
  }, [handNotes]);

  const handleClearNotes = useCallback(async () => {
    setUndoStack([]);
    await handNotes.clearMyNotes();
  }, [handNotes]);

  const handleToggleNotes = useCallback((next: boolean) => {
    setShowNotes(next);
    if (!next) {
      setDrawEnabled(false);
    }
  }, []);

  const handleToggleDraw = useCallback((next: boolean) => {
    setDrawEnabled(next);
    if (next && !showNotes) {
      setShowNotes(true);
    }
  }, [showNotes]);

  useEffect(() => {
    if (!listMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setListMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [listMenuOpen]);

  // Close chord diagram when song changes
  useEffect(() => { setActiveChord(null); }, [song.id]);
  useEffect(() => {
    setShowMetronome(false);
    setShowTuner(false);
    setShowMediaPlayer(false);
    setShowRecorder(false);
    setAutoPlayMediaOnOpen(false);
    setShowNotes(false);
    setDrawEnabled(false);
  }, [song.id]);

  useEffect(() => {
    setTranspose(song.preferredTranspose ?? 0);
  }, [song.id, song.preferredTranspose]);

  const handleChordClick = useCallback((chord: string, rect: DOMRect) => {
    setActiveChord(prev =>
      prev?.chord === chord && prev.rect.top === rect.top ? null : { chord, rect }
    );
  }, []);

  async function handleRename() {
    const nextTitle = await showPromptToast('Rename song', {
      initialValue: song.title,
      confirmLabel: 'Rename',
    });
    if (nextTitle === null) return;
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === song.title) return;
    const nextSong = {
      ...song,
      title: trimmed,
      updatedAt: new Date().toISOString(),
    };
    const err = bandId
      ? await updateBandSong(bandId, nextSong)
      : await updateSong(nextSong);
    if (err) {
      toast.error(`Could not rename song: ${err}`);
    }
  }

  async function handleDelete() {
    if (!canDeleteSong) {
      toast.error('Only the song owner can move this song to trash.');
      return;
    }

    const confirmed = await showConfirmToast(`Move "${song.title}" to trash? It will be automatically deleted after 30 days.`, {
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;

    if (bandId) {
      const error = await removeSongFromBandLibrary(bandId, song.id);
      if (error) {
        toast.error(error);
        return;
      }

      toast.success('Song moved to band trash.');
      navigate(songPageState?.backTo ?? `/bands/${bandId}/library`, songPageState ? { state: songPageState } : undefined);
      return;
    }

    await deleteSong(song.id);
    navigate(songPageState?.backTo ?? '/', songPageState ? { state: songPageState } : undefined);
  }

  async function handlePinTranspose() {
    const nextSong: Song = {
      ...song,
      preferredTranspose: transpose,
      updatedAt: new Date().toISOString(),
    };

    const err = bandId
      ? await updateBandSong(bandId, nextSong)
      : await updateSong(nextSong);

    if (err) {
      toast.error(`Could not save pinned transpose: ${err}`);
      return;
    }

    toast.success(
      transpose === 0
        ? 'Pinned to original key for this song.'
        : `Pinned ${transpose > 0 ? '+' : ''}${transpose} semitones for this song.`
    );
  }

  async function handleUpdateFromFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    setUpdatingFromFile(true);
    try {
      const imported = await parseImportedSongFile(file);
      const nextSong: Song = {
        ...song,
        title: imported.title || song.title,
        artist: imported.artist ?? song.artist,
        author: imported.author ?? song.author,
        language: imported.language ?? song.language,
        secondaryLanguages: imported.secondaryLanguages ?? song.secondaryLanguages,
        tags: imported.tags ?? song.tags,
        key: imported.key ?? song.key,
        capo: imported.capo ?? song.capo,
        tempo: imported.tempo ?? song.tempo,
        timeSignature: imported.timeSignature ?? song.timeSignature,
        chordpro: imported.chordpro,
        updatedAt: new Date().toISOString(),
      };

      const error = bandId
        ? await updateBandSong(bandId, nextSong)
        : await updateSong(nextSong);

      if (error) {
        toast.error(`Could not update song from file: ${error}`);
        return;
      }

      if (imported.warnings.length > 0) {
        toast.success(`Updated from ${file.name} with ${imported.warnings.length} warning${imported.warnings.length === 1 ? '' : 's'}.`);
      } else {
        toast.success(`Updated from ${file.name}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import this file.';
      toast.error(message);
    } finally {
      setUpdatingFromFile(false);
      if (updateFromFileInputRef.current) {
        updateFromFileInputRef.current.value = '';
      }
    }
  }

  const headerStyle = accentColor
    ? ({
      ...buildSongSurfaceStyle(accentColor),
      '--song-header-accent': accentColor,
    } as CSSProperties)
    : undefined;
  const isTransposePinned = song.preferredTranspose === transpose;

  return (
    <div className="song-view">
      <div className="song-view-header" style={headerStyle}>
        <div className="song-view-title-block">
          <div className="song-view-title-row">
            <h1 className="song-view-title">{song.title}</h1>
            <button
              className="song-action-btn song-action-btn--rename"
              onClick={handleRename}
              title={`Rename ${song.title}`}
              aria-label={`Rename ${song.title}`}
            >
              <PenLine size={14} />
            </button>
          </div>
          {song.artist && <p className="song-view-artist">{song.artist}</p>}
          {song.author && <p className="song-view-author">{song.author}</p>}
          <div className="song-view-badges">
            <LanguageBadge code={song.language} />
            {song.secondaryLanguages?.map((l) => <LanguageBadge key={l} code={l} />)}
            {song.tags?.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
        </div>

        <div className="song-view-toolbar">
          <section className="song-toolbar-section song-toolbar-section--settings">
            <div className="song-toolbar-section-head">
              <h2 className="song-toolbar-section-title"><SlidersHorizontal size={14} /> Settings</h2>
            </div>

            <div className="song-toolbar-row song-toolbar-row--controls">
              <div className="transpose-control song-toolbar-controls-group">
                <button
                  onClick={() => setTranspose((t) => t - 1)}
                  aria-label="Transpose down"
                  className="transpose-btn song-toolbar-tool-btn song-toolbar-setting-btn"
                >
                  <ChevronDown size={16} />
                </button>
                <span className="transpose-label song-toolbar-tool-btn song-toolbar-setting-label">
                  {song.key
                    ? transpose === 0
                      ? `Key of ${song.key}`
                      : `Key of ${transposeChord(song.key, transpose)}`
                    : transpose === 0
                      ? 'Original key'
                      : `${transpose > 0 ? '+' : ''}${transpose} semitones`}
                </span>
                <button
                  onClick={() => setTranspose((t) => t + 1)}
                  aria-label="Transpose up"
                  className="transpose-btn song-toolbar-tool-btn song-toolbar-setting-btn"
                >
                  <ChevronUp size={16} />
                </button>
                {transpose !== 0 && (
                  <button
                    onClick={() => setTranspose(0)}
                    aria-label="Reset transpose"
                    className="transpose-btn transpose-btn--reset song-toolbar-tool-btn song-toolbar-setting-btn"
                    title="Reset to original key"
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
                <button
                  onClick={() => { void handlePinTranspose(); }}
                  aria-label="Pin current transpose"
                  className={`transpose-btn transpose-btn--pin song-toolbar-tool-btn song-toolbar-setting-btn${isTransposePinned ? ' transpose-btn--pin-active' : ''}`}
                  title={isTransposePinned ? 'This transposition is already pinned' : 'Pin this transposition for this song'}
                >
                  {isTransposePinned ? 'Pinned' : 'Pin'}
                </button>
              </div>

              <div className="instrument-toggle song-toolbar-controls-group">
                <button
                  type="button"
                  className={`instrument-toggle-btn${showChords ? ' instrument-toggle-btn--active' : ''}`}
                  onClick={() => {
                    setShowChords((prev) => {
                      const next = !prev;
                      if (!next) setActiveChord(null);
                      return next;
                    });
                  }}
                  aria-label={showChords ? 'Hide chords' : 'Show chords'}
                  title={showChords ? 'Hide chords' : 'Show chords'}
                >
                  Chords
                </button>
              </div>

              {showChords && (
                <>
                  <div className="instrument-toggle">
                    <button
                      className={`instrument-toggle-btn${chordInstrument === 'guitar' ? ' instrument-toggle-btn--active' : ''}`}
                      onClick={() => { setChordInstrument('guitar'); setActiveChord(null); }}
                    >
                      Guitar
                    </button>
                    <button
                      className={`instrument-toggle-btn${chordInstrument === 'piano' ? ' instrument-toggle-btn--active' : ''}`}
                      onClick={() => { setChordInstrument('piano'); setActiveChord(null); }}
                    >
                      Piano
                    </button>
                  </div>

                  <div className="instrument-toggle">
                    <button
                      className={`instrument-toggle-btn${chordNotation === 'anglo' ? ' instrument-toggle-btn--active' : ''}`}
                      onClick={() => setChordNotation('anglo')}
                    >
                      C D E
                    </button>
                    <button
                      className={`instrument-toggle-btn${chordNotation === 'spanish' ? ' instrument-toggle-btn--active' : ''}`}
                      onClick={() => setChordNotation('spanish')}
                    >
                      Do Re Mi
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="song-toolbar-row song-toolbar-row--meta">
              {song.capo !== undefined && song.capo > 0 && (
                <span className="capo-badge">Capo {song.capo}</span>
              )}
              {song.timeSignature && <span className="meta-pill">{song.timeSignature}</span>}
            </div>
          </section>

          <section className="song-toolbar-section song-toolbar-section--tools">
            <div className="song-toolbar-section-head">
              <h2 className="song-toolbar-section-title"><Wrench size={14} /> Tools</h2>
            </div>

            <div className="song-toolbar-row song-toolbar-row--tool-switches">
              <button
                type="button"
                className={`song-toolbar-tool-btn${showTuner ? ' song-toolbar-tool-btn--active' : ''}`}
                onClick={() => setShowTuner((prev) => !prev)}
                title={showTuner ? 'Hide tuner' : 'Show tuner'}
                aria-label={showTuner ? 'Hide tuner' : 'Show tuner'}
              >
                <AudioLines size={14} />
                Tuner
              </button>

              <button
                type="button"
                className={`song-toolbar-tool-btn${showMetronome ? ' song-toolbar-tool-btn--active' : ''}${!canUse('metronome') ? ' song-toolbar-tool-btn--locked' : ''}`}
                onClick={() => {
                  if (!canUse('metronome')) {
                    toast.error('The metronome requires a Pro or Crew plan.', { action: { label: 'Upgrade', href: '/upgrade' } });
                    return;
                  }
                  setShowMetronome((prev) => !prev);
                }}
                title={!canUse('metronome') ? 'Upgrade to Pro, Crew, or join a Crew band to use the metronome' : (showMetronome ? 'Hide metronome' : 'Show metronome')}
                aria-label={showMetronome ? 'Hide metronome' : 'Show metronome'}
              >
                <Metronome size={14} />
                Metronome
              </button>

              {user && (
                <button
                  type="button"
                  className={`song-toolbar-tool-btn${showNotes ? ' song-toolbar-tool-btn--active' : ''}`}
                  onClick={() => handleToggleNotes(!showNotes)}
                  title={showNotes ? 'Hide handwritten notes' : 'Show handwritten notes'}
                  aria-label={showNotes ? 'Hide handwritten notes' : 'Show handwritten notes'}
                >
                  <PenLine size={14} />
                  Notes
                </button>
              )}

              {media && (
                <button
                  type="button"
                  className={`song-toolbar-tool-btn${showMediaPlayer ? ' song-toolbar-tool-btn--active' : ''}`}
                  onClick={() => {
                    setShowMediaPlayer((prev) => {
                      const next = !prev;
                      if (next) {
                        setAutoPlayMediaOnOpen(true);
                      }
                      return next;
                    });
                  }}
                  title={showMediaPlayer ? 'Hide playback' : 'Open playback and play'}
                  aria-label={showMediaPlayer ? 'Hide playback' : 'Open playback and play'}
                >
                  <Play size={14} />
                  Playback
                </button>
              )}

              {user && (
                <button
                  type="button"
                  className={`song-toolbar-tool-btn${showRecorder ? ' song-toolbar-tool-btn--active' : ''}`}
                  onClick={() => setShowRecorder((prev) => !prev)}
                  title={showRecorder ? 'Hide recorder' : 'Show recorder'}
                  aria-label={showRecorder ? 'Hide recorder' : 'Show recorder'}
                >
                  <Mic size={14} />
                  Recorder
                </button>
              )}
            </div>

            {(showMetronome || showTuner || (media && showMediaPlayer && song.playbackUrl) || (user && showNotes) || (user && showRecorder)) && (
              <div className="song-toolbar-tools-grid">
                {showTuner && (
                  <div className="song-toolbar-tool-card">
                    <span className="song-toolbar-tool-card-title">
                      <AudioLines size={13} />
                      Tuner
                    </span>
                    <VisualTuner className="song-view-tuner" />
                  </div>
                )}

                {showMetronome && (
                  <div className="song-toolbar-tool-card">
                    <span className="song-toolbar-tool-card-title">
                      <Metronome size={13} />
                      Metronome
                    </span>
                    <VisualMetronome
                      tempo={song.tempo}
                      timeSignature={song.timeSignature}
                      className="song-view-metronome"
                    />
                  </div>
                )}

                {user && showNotes && (
                  <div className="song-toolbar-tool-card song-toolbar-tool-card--notes">
                    <span className="song-toolbar-tool-card-title">Handwritten notes</span>
                    <div className="song-notes-panel">
                      <label
                        className={`toggle-label toggle-label--draw song-notes-draw-toggle${drawEnabled ? ' toggle-label--draw-active' : ''}`}
                        title="Enable touch drawing"
                      >
                        <input
                          type="checkbox"
                          checked={drawEnabled}
                          onChange={(e) => handleToggleDraw(e.target.checked)}
                        />
                        Draw
                      </label>

                      {drawEnabled && (
                        <>
                          <button
                            className="notes-toolbar-btn"
                            onClick={handleUndoStroke}
                            disabled={undoStack.length === 0}
                            title="Undo last stroke"
                          >
                            Undo
                          </button>
                          <button
                            className="notes-toolbar-btn notes-toolbar-btn--danger"
                            onClick={handleClearNotes}
                            disabled={handNotes.myStrokes.length === 0}
                            title="Clear my notes"
                          >
                            Clear
                          </button>
                        </>
                      )}

                      {handNotes.authors.length > 0 && (
                        <div className="notes-author-filters">
                          {handNotes.authors.length > 1 && (
                            <button
                              className={`notes-author-chip${handNotes.visibleAuthorIds.length === handNotes.authors.length ? ' notes-author-chip--active' : ''}`}
                              onClick={handNotes.showAll}
                              title="Show all users' notes"
                            >
                              All
                            </button>
                          )}
                          {handNotes.authors.map((author) => (
                            <button
                              key={author.uid}
                              className={`notes-author-chip${handNotes.visibleAuthorIds.includes(author.uid) ? ' notes-author-chip--on' : ''}`}
                              onClick={() => handNotes.toggleVisibleAuthor(author.uid)}
                              title={`Toggle notes by ${author.name}`}
                            >
                              {author.avatar ? (
                                <span className="notes-author-chip-avatar">{author.avatar}</span>
                              ) : (
                                <span className="notes-author-chip-initials">
                                  {author.name.slice(0, 1).toUpperCase()}
                                </span>
                              )}
                              {author.uid === user.id ? 'Me' : author.name}
                            </button>
                          ))}
                        </div>
                      )}

                      {handNotes.saveState === 'saving' && (
                        <span className="notes-save-status notes-save-status--saving">Saving…</span>
                      )}
                      {handNotes.saveState === 'saved' && (
                        <span className="notes-save-status notes-save-status--saved">Saved</span>
                      )}
                      {handNotes.saveState === 'error' && (
                        <span className="notes-save-status notes-save-status--error">Failed to save</span>
                      )}
                    </div>
                  </div>
                )}

                {media && showMediaPlayer && song.playbackUrl && (
                  <div className="song-toolbar-tool-card song-toolbar-tool-card--media">
                    <span className="song-toolbar-tool-card-title">Playback</span>
                    <SongMediaPlayer
                      mediaUrl={song.playbackUrl}
                      autoPlay={autoPlayMediaOnOpen}
                      onAutoPlayHandled={() => setAutoPlayMediaOnOpen(false)}
                    />
                  </div>
                )}

                {user && showRecorder && (
                  <div className="song-toolbar-tool-card song-toolbar-tool-card--recorder">
                    <SongRecorder song={song} user={user} bandId={bandId} />
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="song-toolbar-row song-toolbar-row--actions">
            <div className="song-actions">
              <div className="add-to-list-wrap" ref={menuRef}>
                <button
                  className="rec-btn rec-btn--toggle"
                  onClick={() => setListMenuOpen((v) => !v)}
                  title="Manage songlists"
                  aria-label="Manage songlists"
                >
                  <ListPlus size={15} />
                  <span className="song-action-label">Songlists</span>
                </button>
                {listMenuOpen && (
                  <div className="list-dropdown">
                    {effectiveSongLists.length === 0 ? (
                      <p className="list-dropdown-empty">No lists yet — create one in the sidebar</p>
                    ) : (
                      effectiveSongLists.map((list) => {
                        const inList = list.songIds.includes(song.id);
                        return (
                          <button
                            key={list.id}
                            className={`list-dropdown-item${inList ? ' in-list' : ''}`}
                            onClick={() => {
                              if (bandId) {
                                if (inList) {
                                  void removeSongFromBandSongList(bandId, list.id, song.id);
                                } else {
                                  void addSongToBandSongList(bandId, list.id, song.id);
                                }
                              } else if (inList) {
                                removeSongFromList(list.id, song.id);
                              } else {
                                addSongToList(list.id, song.id);
                              }
                            }}
                          >
                            {inList ? <Check size={13} /> : <Plus size={13} />}
                            {list.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <button
                className="song-action-btn song-action-btn--import song-action-btn--labeled"
                onClick={() => updateFromFileInputRef.current?.click()}
                title={`Update ${song.title} from file`}
                aria-label={`Update ${song.title} from file`}
                disabled={updatingFromFile}
              >
                <FileUp size={14} />
                <span className="song-action-label">{updatingFromFile ? 'Updating…' : 'Update from file'}</span>
              </button>
              <input
                ref={updateFromFileInputRef}
                type="file"
                accept={SONG_TEXT_IMPORT_ACCEPT}
                onChange={(event) => {
                  void handleUpdateFromFile(event.target.files);
                }}
                style={{ display: 'none' }}
              />

              <button
                className="song-action-btn song-action-btn--edit song-action-btn--labeled"
                onClick={() => navigate(`/songs/${song.id}/edit`, songPageState ? { state: songPageState } : undefined)}
                title={`Edit ${song.title}`}
                aria-label={`Edit ${song.title}`}
              >
                <SquarePen size={14} />
                <span className="song-action-label">Edit</span>
              </button>
              {canDeleteSong ? (
                <button
                  className="song-action-btn song-action-btn--delete song-action-btn--labeled"
                  onClick={handleDelete}
                  title={`Delete ${song.title}`}
                  aria-label={`Delete ${song.title}`}
                >
                  <Trash2 size={14} />
                  <span className="song-action-label">Delete</span>
                </button>
              ) : null}
            </div>
          </div>

        </div>
      </div>

      <div className="song-view-body">
        <div className="song-notes-stage">
          <ChordDisplay
            chordpro={song.chordpro}
            transpose={transpose}
            showChords={showChords}
            notation={chordNotation}
            timeSignature={song.timeSignature}
            instrument={chordInstrument}
            onChordClick={showChords && !drawEnabled ? handleChordClick : undefined}
          />
          <SongHandNotesOverlay
            visible={showNotes}
            drawEnabled={drawEnabled}
            notes={handNotes.visibleNotes}
            myStrokes={handNotes.myStrokes}
            strokeColor={getUserNoteColor(user?.id ?? null)}
            onMyStrokesChange={handleStrokesChange}
          />
        </div>
      </div>

      {activeChord && (
        <ChordDiagram
          chord={activeChord.chord}
          instrument={chordInstrument}
          anchorRect={activeChord.rect}
          onClose={() => setActiveChord(null)}
        />
      )}
    </div>
  );
}
