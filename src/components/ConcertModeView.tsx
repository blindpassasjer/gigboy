import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  List,
  Minus,
  Pause,
  Play,
  Plus,
  Settings,
  Square,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Song } from '../types';
import ChordDisplay from './ChordDisplay';
import ChordDiagram, { type DiagramInstrument } from './ChordDiagram';
import { useBandChordVoicings } from '../hooks/useBandChordVoicings';
import type { useSetlistSession } from '../hooks/useSetlistSession';
import LyricHandNotesOverlay from './LyricHandNotesOverlay';
import ConcertMetronomeFlash from './ConcertMetronomeFlash';
import { useSongHandNotes } from '../hooks/useSongHandNotes';
import type { ChordNotation } from '../utils/chordParser';
import { getUserNoteColor } from '../lib/userColors';
import { extractPinnedLineIds } from '../lib/lineAnchor';

const noop = () => {};

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

const FONT_SCALE_KEY = 'gigboy.concert.fontScale';
const PAGINATION_KEY = 'gigboy.concert.pagination';
const PULSE_KEY = 'gigboy.concert.pulse';
const AUTOSCROLL_KEY = 'gigboy.concert.autoscroll';
const SCROLL_SPEED_KEY = 'gigboy.concert.scrollSpeed';
const SCROLL_SPEED_MIN = 5;
const SCROLL_SPEED_MAX = 120;
const SCROLL_SPEED_DEFAULT = 25;
const FONT_SCALE_MIN = 0.7;
const FONT_SCALE_MAX = 1.6;
const FONT_SCALE_STEP = 0.1;

function readStoredFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch { /* storage unavailable */ }
  return fallback;
}

function storeValue(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function readStoredScrollSpeed(): number {
  try {
    const raw = Number(localStorage.getItem(SCROLL_SPEED_KEY));
    if (Number.isFinite(raw) && raw >= SCROLL_SPEED_MIN && raw <= SCROLL_SPEED_MAX) return raw;
  } catch { /* storage unavailable */ }
  return SCROLL_SPEED_DEFAULT;
}

function readStoredFontScale(): number {
  try {
    const raw = Number(localStorage.getItem(FONT_SCALE_KEY));
    if (Number.isFinite(raw) && raw >= FONT_SCALE_MIN && raw <= FONT_SCALE_MAX) return raw;
  } catch { /* storage unavailable */ }
  return 1;
}

interface Props {
  songs: Song[];
  /** Accessible label for the concert view. Pass setlist name for setlist mode, or empty string to omit. */
  title: string;
  backRoute: string;
  /** Per-song notes keyed by song ID (from setlist) */
  songNotes?: Record<string, string>;
  bandId?: string;
  canUseMetronome: boolean;
  /** Current user's personal transpose overrides, keyed by song id. Used when solo or
   * leading; ignored while following, where the leader's transpose applies to everyone. */
  transposeBySongId?: Record<string, number>;
  /** Shared "now playing" session (setlist mode only). When leading, local navigation is
   * broadcast; when following, position is driven by the leader. */
  session?: ReturnType<typeof useSetlistSession>;
}

export default function ConcertModeView({
  songs,
  title,
  backRoute,
  songNotes,
  bandId,
  canUseMetronome,
  transposeBySongId,
  session,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPageInSong, setCurrentPageInSong] = useState(0);
  const [pageOffsets, setPageOffsets] = useState<number[]>([0]);
  const currentPageCount = pageOffsets.length;
  const [transpose, setTranspose] = useState(0);
  // Display prefs are fixed in concert mode — they're set up beforehand in SongView.
  const showChords = true;
  const chordInstrument: DiagramInstrument = 'guitar';
  const chordNotation: ChordNotation = 'anglo';
  const [activeChord, setActiveChord] = useState<ActiveChord | null>(null);
  // Pagination (discrete pages) vs. continuous scrolling. Autoscroll needs continuous
  // scrolling, so the two toggles are mutually exclusive.
  const [pagination, setPagination] = useState(() => readStoredFlag(PAGINATION_KEY, true));
  const [autoscroll, setAutoscroll] = useState(() => readStoredFlag(AUTOSCROLL_KEY, false));
  const [scrollSpeed, setScrollSpeed] = useState(readStoredScrollSpeed);
  const [pulse, setPulse] = useState(() => readStoredFlag(PULSE_KEY, true));
  const [scrolling, setScrolling] = useState(false);
  const [scrollEdge, setScrollEdge] = useState({ top: true, bottom: false });
  const continuous = !pagination;
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [showSongNavigator, setShowSongNavigator] = useState(false);
  const [fontScale, setFontScale] = useState(readStoredFontScale);
  const chordVoicings = useBandChordVoicings(bandId, false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const targetPageRef = useRef(0);
  const contentScrollHeightRef = useRef(0);

  const isMultiSong = songs.length > 1;
  const activeSong = songs[currentIndex] ?? null;
  const handNotes = useSongHandNotes({
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
      if (sentinel) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
        // The browser auto-releases on tab-hide without firing our code; this keeps the
        // ref honest so onVisibilityChange knows it needs to re-acquire.
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // Wake lock can be denied (e.g. low battery, unsupported context) — ignore.
      }
    };

    void acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
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
    const viewport = viewportRef.current;
    if (viewport && continuous) {
      // Continuous mode has no pages: land at the top, or the bottom when stepping back.
      viewport.scrollTop = targetPageRef.current === Number.POSITIVE_INFINITY ? viewport.scrollHeight : 0;
    }
    setCurrentPageInSong(targetPageRef.current);
    targetPageRef.current = 0;
    setScrolling(false);
    setActiveChord(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const sessionMode = session?.mode ?? 'solo';
  const sessionState = session?.state ?? null;

  // Seed the transpose from this member's own saved value for the song. Skipped while
  // following — there the leader's transpose is applied to everyone (see the effect below),
  // and it's restored from personal prefs once the session ends and the mode flips back.
  useEffect(() => {
    if (sessionMode === 'follow') return;
    const personal = activeSong ? transposeBySongId?.[activeSong.id] : undefined;
    setTranspose(personal ?? activeSong?.preferredTranspose ?? 0);
  }, [activeSong?.id, activeSong?.preferredTranspose, activeSong, transposeBySongId, sessionMode]);

  // Follow mode: the leader's position — and transpose — drive this screen.
  useEffect(() => {
    if (sessionMode !== 'follow' || !sessionState) return;
    targetPageRef.current = sessionState.pageIndex;
    setCurrentIndex(Math.min(Math.max(sessionState.songIndex, 0), Math.max(0, songs.length - 1)));
    setCurrentPageInSong(sessionState.pageIndex);
    setTranspose(sessionState.transpose);
  }, [sessionMode, sessionState, songs.length]);

  // Lead mode: broadcast local navigation to followers.
  const sessionPush = session?.push;
  useEffect(() => {
    if (sessionMode !== 'lead' || !sessionPush) return;
    sessionPush({ songIndex: currentIndex, pageIndex: currentPageInSong, transpose });
  }, [sessionMode, sessionPush, currentIndex, currentPageInSong, transpose]);

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
      updateScrollEdge();
      setCurrentPageInSong((p) => Math.min(p, offsets.length - 1));
    };

    const observer = new ResizeObserver(measure);
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    measure();

    // JetBrains Mono (the chord-display font) loads asynchronously via a Google Fonts
    // @import with font-display: swap, so the measurement above can briefly run against
    // fallback-font metrics. Re-measure once the real font is confirmed loaded so page
    // breaks reflect the font actually being displayed (the ResizeObserver above also
    // catches the resulting reflow, but this avoids a visible re-wrap on slow networks).
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
  }, [currentIndex, transpose, continuous]);

  // Leaving continuous mode: the viewport goes back to overflow:hidden, but would keep
  // its old scrollTop and show the song offset by that amount underneath the page transform.
  useLayoutEffect(() => {
    if (!continuous && viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [continuous]);

  const pinnedLineIds = useMemo(
    () => extractPinnedLineIds(handNotes.visibleNotes),
    [handNotes.visibleNotes]
  );

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

  const updateScrollEdge = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const top = viewport.scrollTop <= 1;
    const bottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2;
    setScrollEdge((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);

  // Autoscroll loop. scrollTop can round to whole pixels, so keep the fractional position
  // ourselves; slow speeds would otherwise never advance.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!scrolling || !autoscroll || !continuous || !viewport) return;
    let raf = 0;
    let last = performance.now();
    let pos = viewport.scrollTop;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      // Re-sync if something else (a nav button, the user) moved the scroll position.
      if (Math.abs(viewport.scrollTop - pos) > 2) pos = viewport.scrollTop;
      pos += scrollSpeed * dt;
      viewport.scrollTop = pos;
      if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1) {
        setScrolling(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrolling, autoscroll, continuous, scrollSpeed]);

  const changePagination = useCallback((on: boolean) => {
    setPagination(on);
    storeValue(PAGINATION_KEY, on ? '1' : '0');
    if (on) {
      setAutoscroll(false);
      setScrolling(false);
      storeValue(AUTOSCROLL_KEY, '0');
    }
  }, []);

  const changeAutoscroll = useCallback((on: boolean) => {
    setAutoscroll(on);
    storeValue(AUTOSCROLL_KEY, on ? '1' : '0');
    if (on) {
      setPagination(false);
      storeValue(PAGINATION_KEY, '0');
    } else {
      setScrolling(false);
    }
  }, []);

  const changePulse = useCallback((on: boolean) => {
    setPulse(on);
    storeValue(PULSE_KEY, on ? '1' : '0');
  }, []);

  const changeScrollSpeed = useCallback((value: number) => {
    setScrollSpeed(value);
    storeValue(SCROLL_SPEED_KEY, String(value));
  }, []);

  const goToSong = useCallback((index: number) => {
    targetPageRef.current = 0;
    setCurrentIndex(Math.min(Math.max(index, 0), songs.length - 1));
  }, [songs.length]);

  const goToNextPage = useCallback(() => {
    if (continuous) {
      const viewport = viewportRef.current;
      const atBottom = !viewport || viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2;
      if (!atBottom) {
        viewport.scrollBy({ top: viewport.clientHeight * 0.85, behavior: 'smooth' });
      } else if (currentIndex < songs.length - 1) {
        targetPageRef.current = 0;
        setCurrentIndex((i) => i + 1);
      }
      return;
    }
    if (currentPageInSong < currentPageCount - 1) {
      setCurrentPageInSong((p) => p + 1);
    } else if (currentIndex < songs.length - 1) {
      targetPageRef.current = 0;
      setCurrentIndex((i) => i + 1);
    }
  }, [continuous, currentPageInSong, currentPageCount, currentIndex, songs.length]);

  const goToPrevPage = useCallback(() => {
    if (continuous) {
      const viewport = viewportRef.current;
      if (viewport && viewport.scrollTop > 1) {
        viewport.scrollBy({ top: -viewport.clientHeight * 0.85, behavior: 'smooth' });
      } else if (currentIndex > 0) {
        targetPageRef.current = Number.POSITIVE_INFINITY;
        setCurrentIndex((i) => i - 1);
      }
      return;
    }
    if (currentPageInSong > 0) {
      setCurrentPageInSong((p) => p - 1);
    } else if (currentIndex > 0) {
      // Land on the previous song's last page even if it hasn't been measured yet
      // (e.g. the navigator was used to skip ahead) — the layout effect clamps this
      // once real page offsets are computed for that song.
      targetPageRef.current = Number.POSITIVE_INFINITY;
      setCurrentIndex((i) => i - 1);
    }
  }, [continuous, currentPageInSong, currentIndex]);

  const onSwipeStart = useCallback((e: React.PointerEvent) => {
    swipeRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onSwipeEnd = useCallback((e: React.PointerEvent) => {
    if (!swipeRef.current) return;
    if (continuous) {
      swipeRef.current = null;
      return;
    }
    const dx = e.clientX - swipeRef.current.x;
    const dy = e.clientY - swipeRef.current.y;
    swipeRef.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) goToNextPage();
    else goToPrevPage();
  }, [continuous, goToNextPage, goToPrevPage]);

  const handleSurfaceTap = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, label, select, [role="button"]')) return;
    if (activeChord) {
      setActiveChord(null);
      return;
    }
    if (continuous) {
      // Tap anywhere to start/pause autoscroll.
      if (autoscroll) setScrolling((v) => !v);
      return;
    }
    goToNextPage();
  }, [activeChord, autoscroll, continuous, goToNextPage]);

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

  // Close the settings popover on outside press or Escape.
  useEffect(() => {
    if (!showSettings) return;
    const onPress = (e: PointerEvent) => {
      if (!settingsRef.current?.contains(e.target as Node)) setShowSettings(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettings(false);
    };
    document.addEventListener('pointerdown', onPress);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPress);
      document.removeEventListener('keydown', onKey);
    };
  }, [showSettings]);

  const changeFontScale = useCallback((delta: number) => {
    setFontScale((prev) => {
      const next = Math.round(Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, prev + delta)) * 10) / 10;
      try { localStorage.setItem(FONT_SCALE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  if (songs.length === 0) {
    return (
      <div className="not-found">
        <p>No songs to display.</p>
        <button type="button" className="btn btn--primary" onClick={handleStopConcert}>Go back</button>
      </div>
    );
  }

  const currentSong = songs[currentIndex] ?? songs[0];
  if (!currentSong) {
    return (
      <div className="not-found">
        <p>Could not load song for concert mode.</p>
        <button type="button" className="btn btn--primary" onClick={handleStopConcert}>Go back</button>
      </div>
    );
  }

  const canGoPrev = continuous
    ? !scrollEdge.top || currentIndex > 0
    : currentIndex > 0 || currentPageInSong > 0;
  const canGoNext = continuous
    ? !scrollEdge.bottom || currentIndex < songs.length - 1
    : currentPageInSong < currentPageCount - 1 || currentIndex < songs.length - 1;
  const currentSongNote = songNotes?.[currentSong.id]?.trim() ?? '';

  return (
    <section
      className="concert-mode"
      aria-label={title || undefined}
      style={{ '--concert-font-scale': fontScale } as React.CSSProperties}
    >
      {session?.error && <p className="concert-session-error">{session.error}</p>}
      {canUseMetronome && pulse && (
        <ConcertMetronomeFlash tempo={currentSong.tempo} timeSignature={currentSong.timeSignature} />
      )}

      <div className={`concert-content-wrap${showSongNavigator && isMultiSong ? '' : ' concert-content-wrap--full'}`}>
        <article
          className="concert-song-surface"
          onPointerDown={onSwipeStart}
          onPointerUp={onSwipeEnd}
          onClick={handleSurfaceTap}
        >
          <div className="concert-song-header concert-song-header--compact">
            <div className="concert-song-header-main">
              <h2>
                {isMultiSong && <span className="concert-song-position">{currentIndex + 1}/{songs.length}</span>}
                {currentSong.title}
                {currentSong.artist && (
                  <span className="concert-song-artist"> · {currentSong.artist}</span>
                )}
                {currentSong.capo !== undefined && currentSong.capo > 0 && (
                  <span className="capo-badge">Capo {currentSong.capo}</span>
                )}
              </h2>
              {currentSongNote && (
                <p className="concert-song-note">{currentSongNote}</p>
              )}
            </div>
            <div className="concert-header-actions">
              {autoscroll && continuous && (
                <button
                  type="button"
                  className={`concert-icon-btn${scrolling ? ' is-active' : ''}`}
                  onClick={() => setScrolling((v) => !v)}
                  aria-label={scrolling ? 'Pause autoscroll' : 'Start autoscroll'}
                  aria-pressed={scrolling}
                  title={scrolling ? 'Pause autoscroll' : 'Start autoscroll'}
                >
                  {scrolling ? <Pause size={18} /> : <Play size={18} />}
                </button>
              )}
              <button
                type="button"
                className={`concert-icon-btn concert-icon-btn--danger${confirmingStop ? ' is-confirming' : ''}`}
                onClick={handleStopConcert}
                onBlur={() => setConfirmingStop(false)}
                aria-label={confirmingStop ? 'Tap again to confirm stopping concert mode' : 'Stop concert mode'}
                title="Stop concert"
              >
                <Square size={16} fill="currentColor" />
                {confirmingStop && <span>Tap again</span>}
              </button>
              {isMultiSong && (
                <button
                  type="button"
                  className={`concert-icon-btn${showSongNavigator ? ' is-active' : ''}`}
                  onClick={() => setShowSongNavigator((value) => !value)}
                  aria-label={showSongNavigator ? 'Hide song navigator' : 'Show song navigator'}
                  aria-pressed={showSongNavigator}
                  title="Song list"
                >
                  <List size={18} />
                </button>
              )}
            <div
              className="concert-settings"
              ref={settingsRef}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={`concert-settings-btn${showSettings ? ' is-active' : ''}`}
                onClick={() => setShowSettings((v) => !v)}
                aria-label="Concert settings"
                aria-expanded={showSettings}
              >
                <Settings size={18} />
              </button>
              {showSettings && (
                <div className="concert-settings-panel" role="dialog" aria-label="Concert settings">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={pagination}
                      onChange={(e) => changePagination(e.target.checked)}
                    />
                    Pagination
                  </label>
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={autoscroll}
                      onChange={(e) => changeAutoscroll(e.target.checked)}
                    />
                    Autoscroll
                  </label>
                  {canUseMetronome && (
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={pulse}
                        onChange={(e) => changePulse(e.target.checked)}
                      />
                      BPM pulse
                    </label>
                  )}
                  {autoscroll && (
                    <label className="concert-settings-slider">
                      <span>Speed</span>
                      <input
                        type="range"
                        min={SCROLL_SPEED_MIN}
                        max={SCROLL_SPEED_MAX}
                        step={5}
                        value={scrollSpeed}
                        onChange={(e) => changeScrollSpeed(Number(e.target.value))}
                        aria-label="Autoscroll speed"
                      />
                    </label>
                  )}
                  {session && (
                    <div className="concert-session-toggle" role="group" aria-label="Setlist sync">
                      {(['solo', 'follow', 'lead'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={session.mode === m ? 'is-active' : ''}
                          onClick={() => session.setMode(m)}
                          title={
                            m === 'solo' ? 'Navigate on your own'
                              : m === 'follow' ? "Follow the leader's screen"
                                : 'Lead — your navigation drives everyone'
                          }
                        >
                          {m === 'solo' ? 'Solo' : m === 'follow' ? 'Follow' : 'Lead'}
                        </button>
                      ))}
                    </div>
                  )}
                  {session && session.mode !== 'solo' && (
                    <span className="concert-session-leader" role="status">
                      {session.host ? (
                        <>
                          <span className="concert-session-leader-avatar" aria-hidden="true">
                            {session.host.avatar || session.host.name.slice(0, 1).toUpperCase()}
                          </span>
                          {session.isHost ? "You're leading" : `${session.host.name} is leading`}
                        </>
                      ) : session.isHost ? "You're leading" : 'Nobody is leading yet'}
                    </span>
                  )}
                </div>
              )}
            </div>
            </div>
          </div>

          <div
            className={`concert-page-viewport${continuous ? ' concert-page-viewport--scroll' : ''}`}
            ref={viewportRef}
            onScroll={continuous ? updateScrollEdge : undefined}
            // A manual drag/wheel takes over from autoscroll.
            onTouchMove={continuous ? () => setScrolling(false) : undefined}
            onWheel={continuous ? () => setScrolling(false) : undefined}
          >
            <div
              className="concert-page-content"
              ref={contentRef}
              style={continuous ? undefined : (() => {
                const offsetY = pageOffsets[currentPageInSong] ?? 0;
                // Read the content's *live* height rather than trusting the cached
                // snapshot from the last measurement pass. Content can shrink after that
                // snapshot was taken (e.g. hand-note data arriving and un-pinning lines
                // that were temporarily forced to single-row layout) without a resize
                // event ever re-running measure() — clipping against a stale, too-tall
                // snapshot can clip away an entire page's visible content.
                const liveScrollHeight = contentRef.current?.scrollHeight ?? contentScrollHeightRef.current;
                const nextOffsetY = pageOffsets[currentPageInSong + 1] ?? liveScrollHeight;
                // Guard against a broken/non-monotonic offset pair (e.g. a stale page
                // index read against a different song's offsets) ever clipping away an
                // entire page — better to show unclipped content than render nothing.
                const bottomClip = nextOffsetY > offsetY
                  ? Math.max(0, liveScrollHeight - nextOffsetY)
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
                  onChordClick={showChords
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
                  visible
                  drawEnabled={false}
                  notes={handNotes.visibleNotes}
                  myStrokes={handNotes.myStrokes}
                  strokeColor={getUserNoteColor(user?.id ?? null)}
                  onMyStrokesChange={noop}
                />
              </div>
            </div>
          </div>

          {!continuous && currentPageCount > 1 && (
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
        <div className="concert-font-size" role="group" aria-label="Text size">
          <button
            type="button"
            onClick={() => changeFontScale(-FONT_SCALE_STEP)}
            disabled={fontScale <= FONT_SCALE_MIN}
            aria-label="Decrease text size"
          >
            <Minus size={12} />A
          </button>
          <button
            type="button"
            onClick={() => changeFontScale(FONT_SCALE_STEP)}
            disabled={fontScale >= FONT_SCALE_MAX}
            aria-label="Increase text size"
          >
            <Plus size={12} />A
          </button>
        </div>
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
          voicingOverride={chordVoicings.overrideFor('guitar', activeChord.chord)}
        />
      )}
    </section>
  );
}
