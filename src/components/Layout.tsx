import { Link, useLocation } from 'react-router-dom';
import { Music, BookOpen, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export default function Layout({ children }: Props) {
  const { pathname } = useLocation();

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
        </nav>
      </header>
      <main className="main-content">{children}</main>
      <footer className="footer">
        <p>Songbook — open source music chords &amp; lyrics</p>
      </footer>
    </div>
  );
}
