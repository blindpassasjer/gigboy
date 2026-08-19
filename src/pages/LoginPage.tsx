import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { Music2, ListMusic, Users, MonitorSpeaker, Mic2, Newspaper, ClipboardList, Piano, Activity, type LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandMark from '../components/BrandMark';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const LOGIN_FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Music2,
    title: 'Song library',
    description: 'Chord charts, tabs, lyrics, and hand notes — everything for your songs.',
  },
  {
    icon: ListMusic,
    title: 'Setlists',
    description: 'Build sets in seconds. Rehearsal and concert modes included.',
  },
  {
    icon: Users,
    title: 'Band collaboration',
    description: 'A shared workspace for every member of your band.',
  },
  {
    icon: MonitorSpeaker,
    title: 'Stage plots & riders',
    description: 'Professional stage diagrams and tech riders, ready to send.',
  },
  {
    icon: Newspaper,
    title: 'Press kits',
    description: 'Rich band bio, photos, and assets — share via a single link.',
  },
  {
    icon: ClipboardList,
    title: 'Input lists',
    description: 'Build and share stage input lists with your FOH engineer.',
  },
  {
    icon: Piano,
    title: 'Chord diagrams',
    description: 'Tap any chord for instant guitar and piano fingerings.',
  },
  {
    icon: Activity,
    title: 'Tuner & metronome',
    description: 'Built-in chromatic tuner and visual metronome — no extra apps.',
  },
  {
    icon: Mic2,
    title: 'Rehearsal recordings',
    description: 'Record and replay run-throughs without leaving the app.',
  },
];

function getPostLoginDestination(location: Location): { path: string; state?: unknown } {
  // If the user landed here via a specific deep link (e.g. a band invite link) while
  // signed out, send them back there after auth instead of the generic default landing spot.
  if (location.pathname && location.pathname !== '/' && location.pathname !== '/bands') {
    return { path: `${location.pathname}${location.search}`, state: location.state };
  }

  if (typeof window === 'undefined') {
    return { path: '/profile' };
  }

  try {
    const lastBandId = window.localStorage.getItem('gigboy-active-band-id')?.trim();
    if (lastBandId) {
      return {
        path: `/bands/${lastBandId}/library`,
        state: { bandId: lastBandId },
      };
    }
  } catch {
    // Ignore localStorage failures and fall back to profile.
  }

  return { path: '/' };
}

function LoginHero() {
  return (
    <aside className="login-hero" aria-label="GIGBOY features">
      <div className="login-brand login-brand--hero">
        <BrandMark size={90} />
      </div>
      <h1 className="login-hero-title">Your songs, your stage.</h1>
      <p className="login-hero-copy">
        Everything a working band needs — from rehearsal to the headline slot — in one shared workspace.
      </p>
      <ul className="login-feature-list">
        {LOGIN_FEATURES.map(({ icon: Icon, title, description }) => (
          <li key={title} className="login-feature-item">
            <Icon size={16} className="login-feature-icon" aria-hidden="true" />
            <h2>{title}</h2>
            <p>{description}</p>
          </li>
        ))}
      </ul>
      <p className="login-hero-pricing">
        Free to get started &mdash; paid plans unlock more.
      </p>
      <div className="login-founder">
        <img
          src="/founder.jpg"
          alt="Sebastian, founder of GIGBOY, playing guitar"
          className="login-founder-photo"
        />
        <p className="login-founder-copy">
          After 20+ years touring Europe as a musician, I built the tool I always wished existed
          &mdash; made by a musician, for musicians.
        </p>
      </div>
    </aside>
  );
}

const NOTE_SYMBOLS = ['♩', '♪', '♫', '♬', '♭', '♯', '♮'];

interface NoteParticle {
  x: number; y: number;
  vx: number; vy: number;
  symbol: string;
  size: number;
  opacity: number;
  angle: number;
  va: number;
}

function randomNote(w: number, h: number, spreadY = false): NoteParticle {
  return {
    x: Math.random() * w,
    y: spreadY ? Math.random() * h : h + 20 + Math.random() * 120,
    vx: (Math.random() - 0.5) * 0.5,
    vy: -(0.6 + Math.random() * 1.0),
    symbol: NOTE_SYMBOLS[Math.floor(Math.random() * NOTE_SYMBOLS.length)],
    size: 18 + Math.random() * 34,
    opacity: 0.45 + Math.random() * 0.45,
    angle: (Math.random() - 0.5) * 0.5,
    va: (Math.random() - 0.5) * 0.012,
  };
}

function MusicNotesBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const COUNT = 40;
    let notes: NoteParticle[] = [];
    let raf: number;
    let accentColor = '#1a6fc4';

    // Capture non-null locals so inner closures don't re-check nullable refs
    const cvs = canvas;
    const context = ctx;

    function syncSize() {
      cvs.width = cvs.parentElement ? cvs.parentElement.offsetWidth : window.innerWidth;
      cvs.height = cvs.parentElement ? cvs.parentElement.offsetHeight : window.innerHeight;
      accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent').trim() || '#1a6fc4';
    }

    syncSize();
    notes = Array.from({ length: COUNT }, (_, i) =>
      randomNote(cvs.width, cvs.height, i < COUNT * 0.8)
    );

    const ro = new ResizeObserver(syncSize);
    ro.observe(document.documentElement);

    function draw() {
      context.clearRect(0, 0, cvs.width, cvs.height);
      for (const n of notes) {
        n.x += n.vx;
        n.y += n.vy;
        n.angle += n.va;
        if (n.y < -60) {
          Object.assign(n, randomNote(cvs.width, cvs.height));
        }
        context.save();
        context.translate(n.x, n.y);
        context.rotate(n.angle);
        context.globalAlpha = n.opacity;
        context.fillStyle = accentColor;
        context.font = `${n.size}px serif`;
        context.fillText(n.symbol, 0, 0);
        context.restore();
      }
      raf = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="login-notes-canvas" aria-hidden="true" />;
}

function LoginBackdrop() {
  return (
    <div className="login-bg" aria-hidden="true">
      <MusicNotesBg />
      <span className="login-glow login-glow--1" />
      <span className="login-glow login-glow--2" />
      <span className="login-ring login-ring--1" />
      <span className="login-ring login-ring--2" />
      <span className="login-spark login-spark--1" />
      <span className="login-spark login-spark--2" />
      <span className="login-spark login-spark--3" />
      <span className="login-spark login-spark--4" />
      <span className="login-spark login-spark--5" />
      <span className="login-spark login-spark--6" />
      <span className="login-grid" />
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useDocumentTitle('Sign in');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');

    const err = await login(email, password);

    if (err) {
      setError(err);
      setBusy(false);
    } else {
      const destination = getPostLoginDestination(location);
      navigate(destination.path, destination.state ? { state: destination.state } : undefined);
    }
  }

  return (
    <div className="login-screen">
      <LoginBackdrop />
      <div className="login-shell">
        <LoginHero />
        <div className="login-card">
          <h1 className="login-title">Sign in</h1>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="form-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                required
              />
            </div>
            {error && <p className="login-error">{error}</p>}
            <button type="submit" className="btn-primary login-submit" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <footer className="footer">
            From Norway {'<3'} with chords
            <span className="footer-links">
              <Link to="/showcase">See it in action</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/privacy">Privacy</Link>
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}
