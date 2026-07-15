import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import toast from '../utils/anchoredToast';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import UserAvatar from './UserAvatar';
import { createBandInviteLinkOnServer } from '../lib/bandsApi';
import type { Band } from '../types';

interface BandManagementPanelProps {
  band: Band;
  canEditBand: boolean;
  isOwner: boolean;
  showLeaveCurrentUser?: boolean;
  onLeaveCurrentUser?: () => Promise<string | null>;
  onLeaveSuccess?: () => void;
}

export default function BandManagementPanel({
  band,
  canEditBand,
  isOwner,
  showLeaveCurrentUser = false,
  onLeaveCurrentUser,
  onLeaveSuccess,
}: BandManagementPanelProps) {
  const { user } = useAuth();
  const { inviteMember, removeMember } = useBands();

  const [inviteUsername, setInviteUsername] = useState('');
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState(false);
  const [busyInviteLink, setBusyInviteLink] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [lastInviteLinkExpiresAt, setLastInviteLinkExpiresAt] = useState<string | null>(null);

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyInvite(true);
    const error = await inviteMember(band.id, inviteUsername, 'editor');
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

  const handleCreateInviteLink = async () => {
    if (!user?.id || !user.email) {
      toast.error('You need to be signed in to create invite links.');
      return;
    }

    setBusyInviteLink(true);
    try {
      const result = await createBandInviteLinkOnServer({
        userId: user.id,
        userEmail: user.email,
        bandId: band.id,
        role: 'editor',
      });

      setLastInviteLink(result.inviteUrl);
      setLastInviteLinkExpiresAt(result.expiresAt ?? null);
      try {
        await navigator.clipboard.writeText(result.inviteUrl);
        toast.success('Invite link copied to clipboard.');
      } catch {
        toast.success('Invite link created. Copy it from the field below.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create invite link.';
      toast.error(message);
    } finally {
      setBusyInviteLink(false);
    }
  };

  const handleLeaveBand = async () => {
    if (!onLeaveCurrentUser) return;

    setBusyMemberId(user?.id ?? 'self');
    const error = await onLeaveCurrentUser();
    setBusyMemberId(null);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('You left the band.');
    onLeaveSuccess?.();
  };

  return (
    <section className="bands-panel">
      <h3>Band management</h3>
      <form className="bands-invite-form" onSubmit={handleInvite}>
        <label className="share-menu-field">
          <span>Invite by username</span>
          <input
            type="text"
            value={inviteUsername}
            onChange={(event) => setInviteUsername(event.target.value)}
            placeholder="bandmate"
            disabled={!canEditBand}
          />
        </label>
        <button type="submit" className="setlist-action-btn" disabled={!canEditBand || busyInvite}>
          <UserPlus size={15} /> {busyInvite ? 'Sending...' : 'Send invite'}
        </button>
        <button
          type="button"
          className="setlist-action-btn setlist-action-btn--secondary"
          disabled={!canEditBand || busyInviteLink}
          onClick={() => { void handleCreateInviteLink(); }}
        >
          {busyInviteLink ? 'Creating link...' : 'Create invite link'}
        </button>
      </form>
      {lastInviteLink ? (
        <label className="share-menu-field" style={{ marginTop: '0.75rem' }}>
          <span>Latest invite link</span>
          <input type="text" value={lastInviteLink} readOnly />
          {lastInviteLinkExpiresAt ? (
            <span style={{ fontSize: '0.8em', color: 'var(--color-text-muted, #888)', marginTop: '0.25rem' }}>
              Expires {new Date(lastInviteLinkExpiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          ) : null}
        </label>
      ) : null}

      <h3 style={{ marginTop: '1rem' }}>Members</h3>
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
                <span>{role}</span>
              </div>
              <div className="bands-member-actions">
                {canRemove ? (
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    disabled={busyMemberId === memberId}
                    onClick={() => void handleRemoveMember(memberId)}
                  >
                    {busyMemberId === memberId ? 'Working...' : 'Remove'}
                  </button>
                ) : null}
                {showLeaveCurrentUser && !isOwner && isCurrentUser ? (
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    disabled={busyMemberId === memberId}
                    onClick={() => { void handleLeaveBand(); }}
                  >
                    {busyMemberId === memberId ? 'Working...' : 'Leave band'}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}