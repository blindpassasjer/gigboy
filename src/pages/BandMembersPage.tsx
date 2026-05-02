import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { UserPlus } from 'lucide-react';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import UserAvatar from '../components/UserAvatar';
import type { CollaborationPermission } from '../types';
import { showConfirmToast } from '../utils/toastDialogs';

export default function BandMembersPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    bands,
    loading,
    inviteMember,
    changeMemberRole,
    removeMember,
    leaveBand,
    deleteBand,
  } = useBands();

  const band = bands.find((entry) => entry.id === id) ?? null;
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<CollaborationPermission>('viewer');
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState(false);
  const [busyDeleteBand, setBusyDeleteBand] = useState(false);

  if (loading && !band) {
    return <p className="bands-status">Loading band…</p>;
  }

  if (!band || !id) {
    return (
      <section className="bands-page">
        <p className="bands-status">Band not found.</p>
        <Link to="/bands" className="setlist-action-btn setlist-action-btn--secondary">Back to bands</Link>
      </section>
    );
  }

  const isOwner = band.ownerId === user?.id;
  const canEditBand = isOwner || band.memberRoles[user?.id ?? ''] === 'editor';

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyInvite(true);
    const error = await inviteMember(band.id, inviteUsername, inviteRole);
    setBusyInvite(false);

    if (error) {
      toast.error(error);
      return;
    }

    setInviteUsername('');
    toast.success('Band invite sent.');
  };

  const handleRemoveMember = async (memberId: string) => {
    setBusyMemberId(memberId);
    const error = await removeMember(band.id, memberId);
    setBusyMemberId(null);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Member removed.');
  };

  const handleChangeRole = async (memberId: string, role: CollaborationPermission) => {
    setBusyRoleId(memberId);
    const error = await changeMemberRole(band.id, memberId, role);
    setBusyRoleId(null);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Role updated.');
  };

  const handleLeaveBand = async () => {
    setBusyMemberId(user?.id ?? 'self');
    const error = await leaveBand(band.id);
    setBusyMemberId(null);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('You left the band.');
    navigate('/bands');
  };

  const handleDeleteBand = async () => {
    const confirmed = await showConfirmToast(`Delete "${band.name}"? This cannot be undone.`, {
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    setBusyDeleteBand(true);
    const error = await deleteBand(band.id);
    setBusyDeleteBand(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Band deleted.');
    navigate('/bands');
  };

  return (
    <section className="bands-page">
      <header className="bands-header">
        <div>
          <h1>{band.name}</h1>
          <p>Manage members and roles for this band.</p>
        </div>
      </header>

      <Link to={`/bands/${band.id}/library`} className="setlist-action-btn setlist-action-btn--secondary">
        Back to band library
      </Link>

      <div className="modal-content">
        <section className="bands-panel">
          <h3>Add new member</h3>
          <form className="bands-invite-form" onSubmit={handleInvite}>
            <label className="share-menu-field">
              <span>Username</span>
              <input
                type="text"
                value={inviteUsername}
                onChange={(event) => setInviteUsername(event.target.value)}
                placeholder="bandmate"
                disabled={!canEditBand}
              />
            </label>
            <label className="share-menu-field">
              <span>Role</span>
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as CollaborationPermission)}
                disabled={!canEditBand}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </label>
            <button type="submit" className="setlist-action-btn" disabled={!canEditBand || busyInvite}>
              <UserPlus size={15} /> {busyInvite ? 'Sending…' : 'Send invite'}
            </button>
          </form>
        </section>

        {isOwner && (
          <section className="bands-panel bands-panel--danger">
            <h3>Danger zone</h3>
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--danger"
              disabled={busyDeleteBand}
              onClick={() => void handleDeleteBand()}
            >
              {busyDeleteBand ? 'Deleting…' : 'Delete band'}
            </button>
          </section>
        )}

        <section className="bands-panel">
          <h3>Members</h3>
          <ul className="bands-members-list">
            {band.memberIds.map((memberId) => {
              const role = band.ownerId === memberId ? 'owner' : band.memberRoles[memberId] ?? 'viewer';
              const username = band.memberUsernames[memberId] ?? null;
              const email = band.memberEmails[memberId] ?? 'No email saved';
              const avatar = band.memberAvatars[memberId] ?? null;
              const canRemove = isOwner && memberId !== band.ownerId;
              const isCurrentUser = memberId === user?.id;

              return (
                <li key={memberId} className="bands-member-card">
                  <UserAvatar avatar={avatar} label={username ?? email} size="md" />
                  <div className="bands-member-copy">
                    <strong>{username ?? email}</strong>
                    <span>{username ? email : ''}</span>
                    {memberId === band.ownerId ? (
                      <span>{role}</span>
                    ) : isOwner ? (
                      <select
                        className="bands-member-role-select"
                        value={role}
                        disabled={busyRoleId === memberId}
                        onChange={(event) => void handleChangeRole(memberId, event.target.value as CollaborationPermission)}
                        aria-label="Member role"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                    ) : (
                      <span>{role}</span>
                    )}
                  </div>
                  <div className="bands-member-actions">
                    {canRemove ? (
                      <button
                        type="button"
                        className="setlist-action-btn setlist-action-btn--secondary"
                        disabled={busyMemberId === memberId}
                        onClick={() => void handleRemoveMember(memberId)}
                      >
                        {busyMemberId === memberId ? 'Working…' : 'Remove'}
                      </button>
                    ) : null}
                    {!isOwner && isCurrentUser ? (
                      <button
                        type="button"
                        className="setlist-action-btn setlist-action-btn--secondary"
                        disabled={busyMemberId === memberId}
                        onClick={() => void handleLeaveBand()}
                      >
                        {busyMemberId === memberId ? 'Working…' : 'Leave band'}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </section>
  );
}
