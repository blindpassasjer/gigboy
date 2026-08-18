import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from '../utils/anchoredToast';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import { declineInvite, loadPendingInvites } from '../lib/collaboration';
import { dataClient } from '../lib/dataClient';
import { acceptInviteOnServer } from '../lib/shareApi';
import { emitInviteNotificationsChanged } from '../lib/inviteNotifications';
import { useInviteNotifications } from '../hooks/useInviteNotifications';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { CollaborationInvite } from '../types';

export default function ProfileInvitesPage() {
  useDocumentTitle('Invites');
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { bands, refreshBands } = useBands();
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<CollaborationInvite[]>([]);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const processedBandInviteIdRef = useRef<string | null>(null);
  const [acceptedConfirmations, setAcceptedConfirmations] = useState(() => [] as ReturnType<typeof useInviteNotifications>['unseenAcceptedOutgoing']);
  const { unseenAcceptedOutgoing, markAcceptedAsSeen } = useInviteNotifications();

  const refreshInvites = useCallback(async () => {
    if (!db || !user?.id) {
      setInvites([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setInvites(await loadPendingInvites(db, user.id, user.email ?? ''));
    } catch (error) {
      console.error('Failed to load collaboration invites.', error);
      setInvites([]);
      toast.error('Failed to load invites.');
    } finally {
      setLoading(false);
    }
  }, [user?.email, user?.id]);

  useEffect(() => {
    void refreshInvites();
  }, [refreshInvites]);

  useEffect(() => {
    if (unseenAcceptedOutgoing.length === 0) {
      return;
    }

    setAcceptedConfirmations((current) => {
      const existingIds = new Set(current.map((notification) => notification.id));
      const nextNotifications = unseenAcceptedOutgoing.filter((notification) => !existingIds.has(notification.id));
      if (nextNotifications.length === 0) {
        return current;
      }
      return [...nextNotifications, ...current].sort((a, b) => b.respondedAt.localeCompare(a.respondedAt));
    });
    markAcceptedAsSeen(unseenAcceptedOutgoing);
  }, [markAcceptedAsSeen, unseenAcceptedOutgoing]);

  useEffect(() => {
    const bandInviteId = searchParams.get('bandInvite')?.trim() ?? '';
    if (!bandInviteId || !user?.id || !user.email) {
      return;
    }

    if (processedBandInviteIdRef.current === bandInviteId) {
      return;
    }
    processedBandInviteIdRef.current = bandInviteId;

    let active = true;
    setBusyInviteId(bandInviteId);

    void (async () => {
      try {
        await dataClient.bands.acceptInvite(bandInviteId);
        if (!active) return;

        await refreshBands();
        await refreshInvites();
        emitInviteNotificationsChanged();
        toast.success('Joined band from invite link.');
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Failed to accept band invite.';
        toast.error(message);
      } finally {
        if (active) {
          setBusyInviteId(null);
          const nextSearchParams = new URLSearchParams(searchParams);
          nextSearchParams.delete('bandInvite');
          setSearchParams(nextSearchParams, { replace: true });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [refreshBands, refreshInvites, searchParams, setSearchParams, user?.email, user?.id]);

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
      emitInviteNotificationsChanged();
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
      emitInviteNotificationsChanged();
      toast.success('Invite declined.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decline invite.';
      toast.error(message);
    } finally {
      setBusyInviteId(null);
    }
  };

  const hasAnyInvites = invites.length > 0;
  const hasAnyContent = acceptedConfirmations.length > 0 || hasAnyInvites;

  const mutualBandNamesByUserId = bands.reduce<Record<string, string[]>>((acc, band) => {
    band.memberIds.forEach((memberId) => {
      if (!user?.id || memberId === user.id) return;
      if (!acc[memberId]) {
        acc[memberId] = [];
      }
      if (!acc[memberId].includes(band.name)) {
        acc[memberId].push(band.name);
      }
    });
    return acc;
  }, {});

  return (
    <section className="profile-invites-page">
      <header className="profile-invites-header">
        <h1>Invites</h1>
        <p>Accept access to songs, songlists, setlists, and bands shared with you.</p>
      </header>

      {acceptedConfirmations.length > 0 ? (
        <section className="profile-invites-section">
          <h2>Recent responses</h2>
          <ul className="profile-invites-list">
            {acceptedConfirmations.map((notification) => (
              <li key={notification.id} className="profile-invite-card profile-invite-card--accepted">
                <div className="profile-invite-main">
                  <strong>{notification.title}</strong>
                  <span>{notification.description}</span>
                </div>
                <div className="profile-invite-confirmation">Accepted</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading ? (
        <p className="profile-invites-status">Loading invites…</p>
      ) : !hasAnyContent ? (
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
                          {invite.ownerFullName || invite.ownerEmail} shared a {invite.resourceType} with {invite.permission} access
                        </span>
                        {invite.ownerId && mutualBandNamesByUserId[invite.ownerId]?.length ? (
                          <span>Shared bands: {mutualBandNamesByUserId[invite.ownerId].join(', ')}</span>
                        ) : null}
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
        </>
      )}
    </section>
  );
}
