import { Link, useLocation } from 'react-router-dom';
import { Music, BookOpen, Plus, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

interface Props {
  children: ReactNode;
}

export default function Layout({ children }: Props) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
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
          {user && (
            <button onClick={logout} className="topbar-logout" title={`Sign out (${user.email})`}>
              <LogOut size={16} />
            </button>
          )}
        </nav>
      </header>
      <main className="main-content">{children}</main>
      <footer className="footer">
        <p>Songbook — open source music chords &amp; lyrics</p>
      </footer>
    </div>
  );
}
