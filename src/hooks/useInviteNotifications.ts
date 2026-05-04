import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  emitInviteNotificationsChanged,
  getSeenAcceptedInviteIds,
  loadInviteNotificationsSnapshot,
  markAcceptedInviteIdsSeen,
} from '../lib/inviteNotifications';
import type { AcceptedInviteNotification } from '../lib/inviteNotifications';

interface InviteNotificationsState {
  loading: boolean;
  pendingIncomingCount: number;
  acceptedOutgoing: AcceptedInviteNotification[];
  unseenAcceptedOutgoing: AcceptedInviteNotification[];
  refresh: () => Promise<void>;
  markAcceptedAsSeen: (notifications: AcceptedInviteNotification[]) => void;
}

export function useInviteNotifications(): InviteNotificationsState {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendingIncomingCount, setPendingIncomingCount] = useState(0);
  const [acceptedOutgoing, setAcceptedOutgoing] = useState<AcceptedInviteNotification[]>([]);
  const [seenAcceptedIds, setSeenAcceptedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!db || !user?.id) {
      setPendingIncomingCount(0);
      setAcceptedOutgoing([]);
      setSeenAcceptedIds(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const snapshot = await loadInviteNotificationsSnapshot(db, user.id, user.email ?? '');
      setPendingIncomingCount(snapshot.pendingIncomingCount);
      setAcceptedOutgoing(snapshot.acceptedOutgoing);
      setSeenAcceptedIds(getSeenAcceptedInviteIds(user.id));
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
    window.addEventListener('gigboi-invite-notifications-changed', handleWindowFocus);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('gigboi-invite-notifications-changed', handleWindowFocus);
    };
  }, [refresh]);

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

  return {
    loading,
    pendingIncomingCount,
    acceptedOutgoing,
    unseenAcceptedOutgoing,
    refresh,
    markAcceptedAsSeen,
  };
}