import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AudioLines,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  List,
  Metronome,
  PenLine,
  Play,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { HandNoteStroke, Song } from '../types';
import LanguageBadge from './LanguageBadge';
import ChordDisplay from './ChordDisplay';
import ChordDiagram, { type DiagramInstrument } from './ChordDiagram';
import SongHandNotesOverlay from './SongHandNotesOverlay';
import SongMediaPlayer from './SongMediaPlayer';
import VisualMetronome from './VisualMetronome';
import VisualTuner from './VisualTuner';
import { useSongHandNotes } from '../hooks/useSongHandNotes';
import type { ChordNotation } from '../utils/chordParser';
import { transposeChord } from '../utils/chordParser';
import { parseSongMedia } from '../utils/songMedia';
import { getUserNoteColor } from '../lib/userColors';
import toast from '../utils/anchoredToast';

interface ActiveChord {
  chord: string;
  rect: DOMRect;
}

interface Props {
  songs: Song[];
  /** Displayed in the topbar header. Pass setlist name for setlist mode, or empty string to omit. */
  title: string;
  backRoute: string;
  /** Per-song notes keyed by song ID (from setlist) */
  songNotes?: Record<string, string>;
  bandId?: string;
  canUseMetronome: boolean;
  onPinTranspose: (song: Song, transpose: number) => Promise<void>;
}

export default function ConcertModeView({
  songs,
  title,
  backRoute,
  songNotes,
  bandId,
  canUseMetronome,
  onPinTranspose,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPageInSong, setCurrentPageInSong] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [currentPageCount, setCurrentPageCount] = useState(1);
  const [songPageCounts, setSongPageCounts] = useState<Record<number, number>>({});
  const [transpose, setTranspose] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [chordInstrument, setChordInstrument] = useState<DiagramInstrument>('guitar');
  const [chordNotation, setChordNotation] = useState<ChordNotation>('anglo');
  const [activeChord, setActiveChord] = useState<ActiveChord | null>(null);
  const [showTopbar, setShowTopbar] = useState(false);
  const [showSongNavigator, setShowSongNavigator] = useState(false);
  const [showMetronome, setShowMetronome] = useState(false);
  const [showTuner, setShowTuner] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [drawEnabled, setDrawEnabled] = useState(false);
  const [undoStack, setUndoStack] = useState<HandNoteStroke[][]>([]);
  const [showMediaPlayer, setShowMediaPlayer] = useState(false);
  const [autoPlayMediaOnOpen, setAutoPlayMediaOnOpen] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const targetPageRef = useRef(0);

  const isMultiSong = songs.length > 1;
  const activeSong = songs[currentIndex] ?? null;
  const handNotes = useSongHandNotes({
    ownerId: activeSong?.ownerId ?? user?.id ?? null,
    bandId: bandId ?? null,
    songId: activeSong?.id ?? '',
    user,
    enabled: Boolean(user && activeSong?.id),
    defaultToCurrentUser: true,
  });

  useEffect(() => {
    setCurrentIndex((current) => {
      if (songs.length === 0) return 0;
      return Math.min(Math.max(current, 0), songs.length - 1);
    });
  }, [songs.length]);

  useEffect(() => {
    setCurrentPageInSong(targetPageRef.current);
    targetPageRef.current = 0;
    setShowMediaPlayer(false);
    setAutoPlayMediaOnOpen(false);
    setDrawEnabled(false);
    setUndoStack([]);
    setActiveChord(null);
  }, [currentIndex]);

  useEffect(() => {
    setSongPageCounts((prev) => ({ ...prev, [currentIndex]: currentPageCount }));
  }, [currentIndex, currentPageCount]);

  useEffect(() => {
    setTranspose(activeSong?.preferredTranspose ?? 0);
  }, [activeSong?.id, activeSong?.preferredTranspose]);

  useLayoutEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content) return;
      const vh = viewport.clientHeight;
      if (vh <= 0) return;
      setViewportHeight(vh);
      setCurrentPageCount(Math.max(1, Math.ceil(content.scrollHeight / vh)));
    };

    const observer = new ResizeObserver(measure);
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    measure();
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, showChords, transpose, chordNotation, showTopbar]);

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
    if (!next) setDrawEnabled(false);
  }, []);

  const handleToggleDraw = useCallback((next: boolean) => {
    setDrawEnabled(next);
    if (next && !showNotes) setShowNotes(true);
  }, [showNotes]);

  const handleStopConcert = useCallback(() => {
    navigate(backRoute);
  }, [navigate, backRoute]);

  const handlePinTranspose = useCallback(async () => {
    if (!activeSong) return;
    await onPinTranspose(activeSong, transpose);
  }, [activeSong, transpose, onPinTranspose]);

  const goToSong = useCallback((index: number) => {
    targetPageRef.current = 0;
    setCurrentIndex(Math.min(Math.max(index, 0), songs.length - 1));
  }, [songs.length]);

  const goToNextPage = useCallback(() => {
    if (currentPageInSong < currentPageCount - 1) {
      setCurrentPageInSong((p) => p + 1);
    } else if (currentIndex < songs.length - 1) {
      targetPageRef.current = 0;
      setCurrentIndex((i) => i + 1);
    }
  }, [currentPageInSong, currentPageCount, currentIndex, songs.length]);

  const goToPrevPage = useCallback(() => {
    if (currentPageInSong > 0) {
      setCurrentPageInSong((p) => p - 1);
    } else if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      const prevPageCount = songPageCounts[prevIndex] ?? 1;
      targetPageRef.current = prevPageCount - 1;
      setCurrentIndex(prevIndex);
    }
  }, [currentPageInSong, currentIndex, songPageCounts]);

  const onSwipeStart = useCallback((e: React.PointerEvent) => {
    swipeRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onSwipeEnd = useCallback((e: React.PointerEvent) => {
    if (!swipeRef.current) return;
    const dx = e.clientX - swipeRef.current.x;
    const dy = e.clientY - swipeRef.current.y;
    swipeRef.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) goToNextPage();
    else goToPrevPage();
  }, [goToNextPage, goToPrevPage]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToNextPage();
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPrevPage();
      }

      if (isMultiSong && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setShowSongNavigator((value) => !value);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToNextPage, goToPrevPage, isMultiSong]);

  if (songs.length === 0) {
    return (
      <div className="not-found">
        <p>No songs to display.</p>
        <button type="button" className="setlist-action-btn" onClick={handleStopConcert}>Go back</button>
      </div>
    );
  }

  const currentSong = songs[currentIndex] ?? songs[0];
  if (!currentSong) {
    return (
      <div className="not-found">
        <p>Could not load song for concert mode.</p>
        <button type="button" className="setlist-action-btn" onClick={handleStopConcert}>Go back</button>
      </div>
    );
  }

  const canGoPrev = currentIndex > 0 || currentPageInSong > 0;
  const canGoNext = currentPageInSong < currentPageCount - 1 || currentIndex < songs.length - 1;
  const media = currentSong.playbackUrl ? parseSongMedia(currentSong.playbackUrl) : null;
  const isTransposePinned = currentSong.preferredTranspose === transpose;
  const currentSongNote = songNotes?.[currentSong.id]?.trim() ?? '';

  return (
    <section className="concert-mode">
      <div className={`concert-topbar-toggle-row${showTopbar ? ' concert-topbar-toggle-row--with-topbar' : ''}`}>
        <button
          type="button"
          className="concert-chip-btn concert-topbar-toggle-btn"
          onClick={() => setShowTopbar((v) => !v)}
          aria-label={showTopbar ? 'Hide toolbar' : 'Show toolbar'}
        >
          <SlidersHorizontal size={14} />
          {showTopbar ? 'Hide toolbar' : 'Show toolbar'}
        </button>
        {isMultiSong && (
          <button
            type="button"
            className="concert-chip-btn"
            onClick={() => setShowSongNavigator((value) => !value)}
            aria-label={showSongNavigator ? 'Hide song navigator' : 'Show song navigator'}
          >
            <List size={14} />
            {showSongNavigator ? 'Hide songs' : 'Show songs'}
          </button>
        )}
        <button
          type="button"
          className="concert-chip-btn concert-chip-btn--danger"
          onClick={handleStopConcert}
          aria-label="Stop concert mode"
        >
          <X size={14} /> Stop Concert
        </button>
      </div>
      {showTopbar && (
        <header className="concert-topbar">
          <div className="concert-topbar-main">
            <Link to={backRoute} className="back-link concert-back-link"><ArrowLeft size={15} /> Back</Link>
            {title && <h1>{title}</h1>}
            <p>
              {isMultiSong && (
                <>Song {currentIndex + 1} of {songs.length} · </>
              )}
              {currentPageCount > 1 && (
                <span>Page {currentPageInSong + 1} of {currentPageCount} · </span>
              )}
              <span className="concert-shortcut-hint">Use left/right arrows to turn pages</span>
            </p>
          </div>

          <div className="song-view-toolbar concert-song-view-toolbar">
            <section className="song-toolbar-section song-toolbar-section--settings">
              <div className="song-toolbar-section-head">
                <h2 className="song-toolbar-section-title"><SlidersHorizontal size={14} /> Settings</h2>
              </div>

              <div className="song-toolbar-row song-toolbar-row--controls">
                <div className="transpose-control song-toolbar-controls-group">
                  <button
                    onClick={() => setTranspose((value) => value - 1)}
                    aria-label="Transpose down"
                    className="transpose-btn song-toolbar-tool-btn song-toolbar-setting-btn"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="transpose-label song-toolbar-tool-btn song-toolbar-setting-label">
                    {currentSong.key
                      ? transpose === 0
                        ? `Key of ${currentSong.key}`
                        : `Key of ${transposeChord(currentSong.key, transpose)}`
                      : transpose === 0
                        ? 'Original key'
                        : `${transpose > 0 ? '+' : ''}${transpose} semitones`}
                  </span>
                  <button
                    onClick={() => setTranspose((value) => value + 1)}
                    aria-label="Transpose up"
                    className="transpose-btn song-toolbar-tool-btn song-toolbar-setting-btn"
                  >
                    <ChevronRight size={16} />
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
                    <div className="instrument-toggle song-toolbar-controls-group">
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

                    <div className="instrument-toggle song-toolbar-controls-group">
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
            </section>

            <section className="song-toolbar-section song-toolbar-section--tools">
              <div className="song-toolbar-section-head">
                <h2 className="song-toolbar-section-title"><List size={14} /> Tools</h2>
              </div>

              <div className="song-toolbar-row song-toolbar-row--tool-switches">
                <button
                  type="button"
                  className={`song-toolbar-tool-btn${showTuner ? ' song-toolbar-tool-btn--active' : ''}`}
                  onClick={() => setShowTuner((value) => !value)}
                  title={showTuner ? 'Hide tuner' : 'Show tuner'}
                  aria-label={showTuner ? 'Hide tuner' : 'Show tuner'}
                >
                  <AudioLines size={14} />
                  Tuner
                </button>

                <button
                  type="button"
                  className={`song-toolbar-tool-btn${showMetronome ? ' song-toolbar-tool-btn--active' : ''}${!canUseMetronome ? ' song-toolbar-tool-btn--locked' : ''}`}
                  onClick={() => {
                    if (!canUseMetronome) {
                      toast.error('The metronome requires a Pro, Crew plan, or a Crew band membership.', { action: { label: 'Upgrade', href: '/upgrade' } });
                      return;
                    }
                    setShowMetronome((value) => !value);
                  }}
                  title={!canUseMetronome ? 'Upgrade to Pro, Crew, or join a Crew band to use the metronome' : (showMetronome ? 'Hide metronome' : 'Show metronome')}
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
                      setShowMediaPlayer((value) => {
                        const next = !value;
                        if (next) setAutoPlayMediaOnOpen(true);
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
              </div>

              {(showTuner || showMetronome || (user && showNotes) || (media && showMediaPlayer && currentSong.playbackUrl)) && (
                <div className={`song-toolbar-tools-grid concert-toolbar-tools-grid${!showTopbar ? ' song-toolbar-tools-grid--floating' : ''}`}>
                  {showTuner && (
                    <div className="song-toolbar-tool-card">
                      <div className="song-toolbar-tool-card-header">
                        <span className="song-toolbar-tool-card-title">
                          <AudioLines size={13} />
                          Tuner
                        </span>
                        <button className="floating-tool-close" onClick={() => setShowTuner(false)} aria-label="Close tuner"><X size={14} /></button>
                      </div>
                      <VisualTuner className="song-view-tuner" />
                    </div>
                  )}

                  {showMetronome && (
                    <div className="song-toolbar-tool-card">
                      <div className="song-toolbar-tool-card-header">
                        <span className="song-toolbar-tool-card-title">
                          <Metronome size={13} />
                          Metronome
                        </span>
                        <button className="floating-tool-close" onClick={() => setShowMetronome(false)} aria-label="Close metronome"><X size={14} /></button>
                      </div>
                      <VisualMetronome
                        tempo={currentSong.tempo}
                        timeSignature={currentSong.timeSignature}
                        className="song-view-metronome"
                      />
                    </div>
                  )}

                  {user && showNotes && (
                    <div className="song-toolbar-tool-card song-toolbar-tool-card--notes">
                      <div className="song-toolbar-tool-card-header">
                        <span className="song-toolbar-tool-card-title">Handwritten notes</span>
                        <button className="floating-tool-close" onClick={() => handleToggleNotes(false)} aria-label="Close notes"><X size={14} /></button>
                      </div>
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
                              onClick={() => { void handleClearNotes(); }}
                              disabled={handNotes.myStrokes.length === 0}
                              title="Clear my notes"
                            >
                              Clear
                            </button>
                          </>
                        )}

                        {handNotes.saveState === 'saving' && (
                          <span className="notes-save-status notes-save-status--saving">Saving...</span>
                        )}
                        {handNotes.saveState === 'saved' && (
                          <span className="notes-save-status notes-save-status--saved">Saved</span>
                        )}
                        {handNotes.saveState === 'error' && (
                          <span className="notes-save-status notes-save-status--error">Failed to save</span>
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
                      </div>
                    </div>
                  )}

                  {media && showMediaPlayer && currentSong.playbackUrl && (
                    <div className="song-toolbar-tool-card song-toolbar-tool-card--media">
                      <div className="song-toolbar-tool-card-header">
                        <span className="song-toolbar-tool-card-title">Playback</span>
                        <button className="floating-tool-close" onClick={() => setShowMediaPlayer(false)} aria-label="Close playback"><X size={14} /></button>
                      </div>
                      <SongMediaPlayer
                        mediaUrl={currentSong.playbackUrl}
                        autoPlay={autoPlayMediaOnOpen}
                        onAutoPlayHandled={() => setAutoPlayMediaOnOpen(false)}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </header>
      )}

      <div className={`concert-content-wrap${showSongNavigator && isMultiSong ? '' : ' concert-content-wrap--full'}`}>
        <article
          className="concert-song-surface"
          onPointerDown={onSwipeStart}
          onPointerUp={onSwipeEnd}
        >
          <div className="concert-song-header">
            <h2>{currentSong.title}</h2>
            {currentSong.artist && <p className="concert-song-artist">{currentSong.artist}</p>}
            <div className="concert-song-meta">
              <LanguageBadge code={currentSong.language} />
              {currentSong.secondaryLanguages?.map((code) => <LanguageBadge key={code} code={code} />)}
              {currentSong.capo !== undefined && currentSong.capo > 0 && (
                <span className="capo-badge">Capo {currentSong.capo}</span>
              )}
              {currentSong.timeSignature && <span className="meta-pill">{currentSong.timeSignature}</span>}
            </div>
            {currentSongNote && (
              <p className="concert-song-note">{currentSongNote}</p>
            )}
          </div>

          <div className="concert-page-viewport" ref={viewportRef}>
            <div
              className="concert-page-content"
              ref={contentRef}
              style={{ transform: viewportHeight > 0 ? `translateY(${-currentPageInSong * viewportHeight}px)` : undefined }}
            >
              <div className="song-notes-stage">
                <ChordDisplay
                  chordpro={currentSong.chordpro}
                  transpose={transpose}
                  showChords={showChords}
                  notation={chordNotation}
                  bpm={currentSong.tempo}
                  timeSignature={currentSong.timeSignature}
                  instrument={chordInstrument}
                  onChordClick={showChords && !drawEnabled
                    ? (chord, rect) => {
                      setActiveChord((previous) =>
                        previous?.chord === chord && previous.rect.top === rect.top
                          ? null
                          : { chord, rect }
                      );
                    }
                    : undefined}
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
          </div>

          {currentPageCount > 1 && (
            <div className="concert-page-indicator" aria-label={`Page ${currentPageInSong + 1} of ${currentPageCount}`}>
              {Array.from({ length: currentPageCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`concert-page-dot${i === currentPageInSong ? ' concert-page-dot--active' : ''}`}
                  onClick={() => setCurrentPageInSong(i)}
                  aria-label={`Go to page ${i + 1}`}
                />
              ))}
            </div>
          )}
        </article>

        {isMultiSong && showSongNavigator && (
          <aside className="concert-song-navigator" aria-label="Setlist songs navigator">
            <div className="concert-song-navigator-header">
              <h3>Setlist Songs</h3>
              <button
                type="button"
                className="concert-song-nav-close"
                onClick={() => setShowSongNavigator(false)}
                aria-label="Hide song navigator"
              >
                <ChevronsUpDown size={14} />
              </button>
            </div>
            <ol>
              {songs.map((song, index) => (
                <li key={song.id}>
                  <button
                    type="button"
                    className={`concert-song-jump${index === currentIndex ? ' active' : ''}${index < currentIndex ? ' played' : ''}`}
                    onClick={() => goToSong(index)}
                  >
                    <span className="concert-song-jump-number">{index + 1}</span>
                    <span className="concert-song-jump-main">
                      <strong>{song.title}</strong>
                      {song.artist && <small>{song.artist}</small>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

      <footer className="concert-nav-footer">
        <button
          type="button"
          className="concert-nav-btn"
          onClick={goToPrevPage}
          disabled={!canGoPrev}
          aria-label="Previous page"
        >
          <ChevronLeft size={18} /> Previous
        </button>
        <button
          type="button"
          className="concert-nav-btn concert-nav-btn--primary"
          onClick={goToNextPage}
          disabled={!canGoNext}
          aria-label="Next page"
        >
          Next <ChevronRight size={18} />
        </button>
      </footer>

      {activeChord && (
        <ChordDiagram
          chord={activeChord.chord}
          instrument={chordInstrument}
          anchorRect={activeChord.rect}
          onClose={() => setActiveChord(null)}
        />
      )}
    </section>
  );
}
