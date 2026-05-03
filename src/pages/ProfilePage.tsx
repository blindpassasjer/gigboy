import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, LogOut, Mail, User as UserIcon } from 'lucide-react';
import toast from '../utils/anchoredToast';
import { useAuth } from '../context/AuthContext';
import UserAvatar from '../components/UserAvatar';
import { AVATAR_OPTIONS } from '../lib/avatars';
import { normalizeUsername, validateUsername } from '../lib/userProfiles';

export default function ProfilePage() {
  const { user, updateEmailAddress, updatePassword, updateUsername, updateAvatar, updateFullName, logout } = useAuth();

  const [email, setEmail] = useState(user?.email ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar ?? AVATAR_OPTIONS[0]);
  const [busyEmail, setBusyEmail] = useState(false);
  const [busyUsername, setBusyUsername] = useState(false);
  const [busyFullName, setBusyFullName] = useState(false);
  const [busyPassword, setBusyPassword] = useState(false);
  const [busyAvatar, setBusyAvatar] = useState(false);
  const [busyLogout, setBusyLogout] = useState(false);

  const displayName = useMemo(() => user?.fullName || user?.username || user?.email || 'User', [user?.email, user?.fullName, user?.username]);

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

  const onPasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error('New passwords do not match.');
      return;
    }

    setBusyPassword(true);
    const error = await updatePassword(currentPassword, newPassword);
    setBusyPassword(false);
    if (error) {
      toast.error(error);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    toast.success('Password updated.');
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

  return (
    <section className="profile-settings-page">
      <header className="profile-settings-header">
        <UserAvatar avatar={user.avatar} label={displayName} size="lg" />
        <div>
          <h1>Profile</h1>
          <p>Manage your account details, avatar, and security settings.</p>
        </div>
      </header>

      <div className="profile-settings-grid">
        <section className="profile-settings-card">
          <h2><Mail size={16} /> Email</h2>
          <form className="profile-settings-form" onSubmit={onEmailSubmit}>
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
            <button type="submit" className="setlist-action-btn" disabled={busyEmail}>
              {busyEmail ? 'Saving…' : 'Change email'}
            </button>
          </form>
        </section>

        <section className="profile-settings-card">
          <h2><UserIcon size={16} /> Username</h2>
          <form className="profile-settings-form" onSubmit={onUsernameSubmit}>
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
            <button type="submit" className="setlist-action-btn" disabled={busyUsername}>
              {busyUsername ? 'Saving…' : 'Change username'}
            </button>
          </form>
        </section>

        <section className="profile-settings-card">
          <h2><UserIcon size={16} /> Full name</h2>
          <form className="profile-settings-form" onSubmit={onFullNameSubmit}>
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
            <button type="submit" className="setlist-action-btn" disabled={busyFullName}>
              {busyFullName ? 'Saving…' : 'Change full name'}
            </button>
          </form>
        </section>

        <section className="profile-settings-card profile-settings-card--wide">
          <h2>Avatar</h2>
          <p className="profile-settings-muted">Choose how your account appears where your profile is shown.</p>
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
        </section>

        <section className="profile-settings-card">
          <h2><KeyRound size={16} /> Password</h2>
          <p className="profile-settings-muted">Leave current password empty if you signed up with Google and are adding password login.</p>
          <form className="profile-settings-form" onSubmit={onPasswordSubmit}>
            <label className="form-field">
              <span>Current password (optional for Google login)</span>
              <input
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>
            <label className="form-field">
              <span>Confirm new password</span>
              <input
                type="password"
                value={confirmNewPassword}
                autoComplete="new-password"
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>
            <button type="submit" className="setlist-action-btn" disabled={busyPassword}>
              {busyPassword ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </section>

        <section className="profile-settings-card">
          <h2><LogOut size={16} /> Session</h2>
          <p className="profile-settings-muted">Need to sign out on this device?</p>
          <button type="button" className="setlist-action-btn setlist-action-btn--secondary" disabled={busyLogout} onClick={() => { void onLogout(); }}>
            {busyLogout ? 'Signing out…' : 'Log out'}
          </button>
          <Link to="/profile/invites" className="profile-settings-link">View invites</Link>
        </section>
      </div>
    </section>
  );
}
