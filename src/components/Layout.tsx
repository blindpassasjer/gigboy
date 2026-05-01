import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Plus, Menu, Sun, Moon, Maximize2, Minimize2, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import { useDarkMode } from '../hooks/useDarkMode';
import UserAvatar from './UserAvatar';

interface Props {
  children: ReactNode;
}

export default function Layout({ children }: Props) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isConcertRoute = pathname.startsWith('/setlists/') && pathname.endsWith('/concert');
  const isBandRoute = pathname.startsWith('/bands');
  const isBandLibraryRoute = /^\/bands\/[^/]+(?:\/library)?$/.test(pathname);
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
  const [isFullscreen, setIsFullscreen] = useState(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(document.fullscreenElement);
  });

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

    if (isNarrowViewport || isConcertRoute || leavingConcertRoute) {
      setSidebarOpen(false);
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
    if (typeof document === 'undefined') return;

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();

    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="topbar-sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          title="Toggle sidebar"
          aria-pressed={sidebarOpen}
        >
          <Menu size={20} />
        </button>
        <Link to="/" className="topbar-brand">
          <BookOpen size={22} />
          <span>Folio</span>
        </Link>
        <nav className="topbar-nav">
          <Link to="/profile/invites" className={pathname === '/profile/invites' ? 'active' : ''}>
            <User size={16} /> <span>Invites</span>
          </Link>
          <button
            onClick={toggleDark}
            className="topbar-icon-btn"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={dark}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={toggleFullscreen}
            className="topbar-icon-btn"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          {user && (
            <Link to="/profile" className={pathname === '/profile' ? 'active topbar-profile-link' : 'topbar-profile-link'} title={`Open profile (${user.email})`}>
              <UserAvatar avatar={user.avatar} label={user.username ?? user.email} size="sm" />
              <span>Profile</span>
            </Link>
          )}
        </nav>
      </header>

      <div className={`app-body${isNarrowViewport ? ' app-body--narrow' : ''}`}>
        <Sidebar open={sidebarOpen} mobile={isNarrowViewport} onNavigate={isNarrowViewport ? () => setSidebarOpen(false) : undefined} onClose={() => setSidebarOpen(false)} />
        {isNarrowViewport && sidebarOpen && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main className={`main-content${isConcertRoute ? ' main-content--concert' : ''}`}>{children}</main>
      </div>
      {!isConcertRoute && (!isBandRoute || isBandLibraryRoute) && (
        <Link to="/add" className="fab-add-song" title="create song" aria-label="create song">
          <Plus size={22} />
        </Link>
      )}
    </div>
  );
}
