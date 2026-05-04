import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PanelLeft, Sun, Moon, Maximize2, Minimize2, Mail, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import Sidebar from './Sidebar';
import BrandMark from './BrandMark';
import { useDarkMode } from '../hooks/useDarkMode';
import { useInviteNotifications } from '../hooks/useInviteNotifications';
import UserAvatar from './UserAvatar';

interface Props {
  children: ReactNode;
}

function hashBandHue(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const positiveHash = Math.abs(hash);
  return positiveHash % 360;
}

export default function Layout({ children }: Props) {
  const { pathname, state } = useLocation();
  const { bands } = useBands();
  const { user } = useAuth();
  const { pendingIncomingCount, unseenAcceptedOutgoing } = useInviteNotifications();
  const isConcertRoute = pathname.startsWith('/setlists/') && pathname.endsWith('/concert');
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
  const themedBand = themedBandId ? bands.find((entry) => entry.id === themedBandId) ?? null : null;
  const bandSection = routeBandId ? (routeSegments[2] ?? 'library') : null;
  const bandSongListId = routeBandId && bandSection === 'songlists' ? (routeSegments[3] ?? null) : null;
  const showAddSongFab = Boolean(routeBandId) && (bandSection === 'library' || bandSection === 'songlists');
  const addSongFabState = routeBandId
    ? {
      addSongScope: {
        kind: 'band' as const,
        bandId: routeBandId,
      },
      ...(bandSongListId ? { initialSongListId: bandSongListId } : {}),
    }
    : undefined;
  const wasConcertRouteRef = useRef(isConcertRoute);
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 900px)').matches;
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 900px)').matches;
  });
  const { dark, toggle: toggleDark } = useDarkMode();
  const mainContentRef = useRef<HTMLElement>(null);
  const swipeRef = useRef<{ x: number; y: number; fromEdge: boolean } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(document.fullscreenElement);
  });
  const unseenAcceptedCount = unseenAcceptedOutgoing.length;
  const inviteNotificationCount = pendingIncomingCount + unseenAcceptedCount;
  const hasInviteNotifications = inviteNotificationCount > 0;
  const inviteNoticeVariant = pendingIncomingCount > 0 && unseenAcceptedCount > 0
    ? 'mixed'
    : unseenAcceptedCount > 0
      ? 'accepted'
      : 'pending';
  const inviteLabel = [
    pendingIncomingCount > 0 ? `${pendingIncomingCount} pending` : null,
    unseenAcceptedCount > 0 ? `${unseenAcceptedCount} accepted` : null,
  ].filter(Boolean).join(', ');

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

    const hue = hashBandHue(themedBandId);
    const fallbackHue = dark
      ? `hsl(${hue} 78% 70%)`
      : `hsl(${hue} 64% 46%)`;
    const softHue = dark
      ? `hsl(${hue} 40% 20%)`
      : `hsl(${hue} 76% 94%)`;
    const contrast = dark ? '#1b1512' : '#ffffff';

    const bandColor = themedBand?.color?.trim();

    rootStyle.setProperty('--bands-hue', bandColor || fallbackHue);
    rootStyle.setProperty(
      '--bands-hue-soft',
      bandColor
        ? `color-mix(in srgb, ${bandColor} ${dark ? '26%' : '16%'}, ${dark ? '#0f0f10' : '#ffffff'})`
        : softHue
    );
    rootStyle.setProperty('--bands-hue-contrast', contrast);
  }, [dark, themedBand?.color, themedBandId]);

  return (
    <div className="app-shell" data-library-mode={themedBandId ? 'bands' : 'solo'}>
      <a
        href="#main-content"
        className="skip-link"
        onClick={() => {
          window.requestAnimationFrame(() => {
            mainContentRef.current?.focus();
          });
        }}
      >
        Skip to main content
      </a>
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
          <BrandMark size={22} />
        </Link>
        <nav className="topbar-nav">
          <Link
            to="/profile/invites"
            className={[
              pathname === '/profile/invites' ? 'active' : '',
              hasInviteNotifications ? 'topbar-link--has-notification' : '',
            ].filter(Boolean).join(' ')}
            aria-current={pathname === '/profile/invites' ? 'page' : undefined}
            title={hasInviteNotifications ? `Invites (${inviteLabel})` : 'Invites'}
          >
            <Mail size={16} />
            <span>Invites</span>
            {hasInviteNotifications ? (
              <span
                className={`topbar-link-notice topbar-link-notice--${inviteNoticeVariant}`}
                aria-label={`Invites: ${inviteLabel}`}
              >
                {inviteNotificationCount}
              </span>
            ) : null}
          </Link>
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
              <span>Profile</span>
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
        <Sidebar open={sidebarOpen} mobile={isNarrowViewport} onNavigate={isNarrowViewport ? () => setSidebarOpen(false) : undefined} onClose={() => setSidebarOpen(false)} />
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
          className={`main-content${isConcertRoute ? ' main-content--concert' : ''}${isBandRoute ? ' main-content--band' : ''}`}
        >
          {children}
        </main>
        {showAddSongFab && (
          <Link
            to="/songs/new"
            state={addSongFabState}
            className="fab-add-song"
            title="Add new song"
            aria-label="Add new song"
          >
            <Plus size={20} />
          </Link>
        )}
      </div>
    </div>
  );
}
