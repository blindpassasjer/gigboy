import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Music, BookOpen, Plus, LogOut, PanelLeft, Sun, Moon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import { useDarkMode } from '../hooks/useDarkMode';

interface Props {
  children: ReactNode;
}

export default function Layout({ children }: Props) {
  const { pathname } = useLocation();
  const { user, logout, authEnabled, authError } = useAuth();
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 900px)').matches;
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 900px)').matches;
  });
  const { dark, toggle: toggleDark } = useDarkMode();

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');

    const updateViewport = (matches: boolean) => {
      setIsNarrowViewport(matches);
      setSidebarOpen((current) => (matches ? false : current || true));
    };

    updateViewport(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      updateViewport(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (isNarrowViewport) {
      setSidebarOpen(false);
    }
  }, [pathname, isNarrowViewport]);

  useEffect(() => {
    if (!sidebarOpen || !isNarrowViewport) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen, isNarrowViewport]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="topbar-sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          title="Toggle sidebar"
          aria-pressed={sidebarOpen}
        >
          <PanelLeft size={20} />
        </button>
        <Link to="/" className="topbar-brand">
          <BookOpen size={22} />
          <span>Folio</span>
        </Link>
        <nav className="topbar-nav">
          <Link to="/" className={pathname === '/' ? 'active' : ''}>
            <Music size={16} /> <span>Songs</span>
          </Link>
          <Link to="/add" className={pathname === '/add' ? 'active' : ''}>
            <Plus size={16} /> <span>Add Song</span>
          </Link>
          <button
            onClick={toggleDark}
            className="topbar-logout"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={dark}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {user && (
            <button onClick={logout} className="topbar-logout" title={`Sign out (${user.email})`}>
              <LogOut size={16} />
            </button>
          )}
        </nav>
      </header>
      {!authEnabled && authError && (
        <div className="app-notice" role="status">
          Firebase is not configured in this deployment. Folio is running in local-only mode.
        </div>
      )}
      <div className={`app-body${isNarrowViewport ? ' app-body--narrow' : ''}`}>
        <Sidebar open={sidebarOpen} mobile={isNarrowViewport} onNavigate={() => setSidebarOpen(false)} onClose={() => setSidebarOpen(false)} />
        {isNarrowViewport && sidebarOpen && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main className="main-content">{children}</main>
      </div>
      <footer className="footer">
        <p>Folio - open source music chords &amp; lyrics</p>
      </footer>
    </div>
  );
}
