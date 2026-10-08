import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronDown, Route as RouteIcon, ChevronRight, ClipboardList, Folder, ListMusic, Music, Newspaper, Plus, Trash2, ChevronsUpDown } from 'lucide-react';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import { readStoredString, removeStoredString, writeStoredString } from '../lib/safeStorage';
import { useStorageUsage } from '../hooks/useStorageUsage';
import toast from '../utils/anchoredToast';

function formatStorageBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes > 0 && bytes < 1024) {
    return '1 KB';
  }
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

const SIDEBAR_WIDTH_KEY = 'gigboy-sidebar-width';
const SIDEBAR_DEFAULT_WIDTH = 220;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 480;

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

const SONG_DRAG_MIME = 'application/x-gigboy-song-id';
const SONG_DRAG_FALLBACK_MIME = 'text/x-gigboy-song-id';

function hasType(types: readonly string[], mime: string): boolean {
  return Array.from(types).includes(mime);
}

function readSongIdFromDrag(event: React.DragEvent<HTMLDivElement>): string {
  return event.dataTransfer.getData(SONG_DRAG_MIME) || event.dataTransfer.getData(SONG_DRAG_FALLBACK_MIME);
}

interface Props {
  open: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
}

function SidebarItemIcon({ icon, fallback, title }: { icon?: string; fallback: ReactNode; title?: string }) {
  const normalizedIcon = typeof icon === 'string' ? icon.trim() : '';
  if (normalizedIcon.length > 0) {
    return <span className="sidebar-list-icon" aria-hidden="true" title={title}>{normalizedIcon}</span>;
  }
  return <span className="sidebar-list-icon" aria-hidden="true" title={title}>{fallback}</span>;
}

export default function Sidebar({ open, mobile = false, onNavigate }: Props) {
  const navigate = useNavigate();
  const { pathname, state } = useLocation();
  const stateBandId = (() => {
    if (!state || typeof state !== 'object') return null;
    const candidate = (state as { bandId?: unknown }).bandId;
    return typeof candidate === 'string' && candidate.trim() ? candidate : null;
  })();
  const { user } = useAuth();

  const {
    bands,
    loading,
    bandSongsByBandId,
    bandSongListsByBandId,
    bandSetlistsByBandId,
    bandInputListsByBandId,
    bandPressKitsByBandId,
    bandToursByBandId,
    bandGigsByBandId,
    bandTrashByBandId,
    refreshBandSongs,
    refreshBandSongLists,
    refreshBandSetlists,
    refreshBandInputLists,
    refreshBandPressKits,
    refreshBandTours,
    refreshBandGigs,
    addBandTour,
    refreshBandTrash,
    createBand,
    addBandPressKit,
    addSongToBandLibrary,
    addBandSongList,
    addSongToBandSongList,
    addBandSetlist,
    addSongToBandSetlist,
    addBandInputList,
  } = useBands();

  const [addingBand, setAddingBand] = useState(false);
  const [addingBandSongListId, setAddingBandSongListId] = useState<string | null>(null);
  const [addingBandSetlistId, setAddingBandSetlistId] = useState<string | null>(null);
  const [addingBandInputListId, setAddingBandInputListId] = useState<string | null>(null);
  const [addingBandPressKitId, setAddingBandPressKitId] = useState<string | null>(null);
  const [addingBandTourId, setAddingBandTourId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [bandLibraryDropTargetId, setBandLibraryDropTargetId] = useState<string | null>(null);
  const [bandSongListDropTargetId, setBandSongListDropTargetId] = useState<string | null>(null);
  const [bandSetlistDropTargetId, setBandSetlistDropTargetId] = useState<string | null>(null);
  const [collapsedBandSonglistIds, setCollapsedBandSonglistIds] = useState<string[]>([]);
  const [collapsedBandSetlistIds, setCollapsedBandSetlistIds] = useState<string[]>([]);
  const [collapsedBandInputListIds, setCollapsedBandInputListIds] = useState<string[]>([]);
  const [collapsedBandPressKitIds, setCollapsedBandPressKitIds] = useState<string[]>([]);
  const [collapsedBandTourIds, setCollapsedBandTourIds] = useState<string[]>([]);
  const sidebarMode = 'bands' as const;
  const [activeBandId, setActiveBandId] = useState<string | null>(
    () => readStoredString('gigboy-active-band-id'),
  );
  const effectiveActiveBand = bands.find((band) => band.id === activeBandId) ?? bands[0] ?? null;
  const [bandSwitcherOpen, setBandSwitcherOpen] = useState(false);
  const [storagePopupOpen, setStoragePopupOpen] = useState(false);

  // ── Resizable width (desktop only). `null` = the stylesheet's default width. ──
  const animRef = useRef<HTMLDivElement>(null);
  const [userWidth, setUserWidth] = useState<number | null>(() => {
    const stored = Number(readStoredString(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampSidebarWidth(stored) : null;
  });
  const [resizing, setResizing] = useState(false);

  // Width (px) the sidebar needs so the active band's name isn't cut off; null = default width suffices.
  const [fitWidth, setFitWidth] = useState<number | null>(null);
  const activeBandName = effectiveActiveBand?.name ?? '';
  useLayoutEffect(() => {
    const measure = () => {
      const root = animRef.current;
      const nameEl = root?.querySelector<HTMLElement>('.sidebar-band-switcher-name');
      const aside = root?.querySelector<HTMLElement>('.sidebar');
      if (!nameEl || !aside || nameEl.clientWidth === 0) return; // collapsed: nothing to measure
      const range = document.createRange();
      range.selectNodeContents(nameEl);
      const textWidth = range.getBoundingClientRect().width;
      // Everything in the sidebar that isn't the name's text box stays constant, so this is stable as the width changes.
      const needed = Math.ceil(aside.getBoundingClientRect().width - nameEl.clientWidth + textWidth + 2);
      setFitWidth((prev) => {
        const next = needed > SIDEBAR_DEFAULT_WIDTH ? Math.min(needed, SIDEBAR_MAX_WIDTH) : null;
        return prev === next ? prev : next;
      });
    };
    measure();
    void document.fonts?.ready.then(measure);
  }, [activeBandName, open, mobile]);

  const currentWidth = () => animRef.current?.getBoundingClientRect().width ?? SIDEBAR_DEFAULT_WIDTH;
  const applyWidth = (next: number | null) => {
    setUserWidth(next);
    if (next === null) removeStoredString(SIDEBAR_WIDTH_KEY);
    else writeStoredString(SIDEBAR_WIDTH_KEY, String(next));
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = currentWidth();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    setResizing(true);
    const onMove = (moveEvent: PointerEvent) => setUserWidth(clampSidebarWidth(startWidth + moveEvent.clientX - startX));
    const onUp = (upEvent: PointerEvent) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      setResizing(false);
      applyWidth(clampSidebarWidth(startWidth + upEvent.clientX - startX));
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  /** Double-click: grow just enough to show the longest truncated name (capped), or reset if nothing is cut off. */
  const fitWidthToNames = () => {
    const names = animRef.current?.querySelectorAll<HTMLElement>('.sidebar-list-name') ?? [];
    let overflow = 0;
    names.forEach((el) => { overflow = Math.max(overflow, el.scrollWidth - el.clientWidth); });
    applyWidth(overflow > 0 ? clampSidebarWidth(Math.ceil(currentWidth() + overflow + 8)) : null);
  };

  const handleResizeKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16;
    if (event.key === 'ArrowLeft') applyWidth(clampSidebarWidth(currentWidth() - step));
    else if (event.key === 'ArrowRight') applyWidth(clampSidebarWidth(currentWidth() + step));
    else if (event.key === 'Enter' || event.key === 'Home') applyWidth(null);
    else return;
    event.preventDefault();
  };

  /** Names are ellipsised, so give a cut-off one a native tooltip with its full text (set lazily on hover). */
  const handleNameHover = (event: React.MouseEvent<HTMLElement>) => {
    const el = event.target as HTMLElement;
    if (el.classList?.contains('sidebar-list-name') && el.scrollWidth > el.clientWidth) el.title = el.textContent ?? '';
  };
  const bandSwitcherRef = useRef<HTMLDivElement>(null);
  const storagePopupRef = useRef<HTMLDivElement>(null);
  const storageUsage = useStorageUsage(user?.id ?? null, user?.storageQuotaBytes, activeBandId);
  const storagePercent = Math.round(storageUsage.usageRatio * 100);
  const storageLabel = storageUsage.loading
    ? 'Loading...'
    : `${formatStorageBytes(storageUsage.usedBytes)} / ${formatStorageBytes(storageUsage.quotaBytes)} (${storagePercent}%)`;
  const visibleBands = bands;

  // Auto-select first band if active band is missing
  useEffect(() => {
    if (visibleBands.length === 0 && bands.length === 0) return;
    if (activeBandId && visibleBands.some((b) => b.id === activeBandId)) return;
    const firstId = (visibleBands[0] ?? bands[0]).id;
    setActiveBandId(firstId);
    writeStoredString('gigboy-active-band-id', firstId);
  }, [visibleBands, bands, activeBandId]);

  // Close band switcher on outside click
  useEffect(() => {
    if (!bandSwitcherOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (bandSwitcherRef.current && !bandSwitcherRef.current.contains(e.target as Node)) {
        setBandSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [bandSwitcherOpen]);

  // Close storage popup on outside click
  useEffect(() => {
    if (!storagePopupOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (storagePopupRef.current && !storagePopupRef.current.contains(e.target as Node)) {
        setStoragePopupOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [storagePopupOpen]);

  useEffect(() => {
    if (!stateBandId) return;
    setActiveBandId((current) => (current === stateBandId ? current : stateBandId));
    writeStoredString('gigboy-active-band-id', stateBandId);
  }, [stateBandId]);

  useEffect(() => {
    const missingBandSongCollections = bands
      .map((band) => band.id)
      .filter((bandId) => bandSongsByBandId[bandId] === undefined);

    const missingBandSongListCollections = bands
      .map((band) => band.id)
      .filter((bandId) => bandSongListsByBandId[bandId] === undefined);

    const missingBandSetlistCollections = bands
      .map((band) => band.id)
      .filter((bandId) => bandSetlistsByBandId[bandId] === undefined);

    const missingBandInputListCollections = bands
      .map((band) => band.id)
      .filter((bandId) => bandInputListsByBandId[bandId] === undefined);

    const missingBandPressKitCollections = bands
      .map((band) => band.id)
      .filter((bandId) => bandPressKitsByBandId[bandId] === undefined);

    const missingBandTourCollections = bands
      .map((band) => band.id)
      .filter((bandId) => bandToursByBandId[bandId] === undefined);

    const missingBandGigCollections = bands
      .map((band) => band.id)
      .filter((bandId) => bandGigsByBandId[bandId] === undefined);

    const missingBandTrashCollections = bands
      .map((band) => band.id)
      .filter((bandId) => bandTrashByBandId[bandId] === undefined);

    if (
      missingBandSongCollections.length === 0
      && missingBandSongListCollections.length === 0
      && missingBandSetlistCollections.length === 0
      && missingBandInputListCollections.length === 0
      && missingBandPressKitCollections.length === 0
      && missingBandTourCollections.length === 0
      && missingBandGigCollections.length === 0
      && missingBandTrashCollections.length === 0
    ) return;

    missingBandSongCollections.forEach((bandId) => {
      void refreshBandSongs(bandId).catch(() => {
        // Sidebar counts are best-effort; detailed errors are handled on band pages.
      });
    });

    missingBandSongListCollections.forEach((bandId) => {
      void refreshBandSongLists(bandId).catch(() => {
        // Sidebar counts are best-effort; detailed errors are handled on band pages.
      });
    });

    missingBandSetlistCollections.forEach((bandId) => {
      void refreshBandSetlists(bandId).catch(() => {
        // Sidebar counts are best-effort; detailed errors are handled on band pages.
      });
    });

    missingBandInputListCollections.forEach((bandId) => {
      void refreshBandInputLists(bandId).catch(() => {
        // Sidebar counts are best-effort; detailed errors are handled on band pages.
      });
    });

    missingBandPressKitCollections.forEach((bandId) => {
      void refreshBandPressKits(bandId).catch(() => {
        // Sidebar counts are best-effort; detailed errors are handled on band pages.
      });
    });

    missingBandTourCollections.forEach((bandId) => {
      void refreshBandTours(bandId).catch(() => {
        // Sidebar counts are best-effort; detailed errors are handled on band pages.
      });
    });

    missingBandGigCollections.forEach((bandId) => {
      void refreshBandGigs(bandId).catch(() => {
        // Sidebar counts are best-effort; detailed errors are handled on band pages.
      });
    });

    missingBandTrashCollections.forEach((bandId) => {
      void refreshBandTrash(bandId).catch(() => {
        // Sidebar counts are best-effort; detailed errors are handled on band pages.
      });
    });
  }, [
    bandTrashByBandId,
    bandInputListsByBandId,
    bandPressKitsByBandId,
    bandToursByBandId,
    bandGigsByBandId,
    bandSetlistsByBandId,
    bandSongListsByBandId,
    bandSongsByBandId,
    bands,
    refreshBandTrash,
    refreshBandInputLists,
    refreshBandSetlists,
    refreshBandPressKits,
    refreshBandTours,
    refreshBandGigs,
    refreshBandSongLists,
    refreshBandSongs,
  ]);

  // No-op: the personal songlist/setlist "active selection" concept was removed along with
  // the personal contexts. Band-scoped pages resolve selection from the route, not a global
  // context value, so there's nothing left to clear here — this is kept as a stable call site
  // for the many navigation handlers below.
  const clearGlobalSelection = () => {};

  // Gigs per tour, per band — computed once per gigs change rather than filtering the list for every tour row.
  const tourGigCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    for (const [bandId, gigs] of Object.entries(bandGigsByBandId)) {
      const perTour: Record<string, number> = {};
      for (const gig of gigs) if (gig.tourId) perTour[gig.tourId] = (perTour[gig.tourId] ?? 0) + 1;
      counts[bandId] = perTour;
    }
    return counts;
  }, [bandGigsByBandId]);

  /** A rider's "inputs" are its stage-plot items that feed a mixer channel — position-only markers don't count. */
  const inputCount = (rider: { items?: Array<{ noChannel?: boolean }> }) =>
    (rider.items ?? []).filter((item) => !item.noChannel).length;

  const commitBand = async () => {
    const name = draftName.trim();
    setDraftName('');
    setAddingBand(false);
    if (name) {
      const result = await createBand(name, undefined, undefined);
      if (result.bandId) {
        // First band is free, navigate directly to it
        setActiveBandId(result.bandId);
        writeStoredString('gigboy-active-band-id', result.bandId);
        clearGlobalSelection();
        navigate(`/bands/${result.bandId}/library`, { state: { bandId: result.bandId } });
        onNavigate?.();
      } else if (result.error) {
        toast.error(result.error);
      }
    }
  };

  const commitBandSongList = async (bandId: string) => {
    const name = draftName.trim();
    setDraftName('');
    setAddingBandSongListId(null);
    if (!name) return;

    const result = await addBandSongList(bandId, name);
    if (result.songListId) {
      clearGlobalSelection();
      navigate(`/bands/${bandId}/songlists/${result.songListId}`);
      onNavigate?.();
    }
  };

  const commitBandSetlist = async (bandId: string) => {
    const name = draftName.trim();
    setDraftName('');
    setAddingBandSetlistId(null);
    if (!name) return;

    const result = await addBandSetlist(bandId, name);
    if (result.setlistId) {
      clearGlobalSelection();
      navigate(`/bands/${bandId}/setlists/${result.setlistId}`);
      onNavigate?.();
    } else if (result.error) {
      toast.error(result.error, { duration: 8000 });
    }
  };

  const commitBandTour = async (bandId: string) => {
    const name = draftName.trim();
    setDraftName('');
    setAddingBandTourId(null);
    if (!name) return;

    const result = await addBandTour(bandId, name);
    if (result.error) { toast.error(result.error, { duration: 8000 }); return; }
    setCollapsedBandTourIds((prev) => prev.filter((id) => id !== bandId));
    if (result.tourId) {
      clearGlobalSelection();
      navigate(`/bands/${bandId}/tours/${result.tourId}`);
      onNavigate?.();
    }
  };

  const commitBandPressKit = async (bandId: string) => {
    const name = draftName.trim();
    setDraftName('');
    setAddingBandPressKitId(null);
    if (!name) return;

    const result = await addBandPressKit(bandId, name);
    if (result.error) { toast.error(result.error, { duration: 8000 }); return; }
    setCollapsedBandPressKitIds((prev) => prev.filter((id) => id !== bandId));
    if (result.kitId) {
      clearGlobalSelection();
      navigate(`/bands/${bandId}/press-kit/${result.kitId}`);
      onNavigate?.();
    }
  };

  const commitBandInputList = async (bandId: string) => {
    const name = draftName.trim();
    setDraftName('');
    setAddingBandInputListId(null);
    if (!name) return;

    const result = await addBandInputList(bandId, name);
    if (result.error) {
      toast.error(result.error, { duration: 8000 });
      return;
    }
    if (result.riderId) {
      clearGlobalSelection();
      navigate(`/bands/${bandId}/riders/${result.riderId}`);
      onNavigate?.();
    }
  };

  const isBandSonglistsExpanded = (bandId: string) => !collapsedBandSonglistIds.includes(bandId);

  const isBandSetlistsExpanded = (bandId: string) => !collapsedBandSetlistIds.includes(bandId);

  const isBandInputListsExpanded = (bandId: string) => !collapsedBandInputListIds.includes(bandId);

  const isBandPressKitsExpanded = (bandId: string) => !collapsedBandPressKitIds.includes(bandId);

  const toggleBandSonglistsExpanded = (bandId: string) => {
    setCollapsedBandSonglistIds((prev) => (
      prev.includes(bandId)
        ? prev.filter((entry) => entry !== bandId)
        : [...prev, bandId]
    ));
  };

  const toggleBandSetlistsExpanded = (bandId: string) => {
    setCollapsedBandSetlistIds((prev) => (
      prev.includes(bandId)
        ? prev.filter((entry) => entry !== bandId)
        : [...prev, bandId]
    ));
  };

  const toggleBandInputListsExpanded = (bandId: string) => {
    setCollapsedBandInputListIds((prev) => (
      prev.includes(bandId)
        ? prev.filter((entry) => entry !== bandId)
        : [...prev, bandId]
    ));
  };

  const isBandToursExpanded = (bandId: string) => !collapsedBandTourIds.includes(bandId);

  const toggleBandToursExpanded = (bandId: string) => {
    setCollapsedBandTourIds((prev) => (
      prev.includes(bandId)
        ? prev.filter((entry) => entry !== bandId)
        : [...prev, bandId]
    ));
  };

  const toggleBandPressKitsExpanded = (bandId: string) => {
    setCollapsedBandPressKitIds((prev) => (
      prev.includes(bandId)
        ? prev.filter((entry) => entry !== bandId)
        : [...prev, bandId]
    ));
  };

  const findSongById = (songId: string) => (
    Object.values(bandSongsByBandId).flat().find((entry) => entry.id === songId)
  );

  const ensureBandLibraryHasSong = async (bandId: string, songId: string) => {
    const alreadyInLibrary = (bandSongsByBandId[bandId] ?? []).some((song) => song.id === songId);
    if (alreadyInLibrary) return true;

    const song = findSongById(songId);
    if (!song) return false;

    const error = await addSongToBandLibrary(bandId, song);
    return error === null;
  };

  const handleBandLibraryDrop = async (event: React.DragEvent<HTMLDivElement>, bandId: string) => {
    const songId = readSongIdFromDrag(event);
    if (!songId) return;

    const song = findSongById(songId);
    if (!song) return;

    event.preventDefault();
    await addSongToBandLibrary(bandId, song);
    setBandLibraryDropTargetId(null);
  };

  const handleBandSongListDrop = async (event: React.DragEvent<HTMLDivElement>, bandId: string, songListId: string) => {
    const songId = readSongIdFromDrag(event);
    if (!songId) return;

    event.preventDefault();

    const ready = await ensureBandLibraryHasSong(bandId, songId);
    if (ready) {
      await addSongToBandSongList(bandId, songListId, songId);
    }
    setBandSongListDropTargetId(null);
  };

  const handleBandSetlistDrop = async (event: React.DragEvent<HTMLDivElement>, bandId: string, setlistId: string) => {
    const songId = readSongIdFromDrag(event);
    if (!songId) return;

    event.preventDefault();

    const ready = await ensureBandLibraryHasSong(bandId, songId);
    if (ready) {
      await addSongToBandSetlist(bandId, setlistId, songId);
    }
    setBandSetlistDropTargetId(null);
  };

  const isSongDrag = (types: readonly string[]) => (
    hasType(types, SONG_DRAG_MIME) || hasType(types, SONG_DRAG_FALLBACK_MIME)
  );

  return (
    <div
      ref={animRef}
      className={`sidebar-anim${open ? ' sidebar-anim--open' : ''}${mobile ? ' sidebar-anim--mobile' : ''}${resizing ? ' sidebar-anim--resizing' : ''}`}
      style={{
        ...(!mobile && userWidth !== null ? { '--sidebar-width': `${userWidth}px` } : {}),
        ...(fitWidth !== null ? { '--sidebar-fit': `${fitWidth}px` } : {}),
      } as React.CSSProperties}
    >
    <aside id="app-sidebar" className={`sidebar${mobile ? ' sidebar--mobile' : ''}${open ? ' sidebar--open' : ''}`} onMouseOver={handleNameHover}>
      {!mobile && (
        <div className="sidebar-header">
          <span className="sidebar-title"></span>
          <div className="sidebar-header-actions" />
        </div>
      )}
      <div className="sidebar-mode-switcher" ref={bandSwitcherRef}>
        <div className="sidebar-band-switcher">
        <button
          type="button"
          className="sidebar-band-switcher-btn"
          onClick={() => setBandSwitcherOpen((o) => !o)}
          title="Switch band"
          aria-label="Switch band"
          aria-haspopup="listbox"
          aria-expanded={bandSwitcherOpen}
        >
          <>
            <SidebarItemIcon fallback={<Music size={13} />} />
            <span className="sidebar-band-switcher-name" title={effectiveActiveBand?.name ?? undefined}>
              {effectiveActiveBand?.name ?? ''}
            </span>
          </>
          <ChevronsUpDown size={12} className="sidebar-band-switcher-chevron" />
        </button>

        {bandSwitcherOpen && (
          <div className="sidebar-band-switcher-dropdown" role="listbox">
            {visibleBands.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: '12px', color: '#999' }}>
                {loading ? 'Loading bands...' : 'No bands yet'}
              </div>
            )}
            {visibleBands.map((band) => {
              return (
                <button
                  type="button"
                  key={band.id}
                  className={`sidebar-band-switcher-option${band.id === activeBandId ? ' active' : ''}`}
                  role="option"
                  aria-selected={band.id === activeBandId}
                  onClick={() => {
                    clearGlobalSelection();
                    setActiveBandId(band.id);
                    writeStoredString('gigboy-active-band-id', band.id);
                    setBandSwitcherOpen(false);
                    navigate(`/bands/${band.id}/library`);
                    onNavigate?.();
                  }}
                >
                  <SidebarItemIcon fallback={<Music size={13} />} />
                  <span className="sidebar-band-switcher-option-name">{band.name}</span>
                </button>
              );
            })}
          </div>
        )}
        </div>
        {sidebarMode === 'bands' && (
          <button
            type="button"
            className="sidebar-icon-btn"
            title="New band"
            aria-label="Create new band"
            onClick={() => {
              if (addingBand) {
                setAddingBand(false);
                return;
              }
              setAddingBand(true);
              setDraftName('');
            }}
          >
            <Plus size={15} />
          </button>
        )}
      </div>

      {user ? (
        <div className="sidebar-storage" ref={storagePopupRef}>
          <button
            type="button"
            className="topbar-storage sidebar-storage-btn"
            title={storageUsage.loading
              ? 'Loading recording storage usage'
              : `${formatStorageBytes(storageUsage.usedBytes)} used of ${formatStorageBytes(storageUsage.quotaBytes)} — click for breakdown`}
            aria-label={storageUsage.loading
              ? 'Loading storage usage'
              : `Storage usage ${storagePercent} percent, ${formatStorageBytes(storageUsage.usedBytes)} used of ${formatStorageBytes(storageUsage.quotaBytes)}. Click for breakdown.`}
            aria-expanded={storagePopupOpen}
            aria-haspopup="dialog"
            onClick={() => setStoragePopupOpen((o) => !o)}
          >
            <div className="topbar-storage-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={storagePercent}>
              <span
                className={[
                  'topbar-storage-meter-fill',
                  storagePercent >= 90 ? 'is-critical' : storagePercent >= 75 ? 'is-warning' : '',
                ].filter(Boolean).join(' ')}
                style={{ width: `${storagePercent}%` }}
              />
              <span className="topbar-storage-meter-label">{storageLabel}</span>
              <span className="topbar-storage-meter-label topbar-storage-meter-label-fill" style={{ clipPath: `inset(0 ${100 - storagePercent}% 0 0)` }}>
                {storageLabel}
              </span>
            </div>
          </button>

          {storagePopupOpen && !storageUsage.loading && (
            <div className="sidebar-storage-popup" role="dialog" aria-label="Storage breakdown">
              <div className="sidebar-storage-popup-title">Storage breakdown</div>
              <div className="sidebar-storage-popup-row">
                <span className="sidebar-storage-popup-label">Recordings</span>
                <span className="sidebar-storage-popup-value">{formatStorageBytes(storageUsage.recordingBytes)}</span>
              </div>
              <div className="sidebar-storage-popup-bar">
                <span
                  className="sidebar-storage-popup-bar-fill"
                  style={{ width: `${storageUsage.quotaBytes > 0 ? Math.min(100, (storageUsage.recordingBytes / storageUsage.quotaBytes) * 100) : 0}%` }}
                />
              </div>
              <div className="sidebar-storage-popup-row">
                <span className="sidebar-storage-popup-label">Images</span>
                <span className="sidebar-storage-popup-value">{formatStorageBytes(storageUsage.imageBytes)}</span>
              </div>
              <div className="sidebar-storage-popup-bar">
                <span
                  className="sidebar-storage-popup-bar-fill sidebar-storage-popup-bar-fill--images"
                  style={{ width: `${storageUsage.quotaBytes > 0 ? Math.min(100, (storageUsage.imageBytes / storageUsage.quotaBytes) * 100) : 0}%` }}
                />
              </div>
              <div className="sidebar-storage-popup-row">
                <span className="sidebar-storage-popup-label">Attachments</span>
                <span className="sidebar-storage-popup-value">{formatStorageBytes(storageUsage.attachmentBytes)}</span>
              </div>
              <div className="sidebar-storage-popup-bar">
                <span
                  className="sidebar-storage-popup-bar-fill sidebar-storage-popup-bar-fill--attachments"
                  style={{ width: `${storageUsage.quotaBytes > 0 ? Math.min(100, (storageUsage.attachmentBytes / storageUsage.quotaBytes) * 100) : 0}%` }}
                />
              </div>
              <div className="sidebar-storage-popup-divider" />
              <div className="sidebar-storage-popup-row sidebar-storage-popup-row--total">
                <span className="sidebar-storage-popup-label">Total</span>
                <span className="sidebar-storage-popup-value">{formatStorageBytes(storageUsage.usedBytes)} / {formatStorageBytes(storageUsage.quotaBytes)}</span>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {sidebarMode === 'bands' && (
      <div className="sidebar-bands-section">
        {addingBand && (
          <InlineInput
            value={draftName}
            onChange={setDraftName}
            onCommit={commitBand}
            onCancel={() => setAddingBand(false)}
            placeholder="Band name..."
          />
        )}
        <div className="sidebar-bands-list">
          {visibleBands.filter((band) => band.id === activeBandId).map((band) => (
            <div key={band.id} className="sidebar-folder">
              <div className="sidebar-folder-children">
                <div
                  className={`sidebar-list-item${(
                    pathname === `/bands/${band.id}` || pathname === `/bands/${band.id}/library`
                  ) ? ' active' : ''}${bandLibraryDropTargetId === band.id ? ' song-drop-target' : ''}`}
                  onDragOver={(event) => {
                    if (!isSongDrag(event.dataTransfer.types)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                    setBandLibraryDropTargetId((current) => (current === band.id ? current : band.id));
                  }}
                  onDragLeave={() => setBandLibraryDropTargetId((current) => (current === band.id ? null : current))}
                  onDrop={(event) => void handleBandLibraryDrop(event, band.id)}
                >
                  <button
                    className="sidebar-list-item-btn"
                    onClick={() => { clearGlobalSelection(); navigate(`/bands/${band.id}/library`); onNavigate?.(); }}
                  >
                    <SidebarItemIcon fallback={<ListMusic size={14} />} />
                    <span className="sidebar-list-name">Library</span>
                    {(bandSongsByBandId[band.id]?.length ?? 0) > 0 && (
                      <span className="sidebar-list-count">{bandSongsByBandId[band.id]?.length ?? 0}</span>
                    )}
                  </button>
                </div>

                <div
                  className={`sidebar-list-item${pathname === `/bands/${band.id}/trash` ? ' active' : ''}`}
                >
                  <button
                    className="sidebar-list-item-btn"
                    onClick={() => {
                      clearGlobalSelection();
                      navigate(`/bands/${band.id}/trash`);
                      onNavigate?.();
                    }}
                  >
                    <Trash2 size={14} />
                    <span className="sidebar-list-name">Trash</span>
                    {(bandTrashByBandId[band.id]?.length ?? 0) > 0 && (
                      <span className="sidebar-list-count">{bandTrashByBandId[band.id]?.length ?? 0}</span>
                    )}
                  </button>
                </div>

                <div className="sidebar-setlists-header">
                  <button
                    type="button"
                    className="sidebar-section-toggle"
                    onClick={() => toggleBandSonglistsExpanded(band.id)}
                    aria-expanded={isBandSonglistsExpanded(band.id)}
                  >
                    {isBandSonglistsExpanded(band.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="sidebar-section-title">Songlists</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-icon-btn"
                    title="New band songlist"
                    aria-label="Create new band songlist"
                    onClick={() => {
                      setCollapsedBandSonglistIds((prev) => prev.filter((entry) => entry !== band.id));
                      setAddingBandSongListId(band.id);
                      setDraftName('');
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {isBandSonglistsExpanded(band.id) && (
                  <div className="sidebar-nested-group">
                    {(bandSongListsByBandId[band.id] ?? []).length === 0 && addingBandSongListId !== band.id && (
                      <p className="sidebar-empty-hint">No songlists yet.</p>
                    )}

                    {(bandSongListsByBandId[band.id] ?? []).map((songList) => (
                      <div
                        key={songList.id}
                        className={`sidebar-list-item${pathname === `/bands/${band.id}/songlists/${songList.id}` ? ' active' : ''}${bandSongListDropTargetId === songList.id ? ' song-drop-target' : ''}`}
                        onDragOver={(event) => {
                          if (!isSongDrag(event.dataTransfer.types)) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'copy';
                          setBandSongListDropTargetId((current) => (current === songList.id ? current : songList.id));
                        }}
                        onDragLeave={() => setBandSongListDropTargetId((current) => (current === songList.id ? null : current))}
                        onDrop={(event) => void handleBandSongListDrop(event, band.id, songList.id)}
                      >
                        <button
                          className="sidebar-list-item-btn"
                          onClick={() => { clearGlobalSelection(); navigate(`/bands/${band.id}/songlists/${songList.id}`); onNavigate?.(); }}
                        >
                          <SidebarItemIcon icon={songList.icon} fallback={<Folder size={14} />} />
                          <span className="sidebar-list-name">{songList.name}</span>
                          {songList.songIds.length > 0 && <span className="sidebar-list-count">{songList.songIds.length}</span>}
                        </button>
                      </div>
                    ))}

                    {addingBandSongListId === band.id && (
                      <InlineInput
                        value={draftName}
                        onChange={setDraftName}
                        onCommit={() => void commitBandSongList(band.id)}
                        onCancel={() => setAddingBandSongListId(null)}
                        placeholder="Band songlist name..."
                      />
                    )}
                  </div>
                )}

                <div className="sidebar-setlists-header">
                  <button
                    type="button"
                    className="sidebar-section-toggle"
                    onClick={() => toggleBandSetlistsExpanded(band.id)}
                    aria-expanded={isBandSetlistsExpanded(band.id)}
                  >
                    {isBandSetlistsExpanded(band.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="sidebar-section-title">Setlists</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-icon-btn"
                    title="New band setlist"
                    aria-label="Create new band setlist"
                    onClick={() => {
                      setCollapsedBandSetlistIds((prev) => prev.filter((entry) => entry !== band.id));
                      setAddingBandSetlistId(band.id);
                      setDraftName('');
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {isBandSetlistsExpanded(band.id) && (
                  <div className="sidebar-nested-group">
                    {(bandSetlistsByBandId[band.id] ?? []).length === 0 && addingBandSetlistId !== band.id && (
                      <p className="sidebar-empty-hint">No setlists yet.</p>
                    )}

                    {(bandSetlistsByBandId[band.id] ?? []).map((setlist) => (
                      <div
                        key={setlist.id}
                        className={`sidebar-list-item${pathname === `/bands/${band.id}/setlists/${setlist.id}` ? ' active' : ''}${bandSetlistDropTargetId === setlist.id ? ' song-drop-target' : ''}`}
                        onDragOver={(event) => {
                          if (!isSongDrag(event.dataTransfer.types)) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'copy';
                          setBandSetlistDropTargetId((current) => (current === setlist.id ? current : setlist.id));
                        }}
                        onDragLeave={() => setBandSetlistDropTargetId((current) => (current === setlist.id ? null : current))}
                        onDrop={(event) => void handleBandSetlistDrop(event, band.id, setlist.id)}
                      >
                        <button
                          className="sidebar-list-item-btn"
                          onClick={() => { clearGlobalSelection(); navigate(`/bands/${band.id}/setlists/${setlist.id}`); onNavigate?.(); }}
                        >
                          <SidebarItemIcon icon={setlist.icon} fallback={<ListMusic size={14} />} />
                          <span className="sidebar-list-name">{setlist.name}</span>
                          {setlist.songIds.length > 0 && <span className="sidebar-list-count">{setlist.songIds.length}</span>}
                        </button>
                      </div>
                    ))}

                    {addingBandSetlistId === band.id && (
                      <InlineInput
                        value={draftName}
                        onChange={setDraftName}
                        onCommit={() => void commitBandSetlist(band.id)}
                        onCancel={() => setAddingBandSetlistId(null)}
                        placeholder="Band setlist name..."
                      />
                    )}
                  </div>
                )}

                <div className="sidebar-setlists-header">
                  <button
                    type="button"
                    className="sidebar-section-toggle"
                    onClick={() => toggleBandInputListsExpanded(band.id)}
                    aria-expanded={isBandInputListsExpanded(band.id)}
                  >
                    {isBandInputListsExpanded(band.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="sidebar-section-title">Technical Riders</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-icon-btn"
                    title="New technical rider"
                    aria-label="Create new technical rider"
                    onClick={() => {
                      setCollapsedBandInputListIds((prev) => prev.filter((id) => id !== band.id));
                      setAddingBandInputListId(band.id);
                      setDraftName('');
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {isBandInputListsExpanded(band.id) && (
                  <div className="sidebar-nested-group">
                    {(bandInputListsByBandId[band.id] ?? []).length === 0 && addingBandInputListId !== band.id && (
                      <p className="sidebar-empty-hint">No technical riders yet.</p>
                    )}

                    {(bandInputListsByBandId[band.id] ?? []).map((rider) => (
                      <div
                        key={rider.id}
                        className={`sidebar-list-item${pathname === `/bands/${band.id}/riders/${rider.id}` ? ' active' : ''}`}
                      >
                        <button
                          className="sidebar-list-item-btn"
                          onClick={() => {
                            clearGlobalSelection();
                            navigate(`/bands/${band.id}/riders/${rider.id}`);
                            onNavigate?.();
                          }}
                        >
                          <SidebarItemIcon icon={rider.icon} fallback={<ClipboardList size={14} />} />
                          <span className="sidebar-list-name">{rider.name}</span>
                          {inputCount(rider) > 0 && <span className="sidebar-list-count">{inputCount(rider)}</span>}
                        </button>
                      </div>
                    ))}

                    {addingBandInputListId === band.id && (
                      <InlineInput
                        value={draftName}
                        onChange={setDraftName}
                        onCommit={() => void commitBandInputList(band.id)}
                        onCancel={() => setAddingBandInputListId(null)}
                        placeholder="Technical rider name..."
                      />
                    )}
                  </div>
                )}

                <div className="sidebar-setlists-header">
                  <button
                    type="button"
                    className="sidebar-section-toggle"
                    onClick={() => toggleBandPressKitsExpanded(band.id)}
                    aria-expanded={isBandPressKitsExpanded(band.id)}
                  >
                    {isBandPressKitsExpanded(band.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="sidebar-section-title">Press Kits</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-icon-btn"
                    title="New press kit"
                    aria-label="Create new press kit"
                    onClick={() => {
                      setCollapsedBandPressKitIds((prev) => prev.filter((id) => id !== band.id));
                      setAddingBandPressKitId(band.id);
                      setDraftName('');
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {isBandPressKitsExpanded(band.id) && (
                  <div className="sidebar-nested-group">
                    {(bandPressKitsByBandId[band.id] ?? []).length === 0 && addingBandPressKitId !== band.id && (
                      <p className="sidebar-empty-hint">No press kits yet.</p>
                    )}
                    {(bandPressKitsByBandId[band.id] ?? []).map((kit) => (
                      <div
                        key={kit.id}
                        className={`sidebar-list-item${pathname === `/bands/${band.id}/press-kit/${kit.id}` ? ' active' : ''}`}
                      >
                        <button
                          className="sidebar-list-item-btn"
                          onClick={() => {
                            clearGlobalSelection();
                            navigate(`/bands/${band.id}/press-kit/${kit.id}`);
                            onNavigate?.();
                          }}
                        >
                          <SidebarItemIcon icon={kit.icon} fallback={<Newspaper size={14} />} />
                          <span className="sidebar-list-name">{kit.name}</span>
                          {kit.imageIds.length > 0 && <span className="sidebar-list-count">{kit.imageIds.length}</span>}
                        </button>
                      </div>
                    ))}

                    {addingBandPressKitId === band.id && (
                      <InlineInput
                        value={draftName}
                        onChange={setDraftName}
                        onCommit={() => void commitBandPressKit(band.id)}
                        onCancel={() => setAddingBandPressKitId(null)}
                        placeholder="Press kit name..."
                      />
                    )}
                  </div>
                )}

                <div className="sidebar-setlists-header">
                  <button
                    type="button"
                    className="sidebar-section-toggle"
                    onClick={() => toggleBandToursExpanded(band.id)}
                    aria-expanded={isBandToursExpanded(band.id)}
                  >
                    {isBandToursExpanded(band.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="sidebar-section-title">Tours</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-icon-btn"
                    title="New tour"
                    aria-label="Create new tour"
                    onClick={() => {
                      setCollapsedBandTourIds((prev) => prev.filter((id) => id !== band.id));
                      setAddingBandTourId(band.id);
                      setDraftName('');
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {isBandToursExpanded(band.id) && (
                  <div className="sidebar-nested-group">
                    <div className={`sidebar-list-item${pathname === `/bands/${band.id}/gigs` ? ' active' : ''}`}>
                      <button
                        className="sidebar-list-item-btn"
                        onClick={() => {
                          clearGlobalSelection();
                          navigate(`/bands/${band.id}/gigs`);
                          onNavigate?.();
                        }}
                      >
                        <SidebarItemIcon fallback={<CalendarDays size={14} />} />
                        <span className="sidebar-list-name">All gigs</span>
                        {(bandGigsByBandId[band.id]?.length ?? 0) > 0 && (
                          <span className="sidebar-list-count">{bandGigsByBandId[band.id]?.length ?? 0}</span>
                        )}
                      </button>
                    </div>

                    {(bandToursByBandId[band.id] ?? []).map((tour) => (
                      <div
                        key={tour.id}
                        className={`sidebar-list-item${pathname === `/bands/${band.id}/tours/${tour.id}` ? ' active' : ''}`}
                      >
                        <button
                          className="sidebar-list-item-btn"
                          onClick={() => {
                            clearGlobalSelection();
                            navigate(`/bands/${band.id}/tours/${tour.id}`);
                            onNavigate?.();
                          }}
                        >
                          <SidebarItemIcon icon={tour.icon} fallback={<RouteIcon size={14} />} />
                          <span className="sidebar-list-name">{tour.name}</span>
                          {(tourGigCounts[band.id]?.[tour.id] ?? 0) > 0 && (
                            <span className="sidebar-list-count">{tourGigCounts[band.id]?.[tour.id]}</span>
                          )}
                        </button>
                      </div>
                    ))}

                    {addingBandTourId === band.id && (
                      <InlineInput
                        value={draftName}
                        onChange={setDraftName}
                        onCommit={() => void commitBandTour(band.id)}
                        onCancel={() => setAddingBandTourId(null)}
                        placeholder="Tour name..."
                      />
                    )}
                  </div>
                )}


              </div>
            </div>
          ))}
        </div>
      </div>
      )}

    </aside>
    {!mobile && open && (
      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={Math.round(userWidth ?? SIDEBAR_DEFAULT_WIDTH)}
        tabIndex={0}
        title="Drag to resize · double-click to fit names"
        onPointerDown={startResize}
        onDoubleClick={fitWidthToNames}
        onKeyDown={handleResizeKey}
      />
    )}
    </div>
  );
}

interface InlineInputProps {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  placeholder: string;
}

function InlineInput({ value, onChange, onCommit, onCancel, placeholder }: InlineInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="sidebar-inline-input">
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={onCommit}
        placeholder={placeholder}
      />
    </div>
  );
}
