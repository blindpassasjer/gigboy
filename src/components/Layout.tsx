import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PanelLeft, Sun, Moon, Maximize2, Minimize2, Mail, Music, Folder, ListMusic, Map, ClipboardList } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import Sidebar from './Sidebar';
import BrandMark from './BrandMark';
import { useDarkModeContext } from '../context/DarkModeContext';
import { useInviteNotifications } from '../hooks/useInviteNotifications';
import { usePlan } from '../hooks/usePlan';
import { db } from '../lib/firebase';
import { declineInvite, loadPendingInvites } from '../lib/collaboration';
import { declineBandInvite, loadPendingBandInvites } from '../lib/bandInvites';
import { acceptBandInviteOnServer } from '../lib/bandsApi';
import { acceptInviteOnServer } from '../lib/shareApi';
import { emitInviteNotificationsChanged } from '../lib/inviteNotifications';
import toast from '../utils/anchoredToast';
import { showPromptToast } from '../utils/toastDialogs';
import type { BandInvite, CollaborationInvite } from '../types';
import UserAvatar from './UserAvatar';

interface Props {
  children: ReactNode;
}

function hashBandHue(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const positiveHash = Math.abs(hash);
  return positiveHash % 360;
}

export default function Layout({ children }: Props) {
  const navigate = useNavigate();
  const { pathname, state } = useLocation();
  const {
    bands,
    refreshBands,
    addBandSongList,
    addBandSetlist,
    addBandStageplot,
    addBandTechnicalRider,
  } = useBands();
  const { user } = useAuth();
  const planState = usePlan();
  const {
    pendingIncomingCount,
    acceptedOutgoing,
    unseenAcceptedOutgoing,
    refresh: refreshInviteNotifications,
    markAcceptedAsSeen,
  } = useInviteNotifications();
  const isConcertRoute = pathname.endsWith('/concert')
    && pathname.startsWith('/bands/');
  const stateBandId = (() => {
    if (!state || typeof state !== 'object') return null;
    const candidate = (state as { bandId?: unknown }).bandId;
    return typeof candidate === 'string' && candidate.trim() ? candidate : null;
  })();
  const [persistedBandId, setPersistedBandId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem('gigboy-active-band-id');
    } catch {
      return null;
    }
  });
  const isBandRoute = pathname === '/bands' || pathname.startsWith('/bands/') || Boolean(stateBandId);
  const routeSegments = pathname.split('/').filter(Boolean);
  const routeBandId = routeSegments[0] === 'bands' ? routeSegments[1] ?? null : null;
  const fallbackBandId = persistedBandId && bands.some((entry) => entry.id === persistedBandId)
    ? persistedBandId
    : null;
  const themedBandId = routeBandId ?? stateBandId ?? fallbackBandId;
  const themedBand = themedBandId ? bands.find((entry) => entry.id === themedBandId) ?? null : null;
  const bandSection = routeBandId ? (routeSegments[2] ?? 'library') : null;
  const bandSongListId = routeBandId && bandSection === 'songlists' ? (routeSegments[3] ?? null) : null;
  const activeBand = routeBandId ? bands.find((entry) => entry.id === routeBandId) ?? null : null;
  const canEditActiveBand = Boolean(
    activeBand
      && user
      && (activeBand.ownerId === user.id || activeBand.memberRoles[user.id] === 'editor')
  );
  const addSongFabState = routeBandId
    ? {
      addSongScope: {
        kind: 'band' as const,
        bandId: routeBandId,
      },
      ...(bandSongListId ? { initialSongListId: bandSongListId } : {}),
    }
    : undefined;
  const canShowContextFab = Boolean(routeBandId)
    && !isConcertRoute
    && canEditActiveBand
    && (bandSection === 'library'
      || bandSection === 'songlists'
      || bandSection === 'setlists'
      || bandSection === 'stageplots'
      || bandSection === 'riders');
  const wasConcertRouteRef = useRef(isConcertRoute);
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 900px)').matches;
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 900px)').matches;
  });
  const { dark, toggle: toggleDark } = useDarkModeContext();
  const mainContentRef = useRef<HTMLElement>(null);
  const swipeRef = useRef<{ x: number; y: number; fromEdge: boolean } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(document.fullscreenElement);
  });
  const unseenAcceptedCount = unseenAcceptedOutgoing.length;
  const inviteNotificationCount = pendingIncomingCount + unseenAcceptedCount;
  const hasInviteNotifications = inviteNotificationCount > 0;
  const inviteNoticeVariant = pendingIncomingCount > 0 && unseenAcceptedCount > 0
    ? 'mixed'
    : unseenAcceptedCount > 0
      ? 'accepted'
      : 'pending';
  const inviteLabel = [
    pendingIncomingCount > 0 ? `${pendingIncomingCount} pending` : null,
    unseenAcceptedCount > 0 ? `${unseenAcceptedCount} accepted` : null,
  ].filter(Boolean).join(', ');
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<CollaborationInvite[]>([]);
  const [pendingBandInvites, setPendingBandInvites] = useState<BandInvite[]>([]);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const invitesPopoverRef = useRef<HTMLDivElement>(null);
  const hasAnyPendingInvites = pendingInvites.length > 0 || pendingBandInvites.length > 0;
  const hasAnyInviteContent = hasAnyPendingInvites || acceptedOutgoing.length > 0;

  const createBandResource = useCallback(async (kind: 'songlist' | 'setlist' | 'stageplot' | 'rider') => {
    if (!routeBandId) return;

    if (kind === 'setlist' && !planState.canUse('setlists')) {
      toast.error('Setlists require a Pro or Band plan.');
      return;
    }

    if (kind === 'stageplot' && !planState.canUse('stagePlots')) {
      toast.error('Stageplots require a Pro or Band plan.');
      return;
    }

    if (kind === 'rider' && !planState.canUse('technicalRiders')) {
      toast.error('Technical riders require a Pro or Band plan.');
      return;
    }

    const labels = {
      songlist: {
        prompt: 'New songlist name',
        placeholder: 'Band songlist name...',
        confirm: 'Create songlist',
      },
      setlist: {
        prompt: 'New setlist name',
        placeholder: 'Band setlist name...',
        confirm: 'Create setlist',
      },
      stageplot: {
        prompt: 'New stageplot name',
        placeholder: 'Band stageplot name...',
        confirm: 'Create stageplot',
      },
      rider: {
        prompt: 'New technical rider name',
        placeholder: 'Band technical rider name...',
        confirm: 'Create rider',
      },
    } as const;

    const value = await showPromptToast(labels[kind].prompt, {
      placeholder: labels[kind].placeholder,
      confirmLabel: labels[kind].confirm,
      cancelLabel: 'Cancel',
    });

    const name = value?.trim() ?? '';
    if (!name) return;

    if (kind === 'songlist') {
      const result = await addBandSongList(routeBandId, name);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.songListId) navigate(`/bands/${routeBandId}/songlists/${result.songListId}`);
      return;
    }

    if (kind === 'setlist') {
      const result = await addBandSetlist(routeBandId, name);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.setlistId) navigate(`/bands/${routeBandId}/setlists/${result.setlistId}`);
      return;
    }

    if (kind === 'stageplot') {
      const result = await addBandStageplot(routeBandId, name);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.stageplotId) navigate(`/bands/${routeBandId}/stageplots/${result.stageplotId}`);
      return;
    }

    const result = await addBandTechnicalRider(routeBandId, name);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.riderId) navigate(`/bands/${routeBandId}/riders/${result.riderId}`);
  }, [
    addBandSetlist,
    addBandSongList,
    addBandStageplot,
    addBandTechnicalRider,
    navigate,
    planState,
    routeBandId,
  ]);

  const renderContextFab = () => {
    if (!canShowContextFab || !bandSection) return null;

    if (bandSection === 'library') {
      return (
        <Link
          to="/songs/new"
          state={addSongFabState}
          className="fab-add-song"
          title="Create song"
          aria-label="Create song"
        >
          <Music size={20} />
        </Link>
      );
    }

    if (bandSection === 'songlists') {
      return (
        <button
          type="button"
          className="fab-add-song"
          title="Create songlist"
          aria-label="Create songlist"
          onClick={() => void createBandResource('songlist')}
        >
          <Folder size={20} />
        </button>
      );
    }

    if (bandSection === 'setlists') {
      return (
        <button
          type="button"
          className="fab-add-song"
          title="Create setlist"
          aria-label="Create setlist"
          onClick={() => void createBandResource('setlist')}
        >
          <ListMusic size={20} />
        </button>
      );
    }

    if (bandSection === 'stageplots') {
      return (
        <button
          type="button"
          className="fab-add-song"
          title="Create stageplot"
          aria-label="Create stageplot"
          onClick={() => void createBandResource('stageplot')}
        >
          <Map size={20} />
        </button>
      );
    }

    return (
      <button
        type="button"
        className="fab-add-song"
        title="Create technical rider"
        aria-label="Create technical rider"
        onClick={() => void createBandResource('rider')}
      >
        <ClipboardList size={20} />
      </button>
    );
  };

  const refreshInvitesPopover = useCallback(async () => {
    if (!db || !user?.id) {
      setPendingInvites([]);
      setPendingBandInvites([]);
      return;
    }

    setInvitesLoading(true);
    try {
      const [pendingInvitesResult, pendingBandInvitesResult] = await Promise.allSettled([
        loadPendingInvites(db, user.id, user.email ?? ''),
        loadPendingBandInvites(db, user.id, user.email ?? ''),
      ]);

      if (pendingInvitesResult.status === 'fulfilled') {
        setPendingInvites(pendingInvitesResult.value);
      } else {
        setPendingInvites([]);
      }

      if (pendingBandInvitesResult.status === 'fulfilled') {
        setPendingBandInvites(pendingBandInvitesResult.value);
      } else {
        setPendingBandInvites([]);
      }
    } finally {
      setInvitesLoading(false);
    }
  }, [user?.email, user?.id]);

  const toggleFullscreen = async () => {
    if (typeof document === 'undefined') return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore failures when fullscreen is unavailable or blocked by the browser.
    }
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');

    const updateViewport = (matches: boolean) => {
      setIsNarrowViewport(matches);
      setSidebarOpen((current) => (matches ? false : current));
    };

    updateViewport(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      updateViewport(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const leavingConcertRoute = wasConcertRouteRef.current && !isConcertRoute;

    if (isNarrowViewport || isConcertRoute) {
      setSidebarOpen(false);
    } else if (leavingConcertRoute) {
      setSidebarOpen(true);
    }

    wasConcertRouteRef.current = isConcertRoute;
  }, [pathname, isNarrowViewport, isConcertRoute]);

  useEffect(() => {
    if (!sidebarOpen || !isNarrowViewport) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen, isNarrowViewport]);

  useEffect(() => {
    if (typeof document === 'undefined' || !isNarrowViewport) return;

    const originalOverflow = document.body.style.overflow;
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = originalOverflow;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [sidebarOpen, isNarrowViewport]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();

    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncPersistedBandId = () => {
      try {
        setPersistedBandId(window.localStorage.getItem('gigboy-active-band-id'));
      } catch {
        setPersistedBandId(null);
      }
    };

    syncPersistedBandId();
    window.addEventListener('storage', syncPersistedBandId);
    return () => window.removeEventListener('storage', syncPersistedBandId);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextBandId = routeBandId ?? stateBandId;
    if (!nextBandId) return;
    try {
      window.localStorage.setItem('gigboy-active-band-id', nextBandId);
      setPersistedBandId(nextBandId);
    } catch {
      // Ignore localStorage sync failures.
    }
  }, [routeBandId, stateBandId]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const rootStyle = document.documentElement.style;

    if (!themedBandId) {
      rootStyle.removeProperty('--bands-hue');
      rootStyle.removeProperty('--bands-hue-soft');
      rootStyle.removeProperty('--bands-hue-contrast');
      return;
    }

    const hue = hashBandHue(themedBandId);
    const fallbackHue = dark
      ? `hsl(${hue} 78% 70%)`
      : `hsl(${hue} 64% 46%)`;
    const softHue = dark
      ? `hsl(${hue} 40% 20%)`
      : `hsl(${hue} 76% 94%)`;
    const contrast = dark ? '#1b1512' : '#ffffff';

    const bandColor = themedBand?.color?.trim();

    rootStyle.setProperty('--bands-hue', bandColor || fallbackHue);
    rootStyle.setProperty(
      '--bands-hue-soft',
      bandColor
        ? `color-mix(in srgb, ${bandColor} ${dark ? '26%' : '16%'}, ${dark ? '#0f0f10' : '#ffffff'})`
        : softHue
    );
    rootStyle.setProperty('--bands-hue-contrast', contrast);
  }, [dark, themedBand?.color, themedBandId]);

  useEffect(() => {
    if (!invitesOpen) return;

    if (unseenAcceptedOutgoing.length > 0) {
      markAcceptedAsSeen(unseenAcceptedOutgoing);
    }
    void refreshInvitesPopover();
  }, [invitesOpen, markAcceptedAsSeen, refreshInvitesPopover, unseenAcceptedOutgoing, user?.email, user?.id]);

  useEffect(() => {
    if (!invitesOpen) return;

    const handleWindowClick = (event: MouseEvent) => {
      if (!invitesPopoverRef.current) return;
      if (invitesPopoverRef.current.contains(event.target as Node)) return;
      setInvitesOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInvitesOpen(false);
      }
    };

    window.addEventListener('mousedown', handleWindowClick);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handleWindowClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [invitesOpen]);

  const handleAcceptInvite = async (invite: CollaborationInvite) => {
    if (!user?.id || !user.email) return;

    setBusyInviteId(invite.id);
    try {
      await acceptInviteOnServer({
        userId: user.id,
        userEmail: user.email,
        inviteId: invite.id,
      });
      setPendingInvites((current) => current.filter((entry) => entry.id !== invite.id));
      emitInviteNotificationsChanged();
      await refreshInviteNotifications();
      toast.success('Invite accepted.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept invite.';
      toast.error(message);
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    if (!db || !user?.id) return;

    setBusyInviteId(inviteId);
    try {
      await declineInvite(db, inviteId, user.id);
      setPendingInvites((current) => current.filter((entry) => entry.id !== inviteId));
      emitInviteNotificationsChanged();
      await refreshInviteNotifications();
      toast.success('Invite declined.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decline invite.';
      toast.error(message);
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleAcceptBandInvite = async (invite: BandInvite) => {
    if (!user?.id || !user.email) return;

    setBusyInviteId(invite.id);
    try {
      await acceptBandInviteOnServer({
        userId: user.id,
        userEmail: user.email,
        inviteId: invite.id,
      });
      setPendingBandInvites((current) => current.filter((entry) => entry.id !== invite.id));
      await refreshBands();
      emitInviteNotificationsChanged();
      await refreshInviteNotifications();
      toast.success('Band invite accepted.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept band invite.';
      toast.error(message);
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleDeclineBandInvite = async (inviteId: string) => {
    if (!db || !user?.id) return;

    setBusyInviteId(inviteId);
    try {
      await declineBandInvite(db, inviteId, user.id);
      setPendingBandInvites((current) => current.filter((entry) => entry.id !== inviteId));
      emitInviteNotificationsChanged();
      await refreshInviteNotifications();
      toast.success('Band invite declined.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decline band invite.';
      toast.error(message);
    } finally {
      setBusyInviteId(null);
    }
  };

  return (
    <div className="app-shell" data-library-mode={themedBandId ? 'bands' : 'solo'}>
      <header className="topbar">
        <button
          type="button"
          className="topbar-sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          aria-pressed={sidebarOpen}
          aria-controls="app-sidebar"
        >
          <PanelLeft size={20} />
        </button>
        <Link to={themedBandId ? `/bands/${themedBandId}/library` : '/'} className="topbar-brand">
          <BrandMark size={35} scale={1} />
        </Link>
        <nav className="topbar-nav">
          <div className="topbar-invites" ref={invitesPopoverRef}>
            <button
              type="button"
              onClick={() => setInvitesOpen((current) => !current)}
              className={[
                'topbar-invites-trigger',
                invitesOpen ? 'active' : '',
                hasInviteNotifications ? 'topbar-link--has-notification' : '',
              ].filter(Boolean).join(' ')}
              title={hasInviteNotifications ? `Invites (${inviteLabel})` : 'Invites'}
              aria-expanded={invitesOpen}
              aria-haspopup="dialog"
              aria-controls="topbar-invites-popover"
            >
              <Mail size={16} />
              <span className="topbar-link-label">Invites</span>
              {hasInviteNotifications ? (
                <span
                  className={`topbar-link-notice topbar-link-notice--${inviteNoticeVariant}`}
                  aria-label={`Invites: ${inviteLabel}`}
                >
                  {inviteNotificationCount}
                </span>
              ) : null}
            </button>

            {invitesOpen ? (
              <div id="topbar-invites-popover" className="topbar-invites-popover" role="dialog" aria-label="Invite notifications">
                <div className="topbar-invites-popover-header">
                  <h2>Invites</h2>
                  {hasInviteNotifications ? <span>{inviteLabel}</span> : <span>All caught up</span>}
                </div>
                <div className="topbar-invites-popover-content">
                  {invitesLoading ? (
                    <p className="topbar-invites-empty">Loading invites...</p>
                  ) : !hasAnyInviteContent ? (
                    <p className="topbar-invites-empty">No pending invites right now.</p>
                  ) : (
                    <>
                      {hasAnyPendingInvites ? (
                        <section className="topbar-invites-group" aria-label="Pending invites">
                          <h3>Pending</h3>
                          <ul className="topbar-invites-list">
                            {pendingInvites.map((invite) => {
                              const busy = busyInviteId === invite.id;
                              return (
                                <li key={invite.id} className="topbar-invite-item">
                                  <div className="topbar-invite-main">
                                    <strong>{invite.resourceName}</strong>
                                    <span>{invite.ownerFullName || invite.ownerEmail} shared a {invite.resourceType} with {invite.permission} access</span>
                                  </div>
                                  <div className="topbar-invite-actions">
                                    <button
                                      type="button"
                                      className="setlist-action-btn"
                                      disabled={busy}
                                      onClick={() => void handleAcceptInvite(invite)}
                                    >
                                      {busy ? 'Working...' : 'Accept'}
                                    </button>
                                    <button
                                      type="button"
                                      className="setlist-action-btn setlist-action-btn--secondary"
                                      disabled={busy}
                                      onClick={() => void handleDeclineInvite(invite.id)}
                                    >
                                      Decline
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                            {pendingBandInvites.map((invite) => {
                              const busy = busyInviteId === invite.id;
                              return (
                                <li key={invite.id} className="topbar-invite-item">
                                  <div className="topbar-invite-main">
                                    <strong>{invite.bandName}</strong>
                                    <span>{invite.inviterEmail} invited you as {invite.role}</span>
                                  </div>
                                  <div className="topbar-invite-actions">
                                    <button
                                      type="button"
                                      className="setlist-action-btn"
                                      disabled={busy}
                                      onClick={() => void handleAcceptBandInvite(invite)}
                                    >
                                      {busy ? 'Working...' : 'Accept'}
                                    </button>
                                    <button
                                      type="button"
                                      className="setlist-action-btn setlist-action-btn--secondary"
                                      disabled={busy}
                                      onClick={() => void handleDeclineBandInvite(invite.id)}
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

                      {acceptedOutgoing.length > 0 ? (
                        <section className="topbar-invites-group" aria-label="Recent invite responses">
                          <h3>Recent responses</h3>
                          <ul className="topbar-invites-list">
                            {acceptedOutgoing.slice(0, 4).map((notification) => (
                              <li key={notification.id} className="topbar-invite-item topbar-invite-item--accepted">
                                <div className="topbar-invite-main">
                                  <strong>{notification.title}</strong>
                                  <span>{notification.description}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleDark}
            className="topbar-icon-btn"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={dark}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="topbar-icon-btn"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          {user && (
            <Link
              to="/profile"
              className={pathname === '/profile' ? 'active topbar-profile-link' : 'topbar-profile-link'}
              title={`Open profile (${user.email})`}
              aria-current={pathname === '/profile' ? 'page' : undefined}
            >
              <UserAvatar avatar={user.avatar} label={user.username ?? user.email} size="sm" />
              <span className="topbar-link-label">Profile</span>
            </Link>
          )}
        </nav>
      </header>

      <div
        className={`app-body${isNarrowViewport ? ' app-body--narrow' : ''}`}
        onPointerDown={(event) => {
          if (!isNarrowViewport || event.pointerType === 'mouse') return;
          swipeRef.current = {
            x: event.clientX,
            y: event.clientY,
            fromEdge: event.clientX <= 32,
          };
        }}
        onPointerUp={(event) => {
          if (!swipeRef.current || event.pointerType === 'mouse') return;
          const { x, y, fromEdge } = swipeRef.current;
          swipeRef.current = null;
          const dx = event.clientX - x;
          const dy = event.clientY - y;
          // Require clear horizontal dominance and ≥55 px travel
          if (Math.abs(dy) > Math.abs(dx) * 0.75 || Math.abs(dx) < 55) return;
          if (!sidebarOpen && fromEdge && dx > 0) setSidebarOpen(true);
          else if (sidebarOpen && dx < 0) setSidebarOpen(false);
        }}
      >
        <Sidebar
          open={sidebarOpen}
          mobile={isNarrowViewport}
          onNavigate={isNarrowViewport ? () => setSidebarOpen(false) : undefined}
          onClose={() => setSidebarOpen(false)}
        />
        {isNarrowViewport && sidebarOpen && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main
          id="main-content"
          ref={mainContentRef}
          tabIndex={-1}
          className={`main-content${isConcertRoute ? ' main-content--concert' : ''}${isBandRoute || (themedBandId && pathname.startsWith('/profile')) ? ' main-content--band' : ''}`}
        >
          {children}
          <footer className="footer">From Norway - with chords</footer>
        </main>
        {renderContextFab()}
      </div>
    </div>
  );
}
