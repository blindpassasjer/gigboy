import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
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
  Undo2,
  Redo2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { LyricNoteStroke, Song } from '../types';
import LanguageBadge from './LanguageBadge';
import SongMetaBadges from './SongMetaBadges';
import ChordDisplay from './ChordDisplay';
import ChordDiagram, { type DiagramInstrument } from './ChordDiagram';
import LyricHandNotesOverlay from './LyricHandNotesOverlay';
import SongMediaPlayer from './SongMediaPlayer';
import VisualMetronome from './VisualMetronome';
import VisualTuner from './VisualTuner';
import { useSongHandNotes } from '../hooks/useSongHandNotes';
import type { ChordNotation } from '../utils/chordParser';
import { transposeChord } from '../utils/chordParser';
import { parseSongMedia } from '../utils/songMedia';
import { getUserNoteColor } from '../lib/userColors';
import { extractPinnedLineIds } from '../lib/lineAnchor';
import toast from '../utils/anchoredToast';

interface ActiveChord {
  chord: string;
  rect: DOMRect;
}

function computePageOffsets(contentEl: HTMLElement, viewportHeight: number): number[] {
  const contentRect = contentEl.getBoundingClientRect();
  const contentTop = contentRect.top;

  const offsets: number[] = [0];
  let pageStartY = 0;

  const relTop = (el: Element) => el.getBoundingClientRect().top - contentTop;
  const relBottom = (el: Element) => el.getBoundingClientRect().bottom - contentTop;

  const processAtom = (el: Element) => {
    const elTop = relTop(el);
    const elBottom = relBottom(el);
    if (elBottom - pageStartY > viewportHeight && elTop > pageStartY) {
      pageStartY = elTop;
      offsets.push(pageStartY);
    }
  };

  const processSection = (section: HTMLElement) => {
    const secTop = relTop(section);
    const secBottom = relBottom(section);
    const secHeight = secBottom - secTop;

    if (secBottom - pageStartY <= viewportHeight) return; // whole section fits

    if (secHeight <= viewportHeight && secTop > pageStartY) {
      // Keep the whole section together on a new page
      pageStartY = secTop;
      offsets.push(pageStartY);
      return;
    }

    // Section is taller than one page — split line by line
    for (const child of Array.from(section.children)) {
      processAtom(child);
    }
  };

  const chordDisplay = contentEl.querySelector('.chord-display');
  if (!chordDisplay) return offsets;

  for (const child of Array.from(chordDisplay.children) as HTMLElement[]) {
    if (child.classList.contains('chord-section')) {
      processSection(child);
    } else {
      processAtom(child);
    }
  }

  return offsets;
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
  const [pageOffsets, setPageOffsets] = useState<number[]>([0]);
  const currentPageCount = pageOffsets.length;
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
  const [showMediaPlayer, setShowMediaPlayer] = useState(false);
  const [autoPlayMediaOnOpen, setAutoPlayMediaOnOpen] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const targetPageRef = useRef(0);
  const contentScrollHeightRef = useRef(0);

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

  // Keep the screen awake for the duration of the show. The lock is released
  // automatically by the browser when the tab is hidden, so re-acquire it on
  // return (e.g. switching apps to check a text, then coming back mid-set).
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Wake lock can be denied (e.g. low battery, unsupported context) — ignore.
      }
    };

    void acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !sentinel) {
        void acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinel?.release();
    };
  }, []);

  // Layout effect (not a regular effect): must resolve the target page for the new
  // song *before* the pagination-measuring layout effect below runs, since that effect
  // clamps the current page against the new song's page count. Layout effects for a
  // given commit always run before regular effects, so if this were a plain useEffect
  // it would still be reading the *previous* song's page index when that clamp ran.
  useLayoutEffect(() => {
    setCurrentPageInSong(targetPageRef.current);
    targetPageRef.current = 0;
    setShowMediaPlayer(false);
    setAutoPlayMediaOnOpen(false);
    setDrawEnabled(false);
    setActiveChord(null);
  }, [currentIndex]);

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
      // Temporarily zero transform and clip-path so measurements reflect natural positions
      const prevTransition = content.style.transition;
      const prevTransform = content.style.transform;
      const prevClipPath = content.style.clipPath;
      content.style.transition = 'none';
      content.style.transform = 'translateY(0px)';
      content.style.clipPath = '';

      contentScrollHeightRef.current = content.scrollHeight;
      const offsets = computePageOffsets(content, vh);

      content.style.transition = prevTransition;
      content.style.transform = prevTransform;
      content.style.clipPath = prevClipPath;

      setPageOffsets(offsets);
      setCurrentPageInSong((p) => Math.min(p, offsets.length - 1));
    };

    const observer = new ResizeObserver(measure);
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    measure();

    // JetBrains Mono (the chord-display font) loads asynchronously via a Google Fonts
    // @import with font-display: swap — the very first measurement above almost always
    // runs against the fallback font's metrics, before the real font has downloaded.
    // Once it swaps in, text can re-wrap without the browser reliably re-painting the
    // clip-path'd, will-change:transform page layer on its own (only a real reflow —
    // e.g. a window resize — was forcing that in practice). Re-measure once the real
    // font is confirmed ready so pagination reflects the font actually being displayed.
    let cancelled = false;
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) measure();
      });
    }

    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, showChords, transpose, chordNotation, showTopbar]);

  // Line currently being drawn on, pinned to single-row layout for the duration of the
  // gesture so the anchor is captured against the same geometry it'll be replayed against
  // (see anchorFromClientPoint's doc comment in lib/lineAnchor.ts).
  const [drawingLineId, setDrawingLineId] = useState<number | null>(null);

  const pinnedLineIds = useMemo(() => {
    const ids = extractPinnedLineIds(handNotes.visibleNotes);
    if (drawingLineId != null) ids.add(drawingLineId);
    return ids;
  }, [handNotes.visibleNotes, drawingLineId]);

  const handleActiveLineChange = useCallback((lineId: number | null) => {
    flushSync(() => setDrawingLineId(lineId));
  }, []);

  const handleStrokesChange = useCallback((strokes: LyricNoteStroke[]) => {
    handNotes.saveMyNotes(strokes);
  }, [handNotes]);

  const handleClearNotes = useCallback(async () => {
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

  const [confirmingStop, setConfirmingStop] = useState(false);
  const confirmStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (confirmStopTimeoutRef.current) clearTimeout(confirmStopTimeoutRef.current);
  }, []);

  const handleStopConcert = useCallback(() => {
    if (!confirmingStop) {
      setConfirmingStop(true);
      confirmStopTimeoutRef.current = setTimeout(() => setConfirmingStop(false), 3000);
      return;
    }
    if (confirmStopTimeoutRef.current) clearTimeout(confirmStopTimeoutRef.current);
    navigate(backRoute);
  }, [confirmingStop, navigate, backRoute]);

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
      // Land on the previous song's last page even if it hasn't been measured yet
      // (e.g. the navigator was used to skip ahead) — the layout effect clamps this
      // once real page offsets are computed for that song.
      targetPageRef.current = Number.POSITIVE_INFINITY;
      setCurrentIndex((i) => i - 1);
    }
  }, [currentPageInSong, currentIndex]);

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

  const handleSurfaceTap = useCallback((e: React.MouseEvent) => {
    if (drawEnabled) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, label, select, [role="button"]')) return;
    if (activeChord) {
      setActiveChord(null);
      return;
    }
    goToNextPage();
  }, [drawEnabled, activeChord, goToNextPage]);

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
          onBlur={() => setConfirmingStop(false)}
          aria-label={confirmingStop ? 'Tap again to confirm stopping concert mode' : 'Stop concert mode'}
        >
          <X size={14} /> {confirmingStop ? 'Tap again to stop' : 'Stop Concert'}
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
              <span className="concert-shortcut-hint">
                Use left/right arrows to turn pages
                {isMultiSong && <>, N for song list</>}
              </span>
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
                        className={`instrument-toggle-btn${chordInstrument === 'ukulele' ? ' instrument-toggle-btn--active' : ''}`}
                        onClick={() => { setChordInstrument('ukulele'); setActiveChord(null); }}
                      >
                        Ukulele
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
                              onClick={handNotes.undoStroke}
                              disabled={!handNotes.canUndo}
                              title="Undo"
                              aria-label="Undo"
                            >
                              <Undo2 size={12} />
                            </button>
                            <button
                              className="notes-toolbar-btn"
                              onClick={handNotes.redoStroke}
                              disabled={!handNotes.canRedo}
                              title="Redo"
                              aria-label="Redo"
                            >
                              <Redo2 size={12} />
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
          onClick={handleSurfaceTap}
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
              <SongMetaBadges song={currentSong} />
              {currentSong.tags?.map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
            {currentSongNote && (
              <p className="concert-song-note">{currentSongNote}</p>
            )}
          </div>

          <div className="concert-page-viewport" ref={viewportRef}>
            <div
              className="concert-page-content"
              ref={contentRef}
              style={(() => {
                const offsetY = pageOffsets[currentPageInSong] ?? 0;
                const nextOffsetY = pageOffsets[currentPageInSong + 1] ?? contentScrollHeightRef.current;
                // Guard against a broken/non-monotonic offset pair (e.g. a stale page
                // index read against a different song's offsets) ever clipping away an
                // entire page — better to show unclipped content than render nothing.
                const bottomClip = nextOffsetY > offsetY
                  ? Math.max(0, contentScrollHeightRef.current - nextOffsetY)
                  : 0;
                return {
                  transform: `translateY(${-offsetY}px)`,
                  clipPath: bottomClip > 0 ? `inset(0 0 ${bottomClip}px 0)` : undefined,
                };
              })()}
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
                  hideMetaDirectives
                  onChordClick={showChords && !drawEnabled
                    ? (chord, rect) => {
                      setActiveChord((previous) =>
                        previous?.chord === chord && previous.rect.top === rect.top
                          ? null
                          : { chord, rect }
                      );
                    }
                    : undefined}
                  pinnedLineIds={pinnedLineIds}
                />
                <LyricHandNotesOverlay
                  visible={showNotes}
                  drawEnabled={drawEnabled}
                  notes={handNotes.visibleNotes}
                  myStrokes={handNotes.myStrokes}
                  strokeColor={getUserNoteColor(user?.id ?? null)}
                  onMyStrokesChange={handleStrokesChange}
                  onActiveLineChange={handleActiveLineChange}
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
