import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PanelLeft, Sun, Moon, Maximize2, Minimize2, MessageSquare, Music, Folder, ListMusic, ClipboardList, Newspaper } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import Sidebar from './Sidebar';
import BrandMark from './BrandMark';
import { useDarkModeContext } from '../context/DarkModeContext';
import { useBandPlan } from '../hooks/usePlan';
import { db } from '../lib/firebase';
import { submitFeedback } from '../lib/feedback';
import toast from '../utils/anchoredToast';
import UserAvatar from './UserAvatar';

interface Props {
  children: ReactNode;
}


export default function Layout({ children }: Props) {
  const navigate = useNavigate();
  const { pathname, state } = useLocation();
  const {
    bands,
    addBandSongList,
    addBandSetlist,
    addBandInputList,
    addBandPressKit,
  } = useBands();
  const { user } = useAuth();
  const isConcertRoute = pathname.endsWith('/concert')
    && (pathname.startsWith('/bands/') || pathname.startsWith('/songs/'));
  const stateBandId = (() => {
    if (!state || typeof state !== 'object') return null;
    const candidate = (state as { bandId?: unknown }).bandId;
    return typeof candidate === 'string' && candidate.trim() ? candidate : null;
  })();
  const [persistedBandId, setPersistedBandId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem('gigboy-active-band-id');
    } catch {
      return null;
    }
  });
  const isBandRoute = pathname === '/bands' || pathname.startsWith('/bands/') || Boolean(stateBandId);
  const routeSegments = pathname.split('/').filter(Boolean);
  const routeBandId = routeSegments[0] === 'bands' ? routeSegments[1] ?? null : null;
  const fallbackBandId = persistedBandId && bands.some((entry) => entry.id === persistedBandId)
    ? persistedBandId
    : null;
  const themedBandId = routeBandId ?? stateBandId ?? fallbackBandId;
  const bandSection = routeBandId ? (routeSegments[2] ?? 'library') : null;
  const bandSongListId = routeBandId && bandSection === 'songlists' ? (routeSegments[3] ?? null) : null;
  const activeBand = routeBandId ? bands.find((entry) => entry.id === routeBandId) ?? null : null;
  const activeBandPlanState = useBandPlan(activeBand);
  const canEditActiveBand = Boolean(
    activeBand
      && user
      && (activeBand.ownerId === user.id || activeBand.memberRoles[user.id] === 'editor')
  );
  const addSongFabState = routeBandId
    ? {
      addSongScope: {
        kind: 'band' as const,
        bandId: routeBandId,
      },
      ...(bandSongListId ? { initialSongListId: bandSongListId } : {}),
    }
    : undefined;
  const canShowContextFab = Boolean(routeBandId)
    && !isConcertRoute
    && canEditActiveBand
    && (bandSection === 'library'
      || bandSection === 'songlists'
      || bandSection === 'setlists'
      || bandSection === 'riders'
      || bandSection === 'press-kit');
  const wasConcertRouteRef = useRef(isConcertRoute);
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 900px)').matches;
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 900px)').matches;
  });
  const { dark, toggle: toggleDark } = useDarkModeContext();
  const mainContentRef = useRef<HTMLElement>(null);
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const swipeRef = useRef<{ x: number; y: number; fromEdge: boolean } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(document.fullscreenElement);
  });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const feedbackPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mainEl = mainContentRef.current;
    if (!mainEl) return;

    const handleScroll = () => {
      scrollPositions.current.set(pathname, mainEl.scrollTop);
    };
    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, [pathname]);

  useEffect(() => {
    if (!mainContentRef.current) return;
    mainContentRef.current.scrollTop = scrollPositions.current.get(pathname) ?? 0;
    toast.dismiss();
  }, [pathname]);

  const createBandResource = useCallback(async (kind: 'songlist' | 'setlist' | 'rider' | 'pressKit') => {
    if (!routeBandId) return;

    if (kind === 'setlist' && !activeBandPlanState.canUse('setlists')) {
      toast.error('Setlists require a Pro or Crew plan for this band.');
      return;
    }

    if (kind === 'rider' && !activeBandPlanState.canUse('technicalRiders')) {
      toast.error('Technical riders require a Pro or Crew plan for this band.');
      return;
    }

    if (kind === 'pressKit' && !activeBandPlanState.canUse('pressKits')) {
      toast.error('Press kits require a Pro or Crew plan for this band.');
      return;
    }

    const defaults = {
      songlist: 'New songlist',
      setlist: 'New setlist',
      rider: 'New rider',
      pressKit: 'New press kit',
    } as const;

    if (kind === 'songlist') {
      const result = await addBandSongList(routeBandId, defaults.songlist);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.songListId) {
        navigate(`/bands/${routeBandId}/songlists/${result.songListId}`, {
          state: {
            autoRename: {
              kind: 'songlist',
              resourceId: result.songListId,
              token: Date.now(),
            },
          },
        });
      }
      return;
    }

    if (kind === 'setlist') {
      const result = await addBandSetlist(routeBandId, defaults.setlist);
      if (result.error) {
        toast.error(result.error, { duration: 8000 });
        return;
      }
      if (result.setlistId) {
        navigate(`/bands/${routeBandId}/setlists/${result.setlistId}`, {
          state: {
            autoRename: {
              kind: 'setlist',
              resourceId: result.setlistId,
              token: Date.now(),
            },
          },
        });
      }
      return;
    }

    if (kind === 'pressKit') {
      const result = await addBandPressKit(routeBandId, defaults.pressKit);
      if (result.error) {
        toast.error(result.error, { duration: 8000 });
        return;
      }
      if (result.kitId) {
        navigate(`/bands/${routeBandId}/press-kit/${result.kitId}`);
      }
      return;
    }

    const result = await addBandInputList(routeBandId, defaults.rider);
    if (result.error) {
      toast.error(result.error, { duration: 8000 });
      return;
    }
    if (result.riderId) {
      navigate(`/bands/${routeBandId}/riders/${result.riderId}`, {
        state: {
          autoRename: {
            kind: 'rider',
            resourceId: result.riderId,
            token: Date.now(),
          },
        },
      });
    }
  }, [
    addBandPressKit,
    addBandSetlist,
    addBandSongList,
    addBandInputList,
    activeBandPlanState,
    navigate,
    routeBandId,
  ]);

  const renderContextFab = () => {
    if (!canShowContextFab || !bandSection) return null;

    if (bandSection === 'library') {
      return (
        <Link
          to="/songs/new"
          state={addSongFabState}
          className="fab-add-song"
          title="Create song"
          aria-label="Create song"
        >
          <Music size={20} />
        </Link>
      );
    }

    if (bandSection === 'songlists') {
      return (
        <button
          type="button"
          className="fab-add-song"
          title="Create songlist"
          aria-label="Create songlist"
          onClick={() => void createBandResource('songlist')}
        >
          <Folder size={20} />
        </button>
      );
    }

    if (bandSection === 'setlists') {
      return (
        <button
          type="button"
          className="fab-add-song"
          title="Create setlist"
          aria-label="Create setlist"
          onClick={() => void createBandResource('setlist')}
        >
          <ListMusic size={20} />
        </button>
      );
    }

    if (bandSection === 'press-kit') {
      return (
        <button
          type="button"
          className="fab-add-song"
          title="Create press kit"
          aria-label="Create press kit"
          onClick={() => void createBandResource('pressKit')}
        >
          <Newspaper size={20} />
        </button>
      );
    }

    return (
      <button
        type="button"
        className="fab-add-song"
        title="Create input list"
        aria-label="Create input list"
        onClick={() => void createBandResource('rider')}
      >
        <ClipboardList size={20} />
      </button>
    );
  };

  const toggleFullscreen = async () => {
    if (typeof document === 'undefined') return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore failures when fullscreen is unavailable or blocked by the browser.
    }
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');

    const updateViewport = (matches: boolean) => {
      setIsNarrowViewport(matches);
      setSidebarOpen((current) => (matches ? false : current));
    };

    updateViewport(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      updateViewport(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const leavingConcertRoute = wasConcertRouteRef.current && !isConcertRoute;

    if (isNarrowViewport || isConcertRoute) {
      setSidebarOpen(false);
    } else if (leavingConcertRoute) {
      setSidebarOpen(true);
    }

    wasConcertRouteRef.current = isConcertRoute;
  }, [pathname, isNarrowViewport, isConcertRoute]);

  useEffect(() => {
    if (!sidebarOpen || !isNarrowViewport) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen, isNarrowViewport]);

  useEffect(() => {
    if (typeof document === 'undefined' || !isNarrowViewport) return;

    const originalOverflow = document.body.style.overflow;
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = originalOverflow;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [sidebarOpen, isNarrowViewport]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();

    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncPersistedBandId = () => {
      try {
        setPersistedBandId(window.localStorage.getItem('gigboy-active-band-id'));
      } catch {
        setPersistedBandId(null);
      }
    };

    syncPersistedBandId();
    window.addEventListener('storage', syncPersistedBandId);
    return () => window.removeEventListener('storage', syncPersistedBandId);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextBandId = routeBandId ?? stateBandId;
    if (!nextBandId) return;
    try {
      window.localStorage.setItem('gigboy-active-band-id', nextBandId);
      setPersistedBandId(nextBandId);
    } catch {
      // Ignore localStorage sync failures.
    }
  }, [routeBandId, stateBandId]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const rootStyle = document.documentElement.style;

    if (!themedBandId) {
      rootStyle.removeProperty('--bands-hue');
      rootStyle.removeProperty('--bands-hue-soft');
      rootStyle.removeProperty('--bands-hue-contrast');
      return;
    }

    const contrast = dark ? '#1b1512' : '#ffffff';
    const bandColor = '#1565c0';

    rootStyle.setProperty('--bands-hue', bandColor);
    rootStyle.setProperty(
      '--bands-hue-soft',
      `color-mix(in srgb, ${bandColor} ${dark ? '26%' : '16%'}, ${dark ? '#0f0f10' : '#ffffff'})`
    );
    rootStyle.setProperty('--bands-hue-contrast', contrast);
  }, [dark, themedBandId]);

  useEffect(() => {
    if (!feedbackOpen) return;

    const handleWindowClick = (event: MouseEvent) => {
      if (!feedbackPopoverRef.current) return;
      if (feedbackPopoverRef.current.contains(event.target as Node)) return;
      setFeedbackOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFeedbackOpen(false);
      }
    };

    window.addEventListener('mousedown', handleWindowClick);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handleWindowClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [feedbackOpen]);

  const handleSubmitFeedback = async () => {
    if (!db || !user?.id || !feedbackMessage.trim() || feedbackSubmitting) return;
    setFeedbackSubmitting(true);
    try {
      await submitFeedback(db, {
        userId: user.id,
        email: user.email ?? null,
        message: feedbackMessage,
        page: pathname,
      });
      toast.success('Thanks for the feedback!');
      setFeedbackMessage('');
      setFeedbackOpen(false);
    } catch (error) {
      console.error('Failed to submit feedback', error);
      toast.error('Could not send feedback. Please try again.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  return (
    <div className="app-shell" data-library-mode={themedBandId ? 'bands' : 'solo'}>
      <header className="topbar">
        <button
          type="button"
          className="topbar-sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          aria-pressed={sidebarOpen}
          aria-controls="app-sidebar"
        >
          <PanelLeft size={20} />
        </button>
        <Link to={themedBandId ? `/bands/${themedBandId}/library` : '/'} className="topbar-brand">
          <BrandMark size={35} scale={1} />
        </Link>
        <nav className="topbar-nav">
          <div className="topbar-feedback" ref={feedbackPopoverRef}>
            <button
              type="button"
              onClick={() => setFeedbackOpen((current) => !current)}
              className={['topbar-feedback-trigger', feedbackOpen ? 'active' : ''].filter(Boolean).join(' ')}
              title="Send feedback"
              aria-label="Send feedback"
              aria-expanded={feedbackOpen}
              aria-haspopup="dialog"
              aria-controls="topbar-feedback-popover"
            >
              <MessageSquare size={16} />
              <span className="topbar-link-label">Feedback</span>
            </button>

            {feedbackOpen ? (
              <div id="topbar-feedback-popover" className="topbar-feedback-popover" role="dialog" aria-label="Send feedback">
                <div className="topbar-feedback-popover-header">
                  <h2>Feedback</h2>
                </div>
                <div className="topbar-feedback-popover-content">
                  <textarea
                    className="topbar-feedback-textarea"
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                    placeholder="What's on your mind? Bugs, ideas, anything."
                    rows={4}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="setlist-action-btn"
                    disabled={!feedbackMessage.trim() || feedbackSubmitting}
                    onClick={() => void handleSubmitFeedback()}
                  >
                    {feedbackSubmitting ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleDark}
            className="topbar-icon-btn"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={dark}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="topbar-icon-btn"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          {user && (
            <Link
              to="/profile"
              className={pathname === '/profile' ? 'active topbar-profile-link' : 'topbar-profile-link'}
              title={`Open profile (${user.email})`}
              aria-current={pathname === '/profile' ? 'page' : undefined}
            >
              <UserAvatar avatar={user.avatar} label={user.username ?? user.email} size="sm" />
              <span className="topbar-link-label">Profile</span>
            </Link>
          )}
        </nav>
      </header>

      <div
        className={`app-body${isNarrowViewport ? ' app-body--narrow' : ''}`}
        onPointerDown={(event) => {
          if (!isNarrowViewport || event.pointerType === 'mouse') return;
          swipeRef.current = {
            x: event.clientX,
            y: event.clientY,
            fromEdge: event.clientX <= 32,
          };
        }}
        onPointerUp={(event) => {
          if (!swipeRef.current || event.pointerType === 'mouse') return;
          const { x, y, fromEdge } = swipeRef.current;
          swipeRef.current = null;
          const dx = event.clientX - x;
          const dy = event.clientY - y;
          // Require clear horizontal dominance and ≥55 px travel
          if (Math.abs(dy) > Math.abs(dx) * 0.75 || Math.abs(dx) < 55) return;
          if (!sidebarOpen && fromEdge && dx > 0) setSidebarOpen(true);
          else if (sidebarOpen && dx < 0) setSidebarOpen(false);
        }}
      >
        <Sidebar
          open={sidebarOpen}
          mobile={isNarrowViewport}
          onNavigate={isNarrowViewport ? () => setSidebarOpen(false) : undefined}
          onClose={() => setSidebarOpen(false)}
        />
        {isNarrowViewport && sidebarOpen && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main
          id="main-content"
          ref={mainContentRef}
          tabIndex={-1}
          className={`main-content${isConcertRoute ? ' main-content--concert' : ''}${isBandRoute || (themedBandId && pathname.startsWith('/profile')) ? ' main-content--band' : ''}`}
        >
          {children}
          <footer className="footer">
            From Norway {'<3'} with chords
            <span className="footer-links">
              <Link to="/terms">Terms</Link>
              <Link to="/privacy">Privacy</Link>
            </span>
          </footer>
        </main>
        {renderContextFab()}
      </div>
    </div>
  );
}
