import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import toast from '../utils/anchoredToast';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import { declineInvite, loadPendingInvites } from '../lib/collaboration';
import { declineBandInvite, loadPendingBandInvites } from '../lib/bandInvites';
import { acceptBandInviteOnServer } from '../lib/bandsApi';
import { acceptInviteOnServer } from '../lib/shareApi';
import type { BandInvite, CollaborationInvite } from '../types';

export default function ProfileInvitesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { bands, refreshBands } = useBands();
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<CollaborationInvite[]>([]);
  const [bandInvites, setBandInvites] = useState<BandInvite[]>([]);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, {
    fullName?: string;
    username?: string;
    email?: string;
  }>>({});
  const processedBandInviteIdRef = useRef<string | null>(null);

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
        await acceptBandInviteOnServer({
          userId: user.id,
          userEmail: user.email,
          inviteId: bandInviteId,
        });
        if (!active) return;

        await refreshBands();
        await refreshInvites();
        toast.success('Joined band from invite link.');
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Failed to accept band invite.';
        toast.error(message);
      } finally {
        if (!active) return;
        setBusyInviteId(null);
        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.delete('bandInvite');
        setSearchParams(nextSearchParams, { replace: true });
      }
    })();

    return () => {
      active = false;
    };
  }, [refreshBands, refreshInvites, searchParams, setSearchParams, user?.email, user?.id]);

  useEffect(() => {
    if (!db || !user?.id) {
      setProfilesByUserId({});
      return;
    }

    const firestore = db;

    const targetUserIds = new Set<string>();
    bands.forEach((band) => {
      band.memberIds.forEach((memberId) => {
        if (memberId !== user.id) {
          targetUserIds.add(memberId);
        }
      });
    });

    invites.forEach((invite) => {
      if (invite.ownerId && invite.ownerId !== user.id) {
        targetUserIds.add(invite.ownerId);
      }
    });

    if (targetUserIds.size === 0) {
      setProfilesByUserId({});
      return;
    }

    let active = true;
    void Promise.allSettled(
      [...targetUserIds].map(async (targetUserId) => {
        const snapshot = await getDoc(doc(firestore, 'users', targetUserId));
        const data = snapshot.data() as Record<string, unknown> | undefined;
        return {
          userId: targetUserId,
          fullName: typeof data?.fullName === 'string' ? data.fullName : undefined,
          username: typeof data?.username === 'string' ? data.username : undefined,
          email: typeof data?.email === 'string' ? data.email : undefined,
        };
      })
    ).then((results) => {
      if (!active) return;

      const next: Record<string, { fullName?: string; username?: string; email?: string }> = {};
      results.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        next[result.value.userId] = {
          fullName: result.value.fullName,
          username: result.value.username,
          email: result.value.email,
        };
      });
      setProfilesByUserId(next);
    });

    return () => {
      active = false;
    };
  }, [bands, invites, user?.id, db]);

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
      await refreshBands();
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

  const sharedPeople = (() => {
    const people = new Map<string, {
      userId: string;
      username: string;
      fullName?: string;
      email?: string;
      bands: string[];
    }>();

    bands.forEach((band) => {
      band.memberIds.forEach((memberId) => {
        if (!user?.id || memberId === user.id) return;

        const existing = people.get(memberId);
        if (existing) {
          if (!existing.bands.includes(band.name)) {
            existing.bands.push(band.name);
          }
          return;
        }

        const username = band.memberUsernames[memberId] ?? '';
        if (!username) return;

        people.set(memberId, {
          userId: memberId,
          username,
          fullName: profilesByUserId[memberId]?.fullName || band.memberFullNames[memberId] || undefined,
          email: profilesByUserId[memberId]?.email || band.memberEmails[memberId] || undefined,
          bands: [band.name],
        });
      });
    });

    return [...people.values()].sort((a, b) => {
      const aLabel = a.fullName || a.username;
      const bLabel = b.fullName || b.username;
      return aLabel.localeCompare(bLabel);
    });
  })();

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

      {sharedPeople.length > 0 ? (
        <section className="profile-invites-section">
          <h2>Users added</h2>
          <ul className="profile-invites-list">
            {sharedPeople.map((person) => (
              <li key={person.userId} className="profile-invite-card">
                <div className="profile-invite-main">
                  <strong>{person.fullName || person.username}</strong>
                  <span>@{person.username}{person.email ? ` • ${person.email}` : ''}</span>
                  <span>
                    Shared bands: {person.bands.join(', ')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
                          {invite.ownerFullName || profilesByUserId[invite.ownerId]?.fullName || invite.ownerEmail} shared a {invite.resourceType} with {invite.permission} access
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
