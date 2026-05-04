import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, KeyRound, LogOut, Music2, Users } from 'lucide-react';
import toast from '../utils/anchoredToast';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import UserAvatar from '../components/UserAvatar';
import { AVATAR_OPTIONS } from '../lib/avatars';
import { ICON_OPTIONS } from '../lib/iconOptions';
import { normalizeUsername, validateUsername } from '../lib/userProfiles';

function normalizeEmojiIcon(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return [...trimmed].slice(0, 2).join('');
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, updateEmailAddress, updatePassword, updateUsername, updateAvatar, updateFullName, logout } = useAuth();
  const { bands, loading: bandsLoading, cloudRequired, createBand, deleteBand } = useBands();

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
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [bandName, setBandName] = useState('');
  const [bandDescription, setBandDescription] = useState('');
  const [bandIcon, setBandIcon] = useState('🎵');
  const [creatingBand, setCreatingBand] = useState(false);
  const [busyBandId, setBusyBandId] = useState<string | null>(null);

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

  const handleCreateBand = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingBand(true);
    const result = await createBand(bandName, bandDescription, normalizeEmojiIcon(bandIcon));
    setCreatingBand(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setBandName('');
    setBandDescription('');
    setBandIcon('🎵');
    toast.success('Band created.');
    if (result.bandId) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('gigboy-active-band-id', result.bandId);
      }
      navigate(`/bands/${result.bandId}/library`, { state: { bandId: result.bandId } });
    }
  };

  const handleDeleteBand = async (bandId: string) => {
    setBusyBandId(bandId);
    const error = await deleteBand(bandId);
    setBusyBandId(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Band deleted.');
  };

  return (
    <section className="profile-settings-page">
      <div className="profile-settings-grid">

        {/* Avatar */}
        <section className="profile-settings-card profile-settings-card--wide">
          <div className="profile-settings-avatar-header">
            <UserAvatar avatar={user.avatar} label={displayName} size="lg" />
            <div>
              <h1>Profile</h1>
              <p className="profile-settings-muted">Choose how your account appears where your profile is shown.</p>
            </div>
          </div>
          <button
            type="button"
            className="profile-settings-collapsible-toggle"
            onClick={() => setAvatarOpen((o) => !o)}
            aria-expanded={avatarOpen}
            aria-controls="avatar-options"
          >
            <h2>Avatar icon</h2>
            {avatarOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {avatarOpen && (
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
          )}
        </section>

        {/* Information */}
        <section className="profile-settings-card profile-settings-card--wide">
          <h2>Information</h2>
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
              {busyFullName ? 'Saving…' : 'Save full name'}
            </button>
          </form>
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
              {busyUsername ? 'Saving…' : 'Save username'}
            </button>
          </form>
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
              {busyEmail ? 'Saving…' : 'Save email'}
            </button>
          </form>
        </section>

        {/* Change password (collapsible) */}
        <section className="profile-settings-card profile-settings-card--wide">
          <button
            type="button"
            className="profile-settings-collapsible-toggle"
            onClick={() => setPasswordOpen((o) => !o)}
            aria-expanded={passwordOpen}
          >
            <h2><KeyRound size={16} /> Change password</h2>
            {passwordOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {passwordOpen && (
            <>
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
            </>
          )}
        </section>

        {/* Bands */}
        <section className="profile-settings-card profile-settings-card--wide">
          <h2>Bands</h2>
          <p className="profile-settings-muted">Create bands, invite members, and maintain a shared band library.</p>
          {cloudRequired ? (
            <p className="bands-status">Bands require Firebase auth and Firestore to be configured.</p>
          ) : null}
          <form className="bands-create-card" onSubmit={handleCreateBand}>
            <div className="bands-create-grid">
              <label className="share-menu-field">
                <span>Band name</span>
                <input
                  type="text"
                  value={bandName}
                  onChange={(event) => setBandName(event.target.value)}
                  placeholder="Youth Team"
                />
              </label>
              <label className="share-menu-field">
                <span>Description</span>
                <input
                  type="text"
                  value={bandDescription}
                  onChange={(event) => setBandDescription(event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label className="share-menu-field">
                <span>Icon</span>
                <select value={bandIcon} onChange={(event) => setBandIcon(event.target.value)}>
                  {ICON_OPTIONS.map((emoji) => (
                    <option key={emoji} value={emoji}>{emoji}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="bands-create-actions">
              <button type="submit" className="setlist-action-btn" disabled={creatingBand || cloudRequired}>
                {creatingBand ? 'Creating…' : 'Create band'}
              </button>
            </div>
          </form>
          {bandsLoading ? (
            <p className="bands-status">Loading bands…</p>
          ) : bands.length === 0 ? (
            <p className="bands-status">No bands yet.</p>
          ) : (
            <ul className="bands-list">
              {bands.map((band) => {
                const isOwner = band.ownerId === user.id;
                const role = isOwner ? 'owner' : band.memberRoles[user.id ?? ''] ?? 'viewer';
                return (
                  <li key={band.id} className="bands-card">
                    <Link to={`/bands/${band.id}/library`} className="bands-card-main">
                      <div className="bands-card-icon" aria-hidden="true">
                        {band.icon ? <span>{band.icon}</span> : <Music2 size={18} />}
                      </div>
                      <div className="bands-card-copy">
                        <strong>{band.name}</strong>
                        <span>{band.description || `${band.memberIds.length} members`}</span>
                      </div>
                    </Link>
                    <div className="bands-card-meta">
                      <span className="bands-role-badge">{role}</span>
                      <span className="bands-members-pill"><Users size={14} /> {band.memberIds.length}</span>
                      {isOwner ? (
                        <button
                          type="button"
                          className="setlist-action-btn setlist-action-btn--secondary"
                          disabled={busyBandId === band.id}
                          onClick={() => void handleDeleteBand(band.id)}
                        >
                          {busyBandId === band.id ? 'Deleting…' : 'Delete'}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Log out */}
        <section className="profile-settings-card profile-settings-card--wide">
          <h2><LogOut size={16} /> Log out</h2>
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
