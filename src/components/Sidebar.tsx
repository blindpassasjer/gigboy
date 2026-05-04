import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, ClipboardList, Folder, FolderOpen, ListMusic, ListMusicIcon, Map, Plus, Trash2, User, Users, X, ChevronsUpDown } from 'lucide-react';
import { useSongLists } from '../context/SongListsContext';
import { useSetlists } from '../context/SetlistsContext';
import { useBands } from '../context/BandsContext';
import { useSongs } from '../context/SongsContext';
import { useTechnicalRiders } from '../context/TechnicalRidersContext';
import { useStageplots } from '../context/StageplotsContext';

const SONG_DRAG_MIME = 'application/x-folio-song-id';
const SONG_DRAG_FALLBACK_MIME = 'text/x-folio-song-id';

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
  onClose?: () => void;
}

export default function Sidebar({ open, mobile = false, onNavigate, onClose }: Props) {
  const navigate = useNavigate();
  const { pathname, state } = useLocation();
  const stateBandId = (() => {
    if (!state || typeof state !== 'object') return null;
    const candidate = (state as { bandId?: unknown }).bandId;
    return typeof candidate === 'string' && candidate.trim() ? candidate : null;
  })();
  const isBandsRoute = pathname === '/bands' || pathname.startsWith('/bands/') || Boolean(stateBandId);
  const { songs, trashedSongs } = useSongs();
  const {
    songLists,
    trashedSongLists,
    activeSongListId,
    addSongList,
    addSongToList,
    clearActiveSelection,
    setActiveSongListId,
  } = useSongLists();

  const {
    setlists,
    trashedSetlists,
    activeSetlistId,
    addSetlist,
    addSongToSetlist,
    setActiveSetlistId,
  } = useSetlists();
  const {
    technicalRiders,
    activeTechnicalRiderId,
    setActiveTechnicalRiderId,
    addTechnicalRider,
  } = useTechnicalRiders();
  const {
    stageplots,
    activeStageplotId,
    setActiveStageplotId,
    addStageplot,
  } = useStageplots();

  const {
    bands,
    bandSongsByBandId,
    bandSongListsByBandId,
    bandSetlistsByBandId,
    bandStageplotsByBandId,
    bandTechnicalRidersByBandId,
    bandTrashByBandId,
    refreshBandSongs,
    refreshBandSongLists,
    refreshBandSetlists,
    refreshBandStageplots,
    refreshBandTechnicalRiders,
    refreshBandTrash,
    createBand,
    addSongToBandLibrary,
    addBandSongList,
    addSongToBandSongList,
    addBandSetlist,
    addSongToBandSetlist,
    addBandStageplot,
    addBandTechnicalRider,
  } = useBands();

  const [addingSongList, setAddingSongList] = useState(false);
  const [addingSetlist, setAddingSetlist] = useState(false);
  const [addingBand, setAddingBand] = useState(false);
  const [addingBandSongListId, setAddingBandSongListId] = useState<string | null>(null);
  const [addingBandSetlistId, setAddingBandSetlistId] = useState<string | null>(null);
  const [addingBandStageplotId, setAddingBandStageplotId] = useState<string | null>(null);
  const [addingStageplot, setAddingStageplot] = useState(false);
  const [addingTechnicalRider, setAddingTechnicalRider] = useState(false);
  const [addingBandTechnicalRiderId, setAddingBandTechnicalRiderId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [songDropTargetId, setSongDropTargetId] = useState<string | null>(null);
  const [setlistDropTargetId, setSetlistDropTargetId] = useState<string | null>(null);
  const [bandLibraryDropTargetId, setBandLibraryDropTargetId] = useState<string | null>(null);
  const [bandSongListDropTargetId, setBandSongListDropTargetId] = useState<string | null>(null);
  const [bandSetlistDropTargetId, setBandSetlistDropTargetId] = useState<string | null>(null);
  const [soloSonglistsExpanded, setSoloSonglistsExpanded] = useState(true);
  const [soloSetlistsExpanded, setSoloSetlistsExpanded] = useState(true);
  const [soloStageplotsExpanded, setSoloStageplotsExpanded] = useState(true);
  const [soloRidersExpanded, setSoloRidersExpanded] = useState(true);
  const [collapsedBandSonglistIds, setCollapsedBandSonglistIds] = useState<string[]>([]);
  const [collapsedBandSetlistIds, setCollapsedBandSetlistIds] = useState<string[]>([]);
  const [collapsedBandStageplotIds, setCollapsedBandStageplotIds] = useState<string[]>([]);
  const [collapsedBandTechnicalRiderIds, setCollapsedBandTechnicalRiderIds] = useState<string[]>([]);
  const [sidebarMode, setSidebarMode] = useState<'solo' | 'bands'>(() => {
    if (typeof window !== 'undefined') {
      const storedMode = window.localStorage.getItem('folio-sidebar-mode');
      if (storedMode === 'solo' || storedMode === 'bands') return storedMode;
    }
    return isBandsRoute ? 'bands' : 'solo';
  });
  const [activeBandId, setActiveBandId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try { return window.localStorage.getItem('folio-active-band-id'); } catch { return null; }
  });
  const [bandSwitcherOpen, setBandSwitcherOpen] = useState(false);
  const bandSwitcherRef = useRef<HTMLDivElement>(null);
  // Auto-select first band if active band is missing
  useEffect(() => {
    if (bands.length === 0) return;
    if (activeBandId && bands.some((b) => b.id === activeBandId)) return;
    const firstId = bands[0].id;
    setActiveBandId(firstId);
    if (typeof window !== 'undefined') window.localStorage.setItem('folio-active-band-id', firstId);
  }, [bands, activeBandId]);

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

  useEffect(() => {
    const nextMode: 'solo' | 'bands' = isBandsRoute ? 'bands' : 'solo';
    setSidebarMode((current) => (current === nextMode ? current : nextMode));
  }, [isBandsRoute]);

  useEffect(() => {
    if (!stateBandId) return;
    setActiveBandId((current) => (current === stateBandId ? current : stateBandId));
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('folio-active-band-id', stateBandId);
    }
  }, [stateBandId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('folio-sidebar-mode', sidebarMode);
  }, [sidebarMode]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-library-mode', sidebarMode);
    return () => {
      document.documentElement.removeAttribute('data-library-mode');
    };
  }, [sidebarMode]);

  useEffect(() => {
    if (sidebarMode === 'bands') return;
    setBandSwitcherOpen(false);
  }, [sidebarMode]);

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

    const missingBandStageplotCollections = bands
      .map((band) => band.id)
      .filter((bandId) => bandStageplotsByBandId[bandId] === undefined);

    const missingBandTrashCollections = bands
      .map((band) => band.id)
      .filter((bandId) => bandTrashByBandId[bandId] === undefined);

    const missingBandTechnicalRiderCollections = bands
      .map((band) => band.id)
      .filter((bandId) => bandTechnicalRidersByBandId[bandId] === undefined);

    if (
      missingBandSongCollections.length === 0
      && missingBandSongListCollections.length === 0
      && missingBandSetlistCollections.length === 0
      && missingBandStageplotCollections.length === 0
      && missingBandTrashCollections.length === 0
      && missingBandTechnicalRiderCollections.length === 0
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

    missingBandStageplotCollections.forEach((bandId) => {
      void refreshBandStageplots(bandId).catch(() => {
        // Sidebar counts are best-effort; detailed errors are handled on band pages.
      });
    });

    missingBandTrashCollections.forEach((bandId) => {
      void refreshBandTrash(bandId).catch(() => {
        // Sidebar counts are best-effort; detailed errors are handled on band pages.
      });
    });

    missingBandTechnicalRiderCollections.forEach((bandId) => {
      void refreshBandTechnicalRiders(bandId).catch(() => {
        // Sidebar counts are best-effort; detailed errors are handled on band pages.
      });
    });
  }, [
    bandTrashByBandId,
    bandSetlistsByBandId,
    bandStageplotsByBandId,
    bandTechnicalRidersByBandId,
    bandSongListsByBandId,
    bandSongsByBandId,
    bands,
    refreshBandTrash,
    refreshBandSetlists,
    refreshBandStageplots,
    refreshBandTechnicalRiders,
    refreshBandSongLists,
    refreshBandSongs,
  ]);

  const goToLibraryView = () => {
    setActiveStageplotId(null);
    setActiveTechnicalRiderId(null);
    if (pathname !== '/') {
      navigate('/');
    }
    onNavigate?.();
  };

  const clearSoloSelection = () => {
    clearActiveSelection();
    setActiveSetlistId(null);
    setActiveStageplotId(null);
    setActiveTechnicalRiderId(null);
  };

  const commitSongList = () => {
    if (draftName.trim()) addSongList(draftName.trim());
    setDraftName('');
    setAddingSongList(false);
  };

  const commitSetlist = () => {
    if (draftName.trim()) addSetlist(draftName.trim());
    setDraftName('');
    setAddingSetlist(false);
  };

  const commitStageplot = async () => {
    const name = draftName.trim();
    setDraftName('');
    setAddingStageplot(false);
    if (!name) return;

    const result = await addStageplot(name);
    if (result.stageplotId) {
      clearSoloSelection();
      setActiveStageplotId(result.stageplotId);
      navigate('/');
      onNavigate?.();
    }
  };

  const commitTechnicalRider = async () => {
    const name = draftName.trim();
    setDraftName('');
    setAddingTechnicalRider(false);
    if (!name) return;

    const result = await addTechnicalRider(name);
    if (result.riderId) {
      clearSoloSelection();
      setActiveTechnicalRiderId(result.riderId);
      navigate('/');
      onNavigate?.();
    }
  };

  const commitBand = async () => {
    const name = draftName.trim();
    setDraftName('');
    setAddingBand(false);
    if (name) {
      const result = await createBand(name);
      if (result.bandId) {
        setActiveBandId(result.bandId);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('folio-active-band-id', result.bandId);
        }
        clearSoloSelection();
        navigate(`/bands/${result.bandId}/library`, { state: { bandId: result.bandId } });
        onNavigate?.();
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
      clearSoloSelection();
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
      clearSoloSelection();
      navigate(`/bands/${bandId}/setlists/${result.setlistId}`);
      onNavigate?.();
    }
  };

  const commitBandStageplot = async (bandId: string) => {
    const name = draftName.trim();
    setDraftName('');
    setAddingBandStageplotId(null);
    if (!name) return;

    const result = await addBandStageplot(bandId, name);
    if (result.stageplotId) {
      clearSoloSelection();
      navigate(`/bands/${bandId}/stageplots/${result.stageplotId}`);
      onNavigate?.();
    }
  };

  const commitBandTechnicalRider = async (bandId: string) => {
    const name = draftName.trim();
    setDraftName('');
    setAddingBandTechnicalRiderId(null);
    if (!name) return;

    const result = await addBandTechnicalRider(bandId, name);
    if (result.riderId) {
      clearSoloSelection();
      navigate(`/bands/${bandId}/riders/${result.riderId}`);
      onNavigate?.();
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>, listId: string) => {
    const isSongDrop = hasType(event.dataTransfer.types, SONG_DRAG_MIME)
      || hasType(event.dataTransfer.types, SONG_DRAG_FALLBACK_MIME);
    if (!isSongDrop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setSongDropTargetId((c) => (c === listId ? c : listId));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, listId: string) => {
    const songId = readSongIdFromDrag(event);
    if (!songId) return;
    event.preventDefault();
    addSongToList(listId, songId);
    setSongDropTargetId(null);
  };

  const handleSetlistDragOver = (event: React.DragEvent<HTMLDivElement>, setlistId: string) => {
    const isSongDrop = hasType(event.dataTransfer.types, SONG_DRAG_MIME)
      || hasType(event.dataTransfer.types, SONG_DRAG_FALLBACK_MIME);
    if (!isSongDrop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setSetlistDropTargetId((c) => (c === setlistId ? c : setlistId));
  };

  const handleSetlistDrop = (event: React.DragEvent<HTMLDivElement>, setlistId: string) => {
    const songId = readSongIdFromDrag(event);
    if (!songId) return;
    event.preventDefault();
    addSongToSetlist(setlistId, songId);
    setSetlistDropTargetId(null);
  };

  const isBandSonglistsExpanded = (bandId: string) => !collapsedBandSonglistIds.includes(bandId);

  const isBandSetlistsExpanded = (bandId: string) => !collapsedBandSetlistIds.includes(bandId);

  const isBandStageplotsExpanded = (bandId: string) => !collapsedBandStageplotIds.includes(bandId);

  const isBandTechnicalRidersExpanded = (bandId: string) => !collapsedBandTechnicalRiderIds.includes(bandId);

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

  const toggleBandStageplotsExpanded = (bandId: string) => {
    setCollapsedBandStageplotIds((prev) => (
      prev.includes(bandId)
        ? prev.filter((entry) => entry !== bandId)
        : [...prev, bandId]
    ));
  };

  const toggleBandTechnicalRidersExpanded = (bandId: string) => {
    setCollapsedBandTechnicalRiderIds((prev) => (
      prev.includes(bandId)
        ? prev.filter((entry) => entry !== bandId)
        : [...prev, bandId]
    ));
  };

  const findSongById = (songId: string) => songs.find((entry) => entry.id === songId);

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

  const soloTrashCount = trashedSongs.length + trashedSongLists.length + trashedSetlists.length;
  const isMyAllSongsActive = (
    pathname === '/'
    && activeSongListId === null
    && activeSetlistId === null
    && activeStageplotId === null
    && activeTechnicalRiderId === null
  );
  const isSoloTrashActive = pathname === '/trash';
  const effectiveActiveBand = bands.find((band) => band.id === activeBandId) ?? bands[0] ?? null;

  const switchToSoloLibrary = () => {
    setSidebarMode('solo');
    clearSoloSelection();
    navigate('/');
    onNavigate?.();
  };

  const switchToBandLibrary = () => {
    setSidebarMode('bands');
    clearSoloSelection();

    if (effectiveActiveBand) {
      setActiveBandId(effectiveActiveBand.id);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('folio-active-band-id', effectiveActiveBand.id);
      }
      navigate(`/bands/${effectiveActiveBand.id}/library`);
    } else {
      navigate('/bands');
    }

    onNavigate?.();
  };

  return (
    <div className={`sidebar-anim${open ? ' sidebar-anim--open' : ''}${mobile ? ' sidebar-anim--mobile' : ''}`}>
    <aside id="app-sidebar" className={`sidebar${mobile ? ' sidebar--mobile' : ''}${open ? ' sidebar--open' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-title"></span>
        <div className="sidebar-header-actions">
          {mobile && onClose && (
            <button type="button" className="sidebar-icon-btn" title="Close sidebar" aria-label="Close sidebar" onClick={onClose}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-mode-toggle" role="tablist" aria-label="Sidebar sections">
        <button
          type="button"
          className={`sidebar-mode-toggle-btn${sidebarMode === 'solo' ? ' active' : ''}`}
          onClick={switchToSoloLibrary}
          aria-selected={sidebarMode === 'solo'}
          role="tab"
        >
          <User size={14} />
          <span>Solo</span>
        </button>
        <button
          type="button"
          className={`sidebar-mode-toggle-btn${sidebarMode === 'bands' ? ' active' : ''}`}
          onClick={switchToBandLibrary}
          aria-selected={sidebarMode === 'bands'}
          role="tab"
        >
          <Users size={14} />
          <span>Bands</span>
        </button>
      </div>

      {sidebarMode === 'solo' && (
      <div className="sidebar-folders">
        <div className="sidebar-setlists-header">
          <h3 className="sidebar-section-title"><User size={14} /> Solo</h3>
        </div>

        <div className="sidebar-solo-sections">
          <section className="sidebar-solo-section">
            <div className={`sidebar-list-item sidebar-list-item--section${isMyAllSongsActive ? ' active' : ''}`}>
              <button
                className="sidebar-list-item-btn"
                onClick={() => { clearActiveSelection(); setActiveSetlistId(null); goToLibraryView(); }}
              >
                <ListMusic size={14} />
                <span className="sidebar-list-name">Library</span>
                {songs.length > 0 && <span className="sidebar-list-count">{songs.length}</span>}
              </button>
            </div>

            <div className={`sidebar-list-item sidebar-list-item--section${isSoloTrashActive ? ' active' : ''}`}>
              <button
                className="sidebar-list-item-btn"
                onClick={() => {
                  clearActiveSelection();
                  setActiveSetlistId(null);
                  setActiveStageplotId(null);
                  setActiveTechnicalRiderId(null);
                  navigate('/trash');
                  onNavigate?.();
                }}
              >
                <Trash2 size={14} />
                <span className="sidebar-list-name">Trash</span>
                {soloTrashCount > 0 && <span className="sidebar-list-count">{soloTrashCount}</span>}
              </button>
            </div>

            <div className="sidebar-setlists-header">
              <button
                type="button"
                className="sidebar-section-toggle"
                onClick={() => setSoloSonglistsExpanded((current) => !current)}
                aria-expanded={soloSonglistsExpanded}
              >
                {soloSonglistsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="sidebar-section-title">Songlists</span>
              </button>
              <button
                type="button"
                className="sidebar-icon-btn"
                title="New songlist"
                aria-label="Create new songlist"
                onClick={() => {
                  setSoloSonglistsExpanded(true);
                  setAddingSongList(true);
                  setDraftName('');
                }}
              >
                <Plus size={15} />
              </button>
            </div>

            {soloSonglistsExpanded && (
              <div className="sidebar-solo-list sidebar-nested-group">
                {songLists.map((list) => (
                  <FolderItem
                    key={list.id}
                    listId={list.id}
                    name={list.name}
                    icon={list.icon}
                    count={list.songIds.length}
                    active={activeSongListId === list.id}
                    songDropTarget={songDropTargetId === list.id}
                    onDragOver={(e) => handleDragOver(e, list.id)}
                    onDragLeave={() => setSongDropTargetId((c) => (c === list.id ? null : c))}
                    onDrop={(e) => handleDrop(e, list.id)}
                    onSelect={() => {
                      setActiveSongListId(list.id);
                      setActiveSetlistId(null);
                      setActiveStageplotId(null);
                      setActiveTechnicalRiderId(null);
                      goToLibraryView();
                    }}
                  />
                ))}

                {addingSongList && (
                  <InlineInput
                    value={draftName}
                    onChange={setDraftName}
                    onCommit={commitSongList}
                    onCancel={() => setAddingSongList(false)}
                    placeholder="Songlist name..."
                  />
                )}
              </div>
            )}
          </section>

          <section className="sidebar-solo-section">
            <div className="sidebar-setlists-header">
              <button
                type="button"
                className="sidebar-section-toggle"
                onClick={() => setSoloSetlistsExpanded((current) => !current)}
                aria-expanded={soloSetlistsExpanded}
              >
                {soloSetlistsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="sidebar-section-title">Setlists</span>
              </button>
              <button
                type="button"
                className="sidebar-icon-btn"
                title="New setlist"
                aria-label="Create new setlist"
                onClick={() => { setSoloSetlistsExpanded(true); setAddingSetlist(true); setDraftName(''); }}
              >
                <Plus size={15} />
              </button>
            </div>

            {soloSetlistsExpanded && (
              <div className="sidebar-solo-list sidebar-setlists sidebar-nested-group">
                {setlists.map((setlist) => (
                  <SetlistItem
                    key={setlist.id}
                    setlistId={setlist.id}
                    name={setlist.name}
                    icon={setlist.icon}
                    count={setlist.songIds.length}
                    active={activeSetlistId === setlist.id}
                    songDropTarget={setlistDropTargetId === setlist.id}
                    onDragOver={(e) => handleSetlistDragOver(e, setlist.id)}
                    onDragLeave={() => setSetlistDropTargetId((c) => (c === setlist.id ? null : c))}
                    onDrop={(e) => handleSetlistDrop(e, setlist.id)}
                    onSelect={() => {
                      setActiveSetlistId(setlist.id);
                      setActiveSongListId(null);
                      clearActiveSelection();
                      setActiveStageplotId(null);
                      setActiveTechnicalRiderId(null);
                      goToLibraryView();
                    }}
                  />
                ))}

                {addingSetlist && (
                  <InlineInput
                    value={draftName}
                    onChange={setDraftName}
                    onCommit={commitSetlist}
                    onCancel={() => setAddingSetlist(false)}
                    placeholder="Setlist name..."
                  />
                )}
              </div>
            )}
          </section>

          <section className="sidebar-solo-section">
            <div className="sidebar-setlists-header">
              <button
                type="button"
                className="sidebar-section-toggle"
                onClick={() => setSoloStageplotsExpanded((current) => !current)}
                aria-expanded={soloStageplotsExpanded}
              >
                {soloStageplotsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="sidebar-section-title">Stageplots</span>
              </button>
              <button
                type="button"
                className="sidebar-icon-btn"
                title="New stageplot"
                aria-label="Create new stageplot"
                onClick={() => {
                  setSoloStageplotsExpanded(true);
                  setAddingStageplot(true);
                  setDraftName('');
                }}
              >
                <Plus size={15} />
              </button>
            </div>

            {soloStageplotsExpanded && (
              <div className="sidebar-solo-list sidebar-nested-group">
                {stageplots.map((stageplot) => (
                  <div
                    key={stageplot.id}
                    className={`sidebar-list-item${activeStageplotId === stageplot.id ? ' active' : ''}`}
                  >
                    <button
                      type="button"
                      className="sidebar-list-item-btn"
                      onClick={() => {
                        setActiveStageplotId(stageplot.id);
                        setActiveTechnicalRiderId(null);
                        setActiveSongListId(null);
                        setActiveSetlistId(null);
                        clearActiveSelection();
                        navigate('/');
                        onNavigate?.();
                      }}
                    >
                      {stageplot.icon ? <span className="sidebar-list-icon" aria-hidden="true">{stageplot.icon}</span> : <Map size={14} />}
                      <span className="sidebar-list-name">{stageplot.name}</span>
                      {stageplot.items.length > 0 ? <span className="sidebar-list-count">{stageplot.items.length}</span> : null}
                    </button>
                  </div>
                ))}

                {addingStageplot && (
                  <InlineInput
                    value={draftName}
                    onChange={setDraftName}
                    onCommit={() => void commitStageplot()}
                    onCancel={() => setAddingStageplot(false)}
                    placeholder="Stageplot name..."
                  />
                )}
              </div>
            )}
          </section>

          <section className="sidebar-solo-section">
            <div className="sidebar-setlists-header">
              <button
                type="button"
                className="sidebar-section-toggle"
                onClick={() => setSoloRidersExpanded((current) => !current)}
                aria-expanded={soloRidersExpanded}
              >
                {soloRidersExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="sidebar-section-title">Technical Riders</span>
              </button>
              <button
                type="button"
                className="sidebar-icon-btn"
                title="New technical rider"
                aria-label="Create new technical rider"
                onClick={() => {
                  setSoloRidersExpanded(true);
                  setAddingTechnicalRider(true);
                  setDraftName('');
                }}
              >
                <Plus size={15} />
              </button>
            </div>

            {soloRidersExpanded && (
              <div className="sidebar-solo-list sidebar-nested-group">
                {technicalRiders.map((rider) => (
                  <div
                    key={rider.id}
                    className={`sidebar-list-item${activeTechnicalRiderId === rider.id ? ' active' : ''}`}
                  >
                    <button
                      type="button"
                      className="sidebar-list-item-btn"
                      onClick={() => {
                        setActiveTechnicalRiderId(rider.id);
                        setActiveStageplotId(null);
                        setActiveSongListId(null);
                        setActiveSetlistId(null);
                        clearActiveSelection();
                        navigate('/');
                        onNavigate?.();
                      }}
                    >
                      <ClipboardList size={14} />
                      <span className="sidebar-list-name">{rider.name}</span>
                      {rider.lines.length > 0 ? <span className="sidebar-list-count">{rider.lines.length}</span> : null}
                    </button>
                  </div>
                ))}

                {addingTechnicalRider && (
                  <InlineInput
                    value={draftName}
                    onChange={setDraftName}
                    onCommit={() => void commitTechnicalRider()}
                    onCancel={() => setAddingTechnicalRider(false)}
                    placeholder="Technical rider name..."
                  />
                )}
              </div>
            )}
          </section>
        </div>
      </div>
      )}

      {sidebarMode === 'bands' && (
      <div className="sidebar-bands-section">
        <div className="sidebar-bands-header" ref={bandSwitcherRef}>
          {bands.length === 0 ? (
            <h3 className="sidebar-section-title">Bands</h3>
          ) : (
            <div className="sidebar-band-switcher">
              <button
                type="button"
                className="sidebar-band-switcher-btn"
                onClick={() => { if (bands.length > 1) setBandSwitcherOpen((o) => !o); }}
                title="Switch band"
                aria-label="Switch active band"
                aria-haspopup="listbox"
                aria-expanded={bandSwitcherOpen}
                aria-disabled={bands.length <= 1}
              >
                {effectiveActiveBand?.icon
                  ? <span className="sidebar-list-icon" aria-hidden="true">{effectiveActiveBand.icon}</span>
                  : <Users size={13} />}
                <span className="sidebar-band-switcher-name">
                  {effectiveActiveBand?.name ?? ''}
                </span>
                <ChevronsUpDown size={12} className={`sidebar-band-switcher-chevron${bands.length <= 1 ? ' sidebar-band-switcher-chevron--hidden' : ''}`} />
              </button>

              {bandSwitcherOpen && (
                <div className="sidebar-band-switcher-dropdown" role="listbox">
                  {bands.map((band) => (
                    <button
                      type="button"
                      key={band.id}
                      className={`sidebar-band-switcher-option${band.id === activeBandId ? ' active' : ''}`}
                      role="option"
                      aria-selected={band.id === activeBandId}
                      onClick={() => {
                        clearSoloSelection();
                        setActiveBandId(band.id);
                        if (typeof window !== 'undefined') window.localStorage.setItem('folio-active-band-id', band.id);
                        setBandSwitcherOpen(false);
                        navigate(`/bands/${band.id}/library`);
                        onNavigate?.();
                      }}
                    >
                      {band.icon
                        ? <span className="sidebar-list-icon" aria-hidden="true">{band.icon}</span>
                        : <Users size={13} />}
                      <span className="sidebar-band-switcher-option-name">{band.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="sidebar-icon-btn"
            title="New band"
            aria-label="Create new band"
            onClick={() => { setAddingBand(true); setDraftName(''); }}
          >
            <Plus size={15} />
          </button>
        </div>
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
          {bands.filter((band) => band.id === activeBandId).map((band) => (
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
                    onClick={() => { clearSoloSelection(); navigate(`/bands/${band.id}/library`); onNavigate?.(); }}
                  >
                    <ListMusic size={14} />
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
                      clearSoloSelection();
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
                          onClick={() => { clearSoloSelection(); navigate(`/bands/${band.id}/songlists/${songList.id}`); onNavigate?.(); }}
                        >
                          {songList.icon ? <span className="sidebar-list-icon" aria-hidden="true">{songList.icon}</span> : <Folder size={14} />}
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
                          onClick={() => { clearSoloSelection(); navigate(`/bands/${band.id}/setlists/${setlist.id}`); onNavigate?.(); }}
                        >
                          {setlist.icon ? <span className="sidebar-list-icon" aria-hidden="true">{setlist.icon}</span> : <ListMusic size={14} />}
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
                    onClick={() => toggleBandStageplotsExpanded(band.id)}
                    aria-expanded={isBandStageplotsExpanded(band.id)}
                  >
                    {isBandStageplotsExpanded(band.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="sidebar-section-title">Stageplots</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-icon-btn"
                    title="New band stageplot"
                    aria-label="Create new band stageplot"
                    onClick={() => {
                      setCollapsedBandStageplotIds((prev) => prev.filter((entry) => entry !== band.id));
                      setAddingBandStageplotId(band.id);
                      setDraftName('');
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {isBandStageplotsExpanded(band.id) && (
                  <div className="sidebar-nested-group">
                    {(bandStageplotsByBandId[band.id] ?? []).map((stageplot) => (
                      <div
                        key={stageplot.id}
                        className={`sidebar-list-item${pathname === `/bands/${band.id}/stageplots/${stageplot.id}` ? ' active' : ''}`}
                      >
                        <button
                          className="sidebar-list-item-btn"
                          onClick={() => { clearSoloSelection(); navigate(`/bands/${band.id}/stageplots/${stageplot.id}`); onNavigate?.(); }}
                        >
                          {stageplot.icon ? <span className="sidebar-list-icon" aria-hidden="true">{stageplot.icon}</span> : <Map size={14} />}
                          <span className="sidebar-list-name">{stageplot.name}</span>
                          {stageplot.items.length > 0 && <span className="sidebar-list-count">{stageplot.items.length}</span>}
                        </button>
                      </div>
                    ))}

                    {addingBandStageplotId === band.id && (
                      <InlineInput
                        value={draftName}
                        onChange={setDraftName}
                        onCommit={() => void commitBandStageplot(band.id)}
                        onCancel={() => setAddingBandStageplotId(null)}
                        placeholder="Band stageplot name..."
                      />
                    )}
                  </div>
                )}

                <div className="sidebar-setlists-header">
                  <button
                    type="button"
                    className="sidebar-section-toggle"
                    onClick={() => toggleBandTechnicalRidersExpanded(band.id)}
                    aria-expanded={isBandTechnicalRidersExpanded(band.id)}
                  >
                    {isBandTechnicalRidersExpanded(band.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="sidebar-section-title">Technical Riders</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-icon-btn"
                    title="New band technical rider"
                    aria-label="Create new band technical rider"
                    onClick={() => {
                      setCollapsedBandTechnicalRiderIds((prev) => prev.filter((entry) => entry !== band.id));
                      setAddingBandTechnicalRiderId(band.id);
                      setDraftName('');
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {isBandTechnicalRidersExpanded(band.id) && (
                  <div className="sidebar-nested-group">
                    {(bandTechnicalRidersByBandId[band.id] ?? []).map((rider) => (
                      <div
                        key={rider.id}
                        className={`sidebar-list-item${pathname === `/bands/${band.id}/riders/${rider.id}` ? ' active' : ''}`}
                      >
                        <button
                          className="sidebar-list-item-btn"
                          onClick={() => { clearSoloSelection(); navigate(`/bands/${band.id}/riders/${rider.id}`); onNavigate?.(); }}
                        >
                          <ClipboardList size={14} />
                          <span className="sidebar-list-name">{rider.name}</span>
                          {rider.lines.length > 0 && <span className="sidebar-list-count">{rider.lines.length}</span>}
                        </button>
                      </div>
                    ))}

                    {addingBandTechnicalRiderId === band.id && (
                      <InlineInput
                        value={draftName}
                        onChange={setDraftName}
                        onCommit={() => void commitBandTechnicalRider(band.id)}
                        onCancel={() => setAddingBandTechnicalRiderId(null)}
                        placeholder="Band technical rider name..."
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
    </div>
  );
}

interface FolderItemProps {
  listId: string;
  name: string;
  icon?: string;
  count: number;
  active: boolean;
  songDropTarget: boolean;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onSelect: () => void;
}

function FolderItem({
  name,
  icon,
  count,
  active,
  songDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelect,
}: FolderItemProps) {
  return (
    <div
      className={`sidebar-list-item${active ? ' active' : ''}${songDropTarget ? ' song-drop-target' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button type="button" className="sidebar-list-item-btn" onClick={onSelect}>
        {icon ? (
          <span className="sidebar-list-icon" aria-hidden="true">{icon}</span>
        ) : (
          active ? <FolderOpen size={14} /> : <Folder size={14} />
        )}
        <span className="sidebar-list-name">{name}</span>
        {count > 0 && <span className="sidebar-list-count">{count}</span>}
      </button>
    </div>
  );
}

interface SetlistItemProps {
  setlistId: string;
  name: string;
  icon?: string;
  count: number;
  active: boolean;
  songDropTarget: boolean;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onSelect: () => void;
}

function SetlistItem({
  name,
  icon,
  count,
  active,
  songDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelect,
}: SetlistItemProps) {
  return (
    <div
      className={`sidebar-setlist-item${active ? ' active' : ''}${songDropTarget ? ' song-drop-target' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button type="button" className="sidebar-setlist-item-btn" onClick={onSelect}>
        {icon ? <span className="sidebar-list-icon" aria-hidden="true">{icon}</span> : active ? <ListMusicIcon size={14} /> : <ListMusic size={14} />}
        <span className="sidebar-setlist-name">{name}</span>
        {songDropTarget && <span className="sidebar-setlist-drop-label">Drop song</span>}
        {count > 0 && <span className="sidebar-setlist-count">{count}</span>}
      </button>
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
