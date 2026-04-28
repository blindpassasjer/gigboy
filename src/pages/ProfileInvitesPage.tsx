import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { declineInvite, loadPendingInvites } from '../lib/collaboration';
import { acceptInviteOnServer } from '../lib/shareApi';
import type { CollaborationInvite } from '../types';

export default function ProfileInvitesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<CollaborationInvite[]>([]);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const refreshInvites = useCallback(async () => {
    if (!db || !user?.id || !user.email) {
      setInvites([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const pendingInvites = await loadPendingInvites(db, user.id, user.email);
      setInvites(pendingInvites);
    } catch (error) {
      console.error('Failed to load invites.', error);
      toast.error('Failed to load invites.');
    } finally {
      setLoading(false);
    }
  }, [user?.email, user?.id]);

  useEffect(() => {
    void refreshInvites();
  }, [refreshInvites]);

  const onAccept = async (invite: CollaborationInvite) => {
    if (!user?.id || !user.email) return;

    setBusyInviteId(invite.id);
    try {
      await acceptInviteOnServer({
        userId: user.id,
        userEmail: user.email,
        inviteId: invite.id,
      });
      setInvites((prev) => prev.filter((entry) => entry.id !== invite.id));
      toast.success('Invite accepted.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept invite.';
      toast.error(message);
    } finally {
      setBusyInviteId(null);
    }
  };

  const onDecline = async (inviteId: string) => {
    if (!db || !user?.id) return;

    setBusyInviteId(inviteId);
    try {
      await declineInvite(db, inviteId, user.id);
      setInvites((prev) => prev.filter((entry) => entry.id !== inviteId));
      toast.success('Invite declined.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decline invite.';
      toast.error(message);
    } finally {
      setBusyInviteId(null);
    }
  };

  return (
    <section className="profile-invites-page">
      <header className="profile-invites-header">
        <h1>Invites</h1>
        <p>Accept access to songs, songlists, and setlists shared with you.</p>
      </header>

      {loading ? (
        <p className="profile-invites-status">Loading invites…</p>
      ) : invites.length === 0 ? (
        <p className="profile-invites-status">No pending invites.</p>
      ) : (
        <ul className="profile-invites-list">
          {invites.map((invite) => {
            const busy = busyInviteId === invite.id;
            return (
              <li key={invite.id} className="profile-invite-card">
                <div className="profile-invite-main">
                  <strong>{invite.resourceName}</strong>
                  <span>
                    {invite.ownerEmail} shared a {invite.resourceType} with {invite.permission} access
                  </span>
                </div>
                <div className="profile-invite-actions">
                  <button
                    type="button"
                    className="setlist-action-btn"
                    disabled={busy}
                    onClick={() => onAccept(invite)}
                  >
                    {busy ? 'Working…' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    disabled={busy}
                    onClick={() => onDecline(invite.id)}
                  >
                    Decline
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
