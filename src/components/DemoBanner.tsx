import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { normalizeUsername, validateUsername } from '../lib/userProfiles';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="oauth-provider-icon">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.31h6.44a5.5 5.5 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.58-5.13 3.58-8.66Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.86-3A7.19 7.19 0 0 1 12 19.3a7.16 7.16 0 0 1-6.72-4.95H1.29v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.28 14.35A7.16 7.16 0 0 1 4.9 12c0-.82.14-1.62.38-2.35V6.56H1.29A12 12 0 0 0 0 12c0 1.94.46 3.78 1.29 5.44l3.99-3.09Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.82l3.43-3.43C17.94 1.24 15.24 0 12 0A12 12 0 0 0 1.29 6.56l3.99 3.09A7.16 7.16 0 0 1 12 4.77Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="oauth-provider-icon oauth-provider-icon--muted">
      <path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.85 10.91.57.11.78-.25.78-.55 0-.27-.01-1.16-.02-2.1-3.19.69-3.87-1.35-3.87-1.35-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.74.4-1.26.72-1.55-2.54-.29-5.22-1.27-5.22-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.17a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.17 3.17-1.17.63 1.58.24 2.75.12 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.68 5.37-5.24 5.66.41.35.78 1.04.78 2.1 0 1.52-.01 2.75-.01 3.13 0 .3.21.67.79.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export default function DemoBanner() {
  const { upgradeDemo, upgradeDemoWithGoogle, upgradeDemoWithGithub, logout } = useAuth();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    const usernameError = validateUsername(username);
    if (usernameError) { setError(usernameError); return; }
    setBusy(true);
    setError('');
    const err = await upgradeDemo(email, password, normalizeUsername(username));
    if (err) {
      setError(err);
      setBusy(false);
    } else {
      navigate('/profile');
    }
  }

  async function handleOAuth(kind: 'google' | 'github') {
    setBusy(true);
    setError('');
    const err = kind === 'google' ? await upgradeDemoWithGoogle() : await upgradeDemoWithGithub();
    if (err) {
      setError(err);
      setBusy(false);
    } else {
      navigate('/profile');
    }
  }

  async function handleExit() {
    await logout();
  }

  return (
    <div className="demo-banner" role="status" aria-live="polite">
      <div className="demo-banner-bar">
        <span className="demo-banner-label">
          <Sparkles size={14} aria-hidden="true" />
          Demo mode — data resets when you leave
        </span>
        <div className="demo-banner-actions">
          <button
            type="button"
            className="demo-banner-signup-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <LogIn size={13} aria-hidden="true" />
            Save my data
          </button>
          <button
            type="button"
            className="demo-banner-exit-btn"
            onClick={() => void handleExit()}
            title="Exit demo"
            aria-label="Exit demo"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="demo-banner-form-wrap">
          <p className="demo-banner-form-intro">
            Create a free account to keep your songs and switch to a paid plan later.
            Your demo songs will carry over.
          </p>

          <div className="demo-banner-oauth">
            <button
              type="button"
              className="btn-secondary oauth-btn demo-banner-oauth-btn"
              onClick={() => void handleOAuth('google')}
              disabled={busy}
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <button
              type="button"
              className="btn-secondary oauth-btn demo-banner-oauth-btn"
              onClick={() => void handleOAuth('github')}
              disabled={busy}
            >
              <GitHubIcon />
              Continue with GitHub
            </button>
          </div>

          <p className="login-divider" role="separator" aria-label="or">
            <span>or with email</span>
          </p>

          <form className="demo-banner-form" onSubmit={(e) => void handleSignUp(e)} noValidate>
            <div className="demo-banner-form-row">
              <div className="form-field">
                <label htmlFor="demo-username">Username</label>
                <input
                  id="demo-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="demo-email">Email</label>
                <input
                  id="demo-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="demo-password">Password</label>
                <input
                  id="demo-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  required
                />
              </div>
            </div>
            {error && <p className="login-error">{error}</p>}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account & save data'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
