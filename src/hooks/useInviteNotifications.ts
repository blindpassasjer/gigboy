import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  emitInviteNotificationsChanged,
  getDismissedAcceptedInviteIds,
  getSeenAcceptedInviteIds,
  loadDismissedAcceptedInviteIds,
  loadInviteNotificationsSnapshot,
  markAcceptedInviteIdsSeen,
  saveDismissedAcceptedInviteIds,
} from '../lib/inviteNotifications';
import type { AcceptedInviteNotification } from '../lib/inviteNotifications';

interface InviteNotificationsState {
  loading: boolean;
  pendingIncomingCount: number;
  acceptedOutgoing: AcceptedInviteNotification[];
  unseenAcceptedOutgoing: AcceptedInviteNotification[];
  refresh: () => Promise<void>;
  markAcceptedAsSeen: (notifications: AcceptedInviteNotification[]) => void;
  clearAcceptedNotifications: () => void;
}

export function useInviteNotifications(): InviteNotificationsState {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendingIncomingCount, setPendingIncomingCount] = useState(0);
  const [allAcceptedOutgoing, setAllAcceptedOutgoing] = useState<AcceptedInviteNotification[]>([]);
  const [seenAcceptedIds, setSeenAcceptedIds] = useState<Set<string>>(new Set());
  // Seed from localStorage so the UI is correct before the first Firestore round-trip.
  const [dismissedAcceptedIds, setDismissedAcceptedIds] = useState<Set<string>>(
    () => (user?.id ? getDismissedAcceptedInviteIds(user.id) : new Set<string>())
  );

  const refresh = useCallback(async () => {
    if (!db || !user?.id) {
      setPendingIncomingCount(0);
      setAllAcceptedOutgoing([]);
      setSeenAcceptedIds(new Set());
      setDismissedAcceptedIds(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [snapshot, dismissedIds] = await Promise.all([
        loadInviteNotificationsSnapshot(db, user.id, user.email ?? ''),
        loadDismissedAcceptedInviteIds(db, user.id),
      ]);
      setPendingIncomingCount(snapshot.pendingIncomingCount);
      setAllAcceptedOutgoing(snapshot.acceptedOutgoing);
      setSeenAcceptedIds(getSeenAcceptedInviteIds(user.id));
      setDismissedAcceptedIds(dismissedIds);
    } finally {
      setLoading(false);
    }
  }, [user?.email, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void refresh();
    };

    const handleWindowFocus = () => {
      void refresh();
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('gigboy-invite-notifications-changed', handleWindowFocus);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('gigboy-invite-notifications-changed', handleWindowFocus);
    };
  }, [refresh]);

  const acceptedOutgoing = useMemo(
    () => allAcceptedOutgoing.filter((notification) => !dismissedAcceptedIds.has(notification.id)),
    [allAcceptedOutgoing, dismissedAcceptedIds]
  );

  const unseenAcceptedOutgoing = useMemo(
    () => acceptedOutgoing.filter((notification) => !seenAcceptedIds.has(notification.id)),
    [acceptedOutgoing, seenAcceptedIds]
  );

  const markAcceptedAsSeen = useCallback((notifications: AcceptedInviteNotification[]) => {
    if (!user?.id || notifications.length === 0) {
      return;
    }

    markAcceptedInviteIdsSeen(user.id, notifications.map((notification) => notification.id));
    setSeenAcceptedIds((current) => {
      const next = new Set(current);
      notifications.forEach((notification) => next.add(notification.id));
      return next;
    });
    emitInviteNotificationsChanged();
  }, [user?.id]);

  const clearAcceptedNotifications = useCallback(() => {
    if (!db || !user?.id || allAcceptedOutgoing.length === 0) {
      return;
    }

    const nextDismissed = new Set(dismissedAcceptedIds);
    allAcceptedOutgoing.forEach((notification) => nextDismissed.add(notification.id));

    // Optimistic update.
    setDismissedAcceptedIds(nextDismissed);
    emitInviteNotificationsChanged();

    // Persist to Firestore (also updates localStorage cache inside).
    void saveDismissedAcceptedInviteIds(db, user.id, nextDismissed);
  }, [user?.id, allAcceptedOutgoing, dismissedAcceptedIds]);

  return {
    loading,
    pendingIncomingCount,
    acceptedOutgoing,
    unseenAcceptedOutgoing,
    refresh,
    markAcceptedAsSeen,
    clearAcceptedNotifications,
  };
}
