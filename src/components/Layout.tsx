import { useState } from 'react';
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { dark, toggle: toggleDark } = useDarkMode();

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
          <Music size={22} />
          <span>Songbook</span>
        </Link>
        <nav className="topbar-nav">
          <Link to="/" className={pathname === '/' ? 'active' : ''}>
            <BookOpen size={16} /> Songs
          </Link>
          <Link to="/add" className={pathname === '/add' ? 'active' : ''}>
            <Plus size={16} /> Add Song
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
          Firebase is not configured in this deployment. Songbook is running in local-only mode.
        </div>
      )}
      <div className="app-body">
        <Sidebar open={sidebarOpen} />
        <main className="main-content">{children}</main>
      </div>
      <footer className="footer">
        <p>Songbook — open source music chords &amp; lyrics</p>
      </footer>
    </div>
  );
}
