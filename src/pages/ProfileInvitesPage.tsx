import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { declineInvite, loadPendingInvites } from '../lib/collaboration';
import { declineBandInvite, loadPendingBandInvites } from '../lib/bandInvites';
import { acceptBandInviteOnServer } from '../lib/bandsApi';
import { acceptInviteOnServer } from '../lib/shareApi';
import type { BandInvite, CollaborationInvite } from '../types';

export default function ProfileInvitesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<CollaborationInvite[]>([]);
  const [bandInvites, setBandInvites] = useState<BandInvite[]>([]);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const refreshInvites = useCallback(async () => {
    if (!db || !user?.id) {
      setInvites([]);
      setBandInvites([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [pendingInvitesResult, pendingBandInvitesResult] = await Promise.allSettled([
        loadPendingInvites(db, user.id, user.email ?? ''),
        loadPendingBandInvites(db, user.id, user.email ?? ''),
      ]);

      if (pendingInvitesResult.status === 'fulfilled') {
        setInvites(pendingInvitesResult.value);
      } else {
        console.error('Failed to load collaboration invites.', pendingInvitesResult.reason);
        setInvites([]);
      }

      if (pendingBandInvitesResult.status === 'fulfilled') {
        setBandInvites(pendingBandInvitesResult.value);
      } else {
        console.error('Failed to load band invites.', pendingBandInvitesResult.reason);
        setBandInvites([]);
      }

      if (pendingInvitesResult.status === 'rejected' && pendingBandInvitesResult.status === 'rejected') {
        toast.error('Failed to load invites.');
      }
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

  const onAcceptBandInvite = async (invite: BandInvite) => {
    if (!user?.id || !user.email) return;

    setBusyInviteId(invite.id);
    try {
      await acceptBandInviteOnServer({
        userId: user.id,
        userEmail: user.email,
        inviteId: invite.id,
      });
      setBandInvites((prev) => prev.filter((entry) => entry.id !== invite.id));
      toast.success('Band invite accepted.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept band invite.';
      toast.error(message);
    } finally {
      setBusyInviteId(null);
    }
  };

  const onDeclineBandInvite = async (inviteId: string) => {
    if (!db || !user?.id) return;

    setBusyInviteId(inviteId);
    try {
      await declineBandInvite(db, inviteId, user.id);
      setBandInvites((prev) => prev.filter((entry) => entry.id !== inviteId));
      toast.success('Band invite declined.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decline band invite.';
      toast.error(message);
    } finally {
      setBusyInviteId(null);
    }
  };

  const hasAnyInvites = invites.length > 0 || bandInvites.length > 0;

  return (
    <section className="profile-invites-page">
      <header className="profile-invites-header">
        <h1>Invites</h1>
        <p>Accept access to songs, songlists, setlists, and bands shared with you.</p>
      </header>

      {loading ? (
        <p className="profile-invites-status">Loading invites…</p>
      ) : !hasAnyInvites ? (
        <p className="profile-invites-status">No pending invites.</p>
      ) : (
        <>
          {invites.length > 0 ? (
            <section className="profile-invites-section">
              <h2>Shared resources</h2>
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
            </section>
          ) : null}

          {bandInvites.length > 0 ? (
            <section className="profile-invites-section">
              <h2>Band invitations</h2>
              <ul className="profile-invites-list">
                {bandInvites.map((invite) => {
                  const busy = busyInviteId === invite.id;
                  return (
                    <li key={invite.id} className="profile-invite-card">
                      <div className="profile-invite-main">
                        <strong>{invite.bandName}</strong>
                        <span>{invite.inviterEmail} invited you as {invite.role}</span>
                      </div>
                      <div className="profile-invite-actions">
                        <button
                          type="button"
                          className="setlist-action-btn"
                          disabled={busy}
                          onClick={() => onAcceptBandInvite(invite)}
                        >
                          {busy ? 'Working…' : 'Accept'}
                        </button>
                        <button
                          type="button"
                          className="setlist-action-btn setlist-action-btn--secondary"
                          disabled={busy}
                          onClick={() => onDeclineBandInvite(invite.id)}
                        >
                          Decline
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
