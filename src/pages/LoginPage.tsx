import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music2, ListMusic, Users, MonitorSpeaker, Mic2, Share2, type LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandMark from '../components/BrandMark';
import { normalizeUsername, validateUsername } from '../lib/userProfiles';

const LOGIN_FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Music2,
    title: 'Song library',
    description: 'Chord charts, lyrics, and notes — all in one place.',
  },
  {
    icon: ListMusic,
    title: 'Setlists',
    description: 'Arrange sets in seconds. Rehearsal and concert views.',
  },
  {
    icon: Users,
    title: 'Band collaboration',
    description: 'Shared workspace for your whole band.',
  },
  {
    icon: MonitorSpeaker,
    title: 'Stage plots & riders',
    description: 'Send pro-ready documents straight to the venue.',
  },
  {
    icon: Mic2,
    title: 'Rehearsal recordings',
    description: 'Capture and replay run-throughs in the app.',
  },
  {
    icon: Share2,
    title: 'Public share links',
    description: 'Share setlists and riders with engineers or fans.',
  },
];

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="oauth-provider-icon">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.31h6.44a5.5 5.5 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.58-5.13 3.58-8.66Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.86-3A7.19 7.19 0 0 1 12 19.3a7.16 7.16 0 0 1-6.72-4.95H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.35A7.16 7.16 0 0 1 4.9 12c0-.82.14-1.62.38-2.35V6.56H1.29A12 12 0 0 0 0 12c0 1.94.46 3.78 1.29 5.44l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.82l3.43-3.43C17.94 1.24 15.24 0 12 0A12 12 0 0 0 1.29 6.56l3.99 3.09A7.16 7.16 0 0 1 12 4.77Z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="oauth-provider-icon oauth-provider-icon--muted">
      <path
        fill="currentColor"
        d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.85 10.91.57.11.78-.25.78-.55 0-.27-.01-1.16-.02-2.1-3.19.69-3.87-1.35-3.87-1.35-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.74.4-1.26.72-1.55-2.54-.29-5.22-1.27-5.22-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.17a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.17 3.17-1.17.63 1.58.24 2.75.12 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.68 5.37-5.24 5.66.41.35.78 1.04.78 2.1 0 1.52-.01 2.75-.01 3.13 0 .3.21.67.79.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
      />
    </svg>
  );
}

function getPostLoginDestination(): { path: string; state?: { bandId: string } } {
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

  return { path: '/profile' };
}

function LoginHero() {
  return (
    <aside className="login-hero" aria-label="GIGBOY features">
      <div className="login-brand login-brand--hero">
        <BrandMark size={30} />
      </div>
      <h1 className="login-hero-title">Your songs, your stage.</h1>
      <p className="login-hero-copy">
        Plan, perform, and stay in sync with one shared workspace for your music.
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
  const {
    login,
    register,
    loginWithGoogle,
    loginWithGithub,
    pendingLinkEmail,
    linkWithPassword,
    cancelPendingLink,
  } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');

    if (mode === 'register') {
      const usernameError = validateUsername(username);
      if (usernameError) {
        setError(usernameError);
        setBusy(false);
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        setBusy(false);
        return;
      }
    }

    const err = mode === 'register'
      ? await register(email, password, normalizeUsername(username))
      : await login(email, password);

    if (err) {
      setError(err);
      setBusy(false);
    } else {
      const destination = getPostLoginDestination();
      navigate(destination.path, destination.state ? { state: destination.state } : undefined);
    }
  }

  async function handleProviderAuth(kind: 'google' | 'github') {
    setBusy(true);
    setError('');
    const err = kind === 'google' ? await loginWithGoogle() : await loginWithGithub();
    if (err) {
      setError(err);
      setBusy(false);
    } else if (!pendingLinkEmail) {
      const destination = getPostLoginDestination();
      navigate(destination.path, destination.state ? { state: destination.state } : undefined);
    }
    setBusy(false);
  }

  async function handleLinkAccounts(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const err = await linkWithPassword(linkPassword);
    if (err) {
      setError(err);
    } else {
      setLinkPassword('');
    }
    setBusy(false);
  }

  if (pendingLinkEmail) {
    return (
      <div className="login-screen">
        <LoginBackdrop />
        <div className="login-shell">
          <LoginHero />
          <div className="login-card">
            <div className="login-brand">
              <BrandMark size={28} />
            </div>
            <h1 className="login-title">Link accounts</h1>
            <p className="login-description">
              An account with <strong>{pendingLinkEmail}</strong> already exists. Enter your password to link it with your new sign-in method.
            </p>
            <form className="login-form" onSubmit={handleLinkAccounts} noValidate>
              <div className="form-field">
                <label htmlFor="link-password">Password</label>
                <input
                  id="link-password"
                  type="password"
                  autoComplete="current-password"
                  value={linkPassword}
                  onChange={(e) => { setLinkPassword(e.target.value); setError(''); }}
                  required
                />
              </div>
              {error && <p className="login-error">{error}</p>}
              <button type="submit" className="btn-primary login-submit" disabled={busy}>
                {busy ? 'Linking...' : 'Link accounts'}
              </button>
              <button
                type="button"
                className="btn-secondary login-submit"
                onClick={() => { cancelPendingLink(); setError(''); setLinkPassword(''); }}
                disabled={busy}
              >
                Cancel
              </button>
            </form>
            <footer className="footer">From Norway - with chords</footer>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <LoginBackdrop />
      <div className="login-shell">
        <LoginHero />
        <div className="login-card">
          <div className="login-brand">
            <BrandMark size={28} />
          </div>
          <h1 className="login-title">{mode === 'register' ? 'Create account' : 'Sign in'}</h1>

          <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === 'login' ? 'auth-mode-btn auth-mode-btn--active' : 'auth-mode-btn'}
              onClick={() => { setMode('login'); setError(''); }}
              disabled={busy}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'auth-mode-btn auth-mode-btn--active' : 'auth-mode-btn'}
              onClick={() => { setMode('register'); setError(''); }}
              disabled={busy}
            >
              Register
            </button>
          </div>

          <div className="oauth-buttons">
            <button
              type="button"
              className="btn-secondary oauth-btn"
              onClick={() => { void handleProviderAuth('google'); }}
              disabled={busy}
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <button
              type="button"
              className="btn-secondary oauth-btn"
              onClick={() => { void handleProviderAuth('github'); }}
              disabled={busy}
            >
              <GitHubIcon />
              Continue with GitHub
            </button>
          </div>

          <p className="login-divider" role="separator" aria-label="or">
            <span>or with email</span>
          </p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {mode === 'register' ? (
              <div className="form-field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  required
                />
              </div>
            ) : null}
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
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                required
              />
            </div>
            {mode === 'register' ? (
              <div className="form-field">
                <label htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                  required
                />
              </div>
            ) : null}
            {error && <p className="login-error">{error}</p>}
            <button type="submit" className="btn-primary login-submit" disabled={busy}>
              {busy
                ? (mode === 'register' ? 'Creating account...' : 'Signing in...')
                : (mode === 'register' ? 'Create account' : 'Sign in')}
            </button>
          </form>
          <footer className="footer">From Norway - with chords</footer>
        </div>
      </div>
    </div>
  );
}
