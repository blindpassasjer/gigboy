import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CreditCard, LogOut, Sparkles, Users } from 'lucide-react';
import toast from '../utils/anchoredToast';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import UserAvatar from '../components/UserAvatar';
import { AVATAR_OPTIONS } from '../lib/avatars';
import { normalizeUsername, validateUsername } from '../lib/userProfiles';
import { useStorageUsage } from '../hooks/useStorageUsage';
import { usePlan } from '../hooks/usePlan';
import { createPortalSession } from '../lib/billingApi';
import { PLAN_LABELS } from '../lib/planLimits';

function formatStorageBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 * 1024 ? 0 : 1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatPeriodEnd(value: number | null) {
  if (!value) return null;
  const normalized = value > 1_000_000_000_000 ? value : value * 1000;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatSubscriptionStatus(status: string | null, complimentary: boolean) {
  if (complimentary) return 'Complimentary';
  if (!status) return 'Not subscribed';
  return status.replace('_', ' ');
}

export default function ProfilePage() {
  const { user, updateEmailAddress, updateUsername, updateAvatar, updateFullName, logout } = useAuth();
  const { bands } = useBands();
  const planState = usePlan();
  const storageUsage = useStorageUsage(user?.id, planState.storageQuotaBytes);

  const [email, setEmail] = useState(user?.email ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar ?? AVATAR_OPTIONS[0]);
  const [busyEmail, setBusyEmail] = useState(false);
  const [busyUsername, setBusyUsername] = useState(false);
  const [busyFullName, setBusyFullName] = useState(false);
  const [busyAvatar, setBusyAvatar] = useState(false);
  const [busyLogout, setBusyLogout] = useState(false);
  const [busyBilling, setBusyBilling] = useState(false);

  const displayName = useMemo(() => user?.fullName || user?.username || user?.email || 'User', [user?.email, user?.fullName, user?.username]);
  const storagePercent = Math.round(storageUsage.usageRatio * 100);
  const renewalDate = formatPeriodEnd(user?.currentPeriodEnd ?? null);
  const hasPaidPlan = planState.plan === 'pro' || planState.plan === 'band';

  if (!user) {
    return <p className="profile-settings-status">You must be signed in to manage your profile.</p>;
  }

  const onEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail) {
      toast.error('Email is required.');
      return;
    }

    setBusyEmail(true);
    const error = await updateEmailAddress(nextEmail);
    setBusyEmail(false);
    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Email updated.');
  };

  const onUsernameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = normalizeUsername(username);
    const validationError = validateUsername(candidate);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setBusyUsername(true);
    const error = await updateUsername(candidate);
    setBusyUsername(false);
    if (error) {
      toast.error(error);
      return;
    }

    setUsername(candidate);
    toast.success('Username updated.');
  };

  const onFullNameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = fullName.trim();
    if (!candidate) {
      toast.error('Full name is required.');
      return;
    }

    setBusyFullName(true);
    const error = await updateFullName(candidate);
    setBusyFullName(false);
    if (error) {
      toast.error(error);
      return;
    }

    setFullName(candidate);
    toast.success('Full name updated.');
  };

  const onSelectAvatar = async (avatar: string) => {
    setSelectedAvatar(avatar);
    setBusyAvatar(true);
    const error = await updateAvatar(avatar);
    setBusyAvatar(false);
    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Avatar updated.');
  };

  const onLogout = async () => {
    setBusyLogout(true);
    try {
      await logout();
    } finally {
      setBusyLogout(false);
    }
  };

  const handleManageBilling = async () => {
    if (!user.stripeCustomerId) {
      toast.error('No Stripe billing account is attached to this user yet.');
      return;
    }

    setBusyBilling(true);
    try {
      const result = await createPortalSession({
        userId: user.id,
        userEmail: user.email,
        returnUrl: `${window.location.origin}/profile`,
      });
      window.location.href = result.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open billing portal.';
      toast.error(message);
    } finally {
      setBusyBilling(false);
    }
  };

  return (
    <section className="profile-settings-page profile-settings-page--account">
      <header className="profile-account-hero">
        <div className="profile-account-hero-main">
          <UserAvatar avatar={user.avatar} label={displayName} size="lg" />
          <div className="profile-account-hero-copy">
            <span className="profile-account-kicker">Account</span>
            <h1>{displayName}</h1>
            <p>@{user.username ?? 'setup'} · {user.email}</p>
            <div className="profile-account-badges">
              <span className="profile-account-badge profile-account-badge--plan">
                <Sparkles size={14} /> {PLAN_LABELS[user.plan]}
              </span>
              <span className="profile-account-badge">
                <BadgeCheck size={14} /> {formatSubscriptionStatus(user.subscriptionStatus, user.planOverride)}
              </span>
              <span className="profile-account-badge">
                <Users size={14} /> {bands.length} band{bands.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="profile-account-grid">
        <section className="profile-settings-card profile-account-summary-card">
          <div className="profile-section-heading">
            <div>
              <h2>Subscription</h2>
              <p className="profile-settings-muted">Billing status, limits, and what this account can use right now.</p>
            </div>
          </div>
          <div className="profile-subscription-overview">
            <div className="profile-stat-card">
              <span className="profile-stat-label">Current plan</span>
              <strong>{planState.planLabel}</strong>
              <small>{planState.planOverride ? 'Admin override' : formatSubscriptionStatus(user.subscriptionStatus, false)}</small>
            </div>
            <div className="profile-stat-card">
              <span className="profile-stat-label">Renewal</span>
              <strong>{renewalDate ?? '—'}</strong>
              <small>{hasPaidPlan ? 'Billing period end' : 'No recurring subscription'}</small>
            </div>
            <div className="profile-stat-card">
              <span className="profile-stat-label">Storage</span>
              <strong>{storageUsage.loading ? 'Loading…' : `${formatStorageBytes(storageUsage.usedBytes)} / ${formatStorageBytes(storageUsage.quotaBytes)}`}</strong>
              <small>{storageUsage.loading ? 'Calculating usage' : `${storagePercent}% used`}</small>
            </div>
          </div>
          <div className="profile-limit-grid">
            <article className="profile-limit-card">
              <span>Songs</span>
              <strong>{planState.songLimit === null ? 'Unlimited' : `${planState.songLimit} songs`}</strong>
            </article>
            <article className="profile-limit-card">
              <span>Storage included</span>
              <strong>{formatStorageBytes(planState.storageQuotaBytes)}</strong>
            </article>
            <article className="profile-limit-card">
              <span>Member capacity</span>
              <strong>{planState.memberLimit}</strong>
            </article>
          </div>
          <div className="profile-feature-chips" aria-label="Included paid features">
            <span className={planState.canUse('setlists') ? 'is-enabled' : ''}>Setlists</span>
            <span className={planState.canUse('stagePlots') ? 'is-enabled' : ''}>Stage plots</span>
            <span className={planState.canUse('technicalRiders') ? 'is-enabled' : ''}>Technical rider</span>
            <span className={planState.canUse('shareableLinks') ? 'is-enabled' : ''}>Sharing</span>
            <span className={planState.canUse('bluetoothPedal') ? 'is-enabled' : ''}>Bluetooth pedal</span>
            <span className={planState.canUse('recordings') ? 'is-enabled' : ''}>Recordings</span>
            <span className={planState.canUse('metronome') ? 'is-enabled' : ''}>Metronome</span>
            <span className={planState.canUse('multiUserNotes') ? 'is-enabled' : ''}>Multi-user notes</span>
          </div>
          <div className="profile-subscription-actions">
            {hasPaidPlan && user.stripeCustomerId ? (
              <button
                type="button"
                className="setlist-action-btn"
                disabled={busyBilling}
                onClick={() => { void handleManageBilling(); }}
              >
                <CreditCard size={16} /> {busyBilling ? 'Opening…' : 'Manage subscription'}
              </button>
            ) : (
              <Link to="/pricing" className="setlist-action-btn">
                <Sparkles size={16} /> Upgrade plan
              </Link>
            )}
            <Link to="/pricing" className="setlist-action-btn setlist-action-btn--secondary">Compare plans</Link>
          </div>
        </section>

        <section className="profile-settings-card">
          <div className="profile-section-heading">
            <div>
              <h2>Account information</h2>
              <p className="profile-settings-muted">Keep your public profile and login details current.</p>
            </div>
          </div>
          <form className="profile-settings-form profile-settings-form--inline" onSubmit={onFullNameSubmit}>
            <label className="form-field">
              <span>Full name</span>
              <input
                type="text"
                value={fullName}
                autoComplete="name"
                onChange={(event) => setFullName(event.target.value)}
                required
                maxLength={80}
              />
            </label>
            <button type="submit" className="setlist-action-btn profile-settings-save-btn" disabled={busyFullName}>
              {busyFullName ? 'Saving…' : 'Save'}
            </button>
          </form>
          <form className="profile-settings-form profile-settings-form--inline" onSubmit={onUsernameSubmit}>
            <label className="form-field">
              <span>Username</span>
              <input
                type="text"
                value={username}
                autoComplete="username"
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </label>
            <button type="submit" className="setlist-action-btn profile-settings-save-btn" disabled={busyUsername}>
              {busyUsername ? 'Saving…' : 'Save'}
            </button>
          </form>
          <form className="profile-settings-form profile-settings-form--inline" onSubmit={onEmailSubmit}>
            <label className="form-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <button type="submit" className="setlist-action-btn profile-settings-save-btn" disabled={busyEmail}>
              {busyEmail ? 'Saving…' : 'Save'}
            </button>
          </form>
          <div className="profile-avatar-section">
            <div className="profile-section-heading">
              <div>
                <h3>Avatar</h3>
                <p className="profile-settings-muted">Choose how your account appears to collaborators and band members.</p>
              </div>
            </div>
            <div id="avatar-options" className="avatar-grid" role="radiogroup" aria-label="Choose avatar">
              {AVATAR_OPTIONS.map((avatar) => {
                const isSelected = selectedAvatar === avatar;
                return (
                  <button
                    key={avatar}
                    type="button"
                    className={`avatar-choice${isSelected ? ' avatar-choice--active' : ''}`}
                    onClick={() => { void onSelectAvatar(avatar); }}
                    aria-pressed={isSelected}
                    disabled={busyAvatar}
                  >
                    <span>{avatar}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="profile-settings-card profile-settings-card--wide profile-danger-card">
          <div className="profile-section-heading">
            <div>
              <h2>Security and sign out</h2>
              <p className="profile-settings-muted">Use the current session controls here. Password reset stays in the auth flow.</p>
            </div>
          </div>
          <div className="profile-danger-actions">
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary"
              disabled={busyLogout}
              onClick={() => { void onLogout(); }}
            >
              <LogOut size={16} /> {busyLogout ? 'Signing out…' : 'Log out'}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
