import { useState, useRef, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronUp,
  ChevronDown,
  RotateCcw,
  ListPlus,
  Wrench,
  SlidersHorizontal,
  Check,
  Plus,
  Printer,
  SquarePen,
  PenLine,
  Trash2,
  Play,
  Mic,
  Gauge,
  Clock3,
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
import { useSongs } from '../context/SongsContext';
import { useAuth } from '../context/AuthContext';
import { useSongHandNotes } from '../hooks/useSongHandNotes';
import { buildSongSurfaceStyle } from '../utils/songColorStyles';
import { showConfirmToast, showPromptToast } from '../utils/toastDialogs';
import ShareMenu from './ShareMenu';
import SongHandNotesOverlay from './SongHandNotesOverlay';
import SongMediaPlayer from './SongMediaPlayer';
import SongRecorder from './SongRecorder';
import { parseSongMedia } from '../utils/songMedia';

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

export default function SongView({ song, accentColor, bandId }: Props) {
  const navigate = useNavigate();
  const [transpose, setTranspose] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [chordInstrument, setChordInstrument] = useState<DiagramInstrument>('guitar');
  const [chordNotation, setChordNotation] = useState<ChordNotation>('anglo');
  const [activeChord, setActiveChord] = useState<ActiveChord | null>(null);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { updateSong, deleteSong } = useSongs();
  const { songLists, addSongToList, removeSongFromList } = useSongLists();
  const { user } = useAuth();

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

  const handNotes = useSongHandNotes({
    ownerId: song.ownerId ?? user?.id ?? null,
    songId: song.id,
    user,
    enabled: showNotes,
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
    const err = await updateSong({
      ...song,
      title: trimmed,
      updatedAt: new Date().toISOString(),
    });
    if (err) {
      toast.error(`Could not rename song: ${err}`);
    }
  }

  async function handleDelete() {
    const confirmed = await showConfirmToast(`Delete "${song.title}"? This cannot be undone.`, {
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    await deleteSong(song.id);
    navigate('/');
  }

  const headerStyle = accentColor
    ? ({
      ...buildSongSurfaceStyle(accentColor),
      '--song-header-accent': accentColor,
    } as CSSProperties)
    : undefined;

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
              <div className="transpose-control">
                <button
                  onClick={() => setTranspose((t) => t - 1)}
                  aria-label="Transpose down"
                  className="transpose-btn"
                >
                  <ChevronDown size={16} />
                </button>
                <span className="transpose-label">
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
                  className="transpose-btn"
                >
                  <ChevronUp size={16} />
                </button>
                {transpose !== 0 && (
                  <button
                    onClick={() => setTranspose(0)}
                    aria-label="Reset transpose"
                    className="transpose-btn transpose-btn--reset"
                    title="Reset to original key"
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
              </div>

              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showChords}
                  onChange={(e) => {
                    setShowChords(e.target.checked);
                    if (!e.target.checked) setActiveChord(null);
                  }}
                />
                Show chords
              </label>

              {showChords && (
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
              )}

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
                <Gauge size={14} />
                Tuner
              </button>

              <button
                type="button"
                className={`song-toolbar-tool-btn${showMetronome ? ' song-toolbar-tool-btn--active' : ''}`}
                onClick={() => setShowMetronome((prev) => !prev)}
                title={showMetronome ? 'Hide metronome' : 'Show metronome'}
                aria-label={showMetronome ? 'Hide metronome' : 'Show metronome'}
              >
                <Clock3 size={14} />
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
                  title={showMediaPlayer ? 'Hide player' : 'Open player and play'}
                  aria-label={showMediaPlayer ? 'Hide player' : 'Open player and play'}
                >
                  <Play size={14} />
                  Player
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
                    <span className="song-toolbar-tool-card-title">Tuner</span>
                    <VisualTuner className="song-view-tuner" />
                  </div>
                )}

                {showMetronome && (
                  <div className="song-toolbar-tool-card">
                    <span className="song-toolbar-tool-card-title">Metronome</span>
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

                      {handNotes.saveState === 'saving' && (
                        <span className="notes-save-status notes-save-status--saving">Saving…</span>
                      )}
                      {handNotes.saveState === 'saved' && (
                        <span className="notes-save-status notes-save-status--saved">Saved</span>
                      )}
                      {handNotes.saveState === 'error' && (
                        <span className="notes-save-status notes-save-status--error">Failed to save</span>
                      )}

                      {handNotes.authors.length > 1 && (
                        <div className="notes-author-filters">
                          <button
                            className={`notes-author-chip${handNotes.visibleAuthorIds.length === handNotes.authors.length ? ' notes-author-chip--active' : ''}`}
                            onClick={handNotes.showAll}
                            title="Show all users' notes"
                          >
                            All
                          </button>
                          <button
                            className={`notes-author-chip${handNotes.visibleAuthorIds.length === 1 && handNotes.visibleAuthorIds[0] === user.id ? ' notes-author-chip--active' : ''}`}
                            onClick={handNotes.showMineOnly}
                            title="Show only my notes"
                          >
                            Mine
                          </button>
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
                    </div>
                  </div>
                )}

                {media && showMediaPlayer && song.playbackUrl && (
                  <div className="song-toolbar-tool-card song-toolbar-tool-card--media">
                    <span className="song-toolbar-tool-card-title">Player</span>
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
                  <ListPlus size={15} /> Songlists
                </button>
                {listMenuOpen && (
                  <div className="list-dropdown">
                    {songLists.length === 0 ? (
                      <p className="list-dropdown-empty">No lists yet — create one in the sidebar</p>
                    ) : (
                      songLists.map((list) => {
                        const inList = list.songIds.includes(song.id);
                        return (
                          <button
                            key={list.id}
                            className={`list-dropdown-item${inList ? ' in-list' : ''}`}
                            onClick={() => {
                              if (inList) {
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
                className="song-action-btn song-action-btn--edit"
                onClick={() => navigate(`/songs/${song.id}/edit`)}
                title={`Edit ${song.title}`}
                aria-label={`Edit ${song.title}`}
              >
                <SquarePen size={14} />
              </button>
              <button
                className="song-action-btn song-action-btn--print"
                onClick={() => window.print()}
                title="Print / Save as PDF"
                aria-label="Print or save as PDF"
              >
                <Printer size={14} />
              </button>
              <ShareMenu
                resourceType="song"
                resourceId={song.id}
                resourceName={song.title}
                buttonClassName="song-action-btn song-action-btn--print"
                buttonTitle={`Share ${song.title}`}
                iconOnly
              />
              <button
                className="song-action-btn song-action-btn--delete"
                onClick={handleDelete}
                title={`Delete ${song.title}`}
                aria-label={`Delete ${song.title}`}
              >
                <Trash2 size={14} />
              </button>
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
            strokeColor="#22c55e"
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
