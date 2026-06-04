import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CreditCard, LogOut, Sparkles, Trash2, Users } from 'lucide-react';
import toast from '../utils/anchoredToast';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import UserAvatar from '../components/UserAvatar';
import { AVATAR_OPTIONS } from '../lib/avatars';
import { normalizeUsername, validateUsername } from '../lib/userProfiles';
import { createPortalSession } from '../lib/billingApi';

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

function isBandBillingActive(plan: string | null | undefined, status: string | null | undefined) {
  if (plan !== 'pro' && plan !== 'crew') return false;
  if (status === 'active' || status === 'trialing') return true;
  return status == null;
}

export default function ProfilePage() {
  const { user, updateEmailAddress, updateUsername, updateAvatar, updateFullName, deleteAccount, logout } = useAuth();
  const { bands } = useBands();
  const [email, setEmail] = useState(user?.email ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar ?? AVATAR_OPTIONS[0]);
  const [busyEmail, setBusyEmail] = useState(false);
  const [busyUsername, setBusyUsername] = useState(false);
  const [busyFullName, setBusyFullName] = useState(false);
  const [busyAvatar, setBusyAvatar] = useState(false);
  const [busyLogout, setBusyLogout] = useState(false);
  const [busyDeleteAccount, setBusyDeleteAccount] = useState(false);
  const [busyBilling, setBusyBilling] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteStepOneConfirmed, setDeleteStepOneConfirmed] = useState(false);
  const [deleteStepTwoPhrase, setDeleteStepTwoPhrase] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const avatarPickerRef = useRef<HTMLDivElement | null>(null);
  const avatarTriggerRef = useRef<HTMLButtonElement | null>(null);

  const displayName = useMemo(() => user?.fullName || user?.username || user?.email || 'User', [user?.email, user?.fullName, user?.username]);
  const ownedBands = useMemo(() => bands.filter((band) => band.ownerId === user?.id), [bands, user?.id]);
  const paidOwnedBands = useMemo(
    () => ownedBands.filter((band) => isBandBillingActive(band.billingPlan, band.billingSubscriptionStatus)),
    [ownedBands],
  );
  const renewalDate = formatPeriodEnd(
    paidOwnedBands
      .map((band) => band.billingCurrentPeriodEnd ?? null)
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => left - right)[0] ?? null,
  );
  const deletePhraseMatches = deleteStepTwoPhrase.trim().toUpperCase() === 'DELETE MY ACCOUNT';

  useEffect(() => {
    if (!avatarPickerOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (avatarPickerRef.current?.contains(target)) return;
      if (avatarTriggerRef.current?.contains(target)) return;
      setAvatarPickerOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAvatarPickerOpen(false);
      avatarTriggerRef.current?.focus();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [avatarPickerOpen]);

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

    setAvatarPickerOpen(false);
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

  const onStartDeleteAccount = () => {
    setDeleteConfirmOpen(true);
    setDeleteStepOneConfirmed(false);
    setDeleteStepTwoPhrase('');
  };

  const onCancelDeleteAccount = () => {
    setDeleteConfirmOpen(false);
    setDeleteStepOneConfirmed(false);
    setDeleteStepTwoPhrase('');
  };

  const onDeleteAccount = async () => {
    if (!deleteStepOneConfirmed || !deletePhraseMatches) {
      return;
    }

    setBusyDeleteAccount(true);
    const error = await deleteAccount();
    setBusyDeleteAccount(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Account deleted.');
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
          <div className="profile-avatar-picker" ref={avatarPickerRef}>
            <button
              ref={avatarTriggerRef}
              type="button"
              className={`profile-avatar-trigger${avatarPickerOpen ? ' is-open' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={avatarPickerOpen}
              aria-controls="avatar-picker-box"
              onClick={() => setAvatarPickerOpen((open) => !open)}
            >
              <UserAvatar avatar={user.avatar} label={displayName} size="lg" />
              <span className="profile-avatar-trigger-label">Change avatar</span>
            </button>

            {avatarPickerOpen ? (
              <div id="avatar-picker-box" className="profile-avatar-popover" role="dialog" aria-label="Choose avatar">
                <div className="avatar-grid" role="radiogroup" aria-label="Choose avatar">
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
            ) : null}
          </div>
          <div className="profile-account-hero-copy">
            <span className="profile-account-kicker">Account</span>
            <h1>{displayName}</h1>
            <p>@{user.username ?? 'setup'} · {user.email}</p>
            <div className="profile-account-badges">
              <span className="profile-account-badge profile-account-badge--plan">
                <Sparkles size={14} /> Free account
              </span>
              <span className={`profile-account-badge ${paidOwnedBands.length > 0 ? 'profile-account-badge--billing' : 'profile-account-badge--billing-empty'}`}>
                <BadgeCheck size={14} /> {paidOwnedBands.length > 0 ? `${paidOwnedBands.length} paid band${paidOwnedBands.length === 1 ? '' : 's'}` : 'No paid bands'}
              </span>
              <span className="profile-account-badge profile-account-badge--bands">
                <Users size={14} /> {bands.length} band{bands.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="profile-account-chip-btn"
                disabled={busyLogout}
                onClick={() => { void onLogout(); }}
              >
                <LogOut size={14} /> {busyLogout ? 'Signing out…' : 'Log out'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="profile-account-grid">
        <section className="profile-settings-card profile-account-summary-card">
          <div className="profile-section-heading">
            <div>
              <h2>Billing</h2>
              <p className="profile-settings-muted">This Stripe customer belongs to your account, but paid libraries are billed per owned band workspace.</p>
            </div>
          </div>
          <div className="profile-subscription-overview">
            <div className="profile-stat-card">
              <span className="profile-stat-label">Billing account</span>
              <strong>{user.stripeCustomerId ? 'Connected' : 'Not connected'}</strong>
              <small>{user.stripeCustomerId ? 'Manage all band charges in one Stripe portal' : 'Connect by starting a band upgrade'}</small>
            </div>
            <div className="profile-stat-card">
              <span className="profile-stat-label">Next renewal</span>
              <strong>{renewalDate ?? '—'}</strong>
              <small>{paidOwnedBands.length > 0 ? 'Earliest active band renewal' : 'No active paid bands'}</small>
            </div>
            <div className="profile-stat-card">
              <span className="profile-stat-label">Paid bands</span>
              <strong>{paidOwnedBands.length}</strong>
              <small>{paidOwnedBands.length > 0 ? 'Active paid bands' : 'No active paid bands'}</small>
            </div>
            <div className="profile-stat-card">
              <span className="profile-stat-label">Total bands</span>
              <strong>{ownedBands.length}</strong>
              <small>{ownedBands.length > 0 ? 'Owned bands total' : 'You do not own any bands yet'}</small>
            </div>
          </div>
          <div className="profile-subscription-actions">
            {user.stripeCustomerId ? (
              <button
                type="button"
                className="setlist-action-btn"
                disabled={busyBilling}
                onClick={() => { void handleManageBilling(); }}
              >
                <CreditCard size={16} /> {busyBilling ? 'Opening…' : 'Manage billing account'}
              </button>
            ) : (
              <Link to="/pricing" className="setlist-action-btn">
                <Sparkles size={16} /> Open band pricing
              </Link>
            )}
            <Link to="/pricing" className="setlist-action-btn setlist-action-btn--secondary">Compare plans</Link>
          </div>
        </section>

        <section className="profile-settings-card profile-account-band-subscriptions-card">
          <div className="profile-section-heading">
            <div>
              <h2>Band subscriptions</h2>
              <p className="profile-settings-muted">Each owned band has its own paid workspace status, even when Stripe bills them under one customer.</p>
            </div>
          </div>
          {ownedBands.length > 0 ? (
            <div className="profile-band-subscriptions-list">
              {ownedBands.map((band) => (
                <article key={band.id} className="profile-band-subscription-row">
                  <div className="profile-band-subscription-copy">
                    <strong>{band.name}</strong>
                    <span>
                      {band.billingPlan === 'crew'
                        ? `Crew · ${formatSubscriptionStatus(band.billingSubscriptionStatus ?? null, false)} · ${band.billingMemberLimit ?? (5 + (band.billingExtraMembers ?? 0))} members`
                        : band.billingPlan === 'pro'
                          ? `Pro · ${formatSubscriptionStatus(band.billingSubscriptionStatus ?? null, false)}`
                          : 'No active PRO or CREW subscription for this band'}
                    </span>
                    {band.billingCurrentPeriodEnd ? (
                      <span>Renews {formatPeriodEnd(band.billingCurrentPeriodEnd) ?? '—'}</span>
                    ) : null}
                  </div>
                  <Link
                    to="/pricing"
                    state={{ bandId: band.id }}
                    className="setlist-action-btn setlist-action-btn--secondary"
                  >
                    Open billing
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className="profile-settings-muted">No band subscriptions yet.</p>
          )}
          {ownedBands.length > 1 ? (
            <p className="profile-settings-muted">
              You own {ownedBands.length} bands. They can all live on one Stripe bill while still being managed per band.
            </p>
          ) : null}
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

        </section>

        <section className="profile-settings-card profile-danger-card">
          <div className="profile-section-heading">
            <div>
              <h2>Danger zone</h2>
              <p className="profile-settings-muted">Permanently delete your account and all bands you own.</p>
            </div>
          </div>

          <div className="profile-account-danger-zone" aria-label="Account danger zone">
            <p className="profile-settings-muted">Deleting your account permanently removes owned bands and profile data.</p>

            {!deleteConfirmOpen ? (
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--danger"
                onClick={onStartDeleteAccount}
              >
                <Trash2 size={16} /> Delete account
              </button>
            ) : (
              <div className="profile-account-delete-confirm">
                <label className="profile-account-delete-check">
                  <input
                    type="checkbox"
                    checked={deleteStepOneConfirmed}
                    onChange={(event) => setDeleteStepOneConfirmed(event.target.checked)}
                    disabled={busyDeleteAccount}
                  />
                  <span>I understand this action permanently deletes my account and all bands I own.</span>
                </label>

                <label className="form-field">
                  <span>Type <strong>DELETE MY ACCOUNT</strong> to confirm</span>
                  <input
                    type="text"
                    value={deleteStepTwoPhrase}
                    onChange={(event) => setDeleteStepTwoPhrase(event.target.value)}
                    placeholder="DELETE MY ACCOUNT"
                    autoComplete="off"
                    disabled={busyDeleteAccount}
                  />
                </label>

                <div className="profile-danger-actions">
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--danger"
                    disabled={busyDeleteAccount || !deleteStepOneConfirmed || !deletePhraseMatches}
                    onClick={() => { void onDeleteAccount(); }}
                  >
                    <Trash2 size={16} /> {busyDeleteAccount ? 'Deleting…' : 'Delete account permanently'}
                  </button>
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    disabled={busyDeleteAccount}
                    onClick={onCancelDeleteAccount}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
