import { FormEvent, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, register, loginWithGoogle, loginWithGithub } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const err = mode === 'register'
      ? await register(email, password)
      : await login(email, password);

    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function handleProviderAuth(kind: 'google' | 'github') {
    setBusy(true);
    setError('');
    const err = kind === 'google' ? await loginWithGoogle() : await loginWithGithub();
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <BookOpen size={28} />
          <span>Folio</span>
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
            Continue with Google
          </button>
          <button
            type="button"
            className="btn-secondary oauth-btn"
            onClick={() => { void handleProviderAuth('github'); }}
            disabled={busy}
          >
            Continue with GitHub
          </button>
        </div>

        <p className="login-divider" role="separator" aria-label="or">
          <span>or with email</span>
        </p>

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
            {busy
              ? (mode === 'register' ? 'Creating account…' : 'Signing in…')
              : (mode === 'register' ? 'Create account' : 'Sign in')}
          </button>
        </form>
      </div>
    </div>
  );
}
