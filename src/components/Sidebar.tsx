import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Folder, FolderOpen, ListMusic, ListMusicIcon, Plus, Users, X } from 'lucide-react';
import { useSongLists } from '../context/SongListsContext';
import { useSetlists } from '../context/SetlistsContext';
import { useBands } from '../context/BandsContext';
import { useSongs } from '../context/SongsContext';

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
  const { pathname } = useLocation();
  const { songs } = useSongs();
  const {
    songLists,
    activeSongListId,
    addSongList,
    addSongToList,
    clearActiveSelection,
    setActiveSongListId,
  } = useSongLists();

  const {
    setlists,
    activeSetlistId,
    addSetlist,
    addSongToSetlist,
    setActiveSetlistId,
  } = useSetlists();

  const {
    bands,
    bandSongsByBandId,
    bandSongListsByBandId,
    bandSetlistsByBandId,
    refreshBandSongs,
    refreshBandSongLists,
    refreshBandSetlists,
    createBand,
    addSongToBandLibrary,
    addBandSongList,
    addSongToBandSongList,
    addBandSetlist,
    addSongToBandSetlist,
  } = useBands();

  const [addingSongList, setAddingSongList] = useState(false);
  const [addingSetlist, setAddingSetlist] = useState(false);
  const [addingBand, setAddingBand] = useState(false);
  const [addingBandSongListId, setAddingBandSongListId] = useState<string | null>(null);
  const [addingBandSetlistId, setAddingBandSetlistId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [songDropTargetId, setSongDropTargetId] = useState<string | null>(null);
  const [setlistDropTargetId, setSetlistDropTargetId] = useState<string | null>(null);
  const [bandLibraryDropTargetId, setBandLibraryDropTargetId] = useState<string | null>(null);
  const [bandSongListDropTargetId, setBandSongListDropTargetId] = useState<string | null>(null);
  const [bandSetlistDropTargetId, setBandSetlistDropTargetId] = useState<string | null>(null);
  const [soloSonglistsExpanded, setSoloSonglistsExpanded] = useState(true);
  const [soloSetlistsExpanded, setSoloSetlistsExpanded] = useState(true);
  const [collapsedBandSonglistIds, setCollapsedBandSonglistIds] = useState<string[]>([]);
  const [collapsedBandSetlistIds, setCollapsedBandSetlistIds] = useState<string[]>([]);
  const [expandedBandIds, setExpandedBandIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];

    try {
      const raw = window.localStorage.getItem('folio-expanded-band-ids');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('folio-expanded-band-ids', JSON.stringify(expandedBandIds));
  }, [expandedBandIds]);

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

    if (
      missingBandSongCollections.length === 0
      && missingBandSongListCollections.length === 0
      && missingBandSetlistCollections.length === 0
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
  }, [
    bandSetlistsByBandId,
    bandSongListsByBandId,
    bandSongsByBandId,
    bands,
    refreshBandSetlists,
    refreshBandSongLists,
    refreshBandSongs,
  ]);

  const goToLibraryView = () => {
    if (pathname !== '/') {
      navigate('/');
    }
    onNavigate?.();
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

  const commitBand = async () => {
    const name = draftName.trim();
    setDraftName('');
    setAddingBand(false);
    if (name) {
      const result = await createBand(name);
      if (result.bandId) {
        navigate(`/bands/${result.bandId}/library`);
        setExpandedBandIds((prev) => (prev.includes(result.bandId as string) ? prev : [...prev, result.bandId as string]));
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
      navigate(`/bands/${bandId}/setlists/${result.setlistId}`);
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

  const toggleBandExpanded = (bandId: string) => {
    setExpandedBandIds((prev) => (
      prev.includes(bandId)
        ? prev.filter((entry) => entry !== bandId)
        : [...prev, bandId]
    ));
  };

  const isBandSonglistsExpanded = (bandId: string) => !collapsedBandSonglistIds.includes(bandId);

  const isBandSetlistsExpanded = (bandId: string) => !collapsedBandSetlistIds.includes(bandId);

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

  const isMyAllSongsActive = pathname === '/' && activeSongListId === null && activeSetlistId === null;

  return (
    <div className={`sidebar-anim${open ? ' sidebar-anim--open' : ''}${mobile ? ' sidebar-anim--mobile' : ''}`}>
    <aside className={`sidebar${mobile ? ' sidebar--mobile' : ''}${open ? ' sidebar--open' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-title"></span>
        <div className="sidebar-header-actions">
          {mobile && onClose && (
            <button className="sidebar-icon-btn" title="Close sidebar" onClick={onClose}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-folders">
        <div className="sidebar-setlists-header">
          <h3 className="sidebar-section-title">Solo</h3>
        </div>

        <div className={`sidebar-list-item sidebar-list-item--section${isMyAllSongsActive ? ' active' : ''}`}>
          <button
            className="sidebar-icon-btn"
            onClick={() => setSoloSonglistsExpanded((current) => !current)}
            aria-expanded={soloSonglistsExpanded}
            aria-label={soloSonglistsExpanded ? 'Collapse songlists' : 'Expand songlists'}
          >
            {soloSonglistsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <button
            className="sidebar-list-item-btn"
            onClick={() => { clearActiveSelection(); setActiveSetlistId(null); goToLibraryView(); }}
          >
            <ListMusic size={14} />
            <span className="sidebar-list-name">All songs</span>
            {songs.length > 0 && <span className="sidebar-list-count">{songs.length}</span>}
          </button>
          <button
            className="sidebar-icon-btn"
            title="New songlist"
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
          <div className="sidebar-nested-group">
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
                onSelect={() => { setActiveSongListId(list.id); setActiveSetlistId(null); goToLibraryView(); }}
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

            <div className="sidebar-list-item sidebar-list-item--section">
              <button
                className="sidebar-icon-btn"
                onClick={() => setSoloSetlistsExpanded((current) => !current)}
                aria-expanded={soloSetlistsExpanded}
                aria-label={soloSetlistsExpanded ? 'Collapse setlists' : 'Expand setlists'}
              >
                {soloSetlistsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <button
                className="sidebar-list-item-btn"
                onClick={() => setSoloSetlistsExpanded((current) => !current)}
              >
                <ListMusicIcon size={14} />
                <span className="sidebar-list-name">Setlists</span>
              </button>
              <button
                className="sidebar-icon-btn"
                title="New setlist"
                onClick={() => { setSoloSetlistsExpanded(true); setAddingSetlist(true); setDraftName(''); }}
              >
                <Plus size={15} />
              </button>
            </div>

            {soloSetlistsExpanded && (
              <div className="sidebar-setlists">
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
                    onSelect={() => { setActiveSetlistId(setlist.id); setActiveSongListId(null); clearActiveSelection(); goToLibraryView(); }}
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
          </div>
        )}
      </div>

      <div className="sidebar-bands-section">
        <div className="sidebar-bands-header">
          <h3 className="sidebar-section-title">Bands</h3>
          <button
            className="sidebar-icon-btn"
            title="New band"
            onClick={() => { setAddingBand(true); setDraftName(''); }}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="sidebar-bands-list">
          {bands.map((band) => (
            <div key={band.id} className="sidebar-folder">
              <div className="sidebar-folder-header">
                <button
                  className="sidebar-folder-toggle"
                  onClick={() => toggleBandExpanded(band.id)}
                >
                  {expandedBandIds.includes(band.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {band.icon ? <span className="sidebar-list-icon" aria-hidden="true">{band.icon}</span> : <Users size={14} />}
                  <span className="sidebar-folder-name">{band.name}</span>
                </button>
              </div>

              {expandedBandIds.includes(band.id) && (
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
                      className="sidebar-icon-btn"
                      onClick={() => toggleBandSonglistsExpanded(band.id)}
                      aria-expanded={isBandSonglistsExpanded(band.id)}
                      aria-label={isBandSonglistsExpanded(band.id) ? 'Collapse songlists' : 'Expand songlists'}
                    >
                      {isBandSonglistsExpanded(band.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <button
                      className="sidebar-list-item-btn"
                      onClick={() => { navigate(`/bands/${band.id}/library`); onNavigate?.(); }}
                    >
                      <ListMusic size={14} />
                      <span className="sidebar-list-name">Library</span>
                      {(bandSongsByBandId[band.id]?.length ?? 0) > 0 && (
                        <span className="sidebar-list-count">{bandSongsByBandId[band.id]?.length ?? 0}</span>
                      )}
                    </button>
                    <button
                      className="sidebar-icon-btn"
                      title="New band songlist"
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
                            onClick={() => { navigate(`/bands/${band.id}/songlists/${songList.id}`); onNavigate?.(); }}
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
                      className="sidebar-section-toggle"
                      onClick={() => toggleBandSetlistsExpanded(band.id)}
                      aria-expanded={isBandSetlistsExpanded(band.id)}
                    >
                      {isBandSetlistsExpanded(band.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="sidebar-section-title">Setlists</span>
                    </button>
                    <button
                      className="sidebar-icon-btn"
                      title="New band setlist"
                      onClick={() => { setAddingBandSetlistId(band.id); setDraftName(''); }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {isBandSetlistsExpanded(band.id) && (
                    <>
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
                            onClick={() => { navigate(`/bands/${band.id}/setlists/${setlist.id}`); onNavigate?.(); }}
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
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {addingBand && (
            <InlineInput
              value={draftName}
              onChange={setDraftName}
              onCommit={commitBand}
              onCancel={() => setAddingBand(false)}
              placeholder="Band name..."
            />
          )}
        </div>
      </div>
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
      <button className="sidebar-list-item-btn" onClick={onSelect}>
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
      <button className="sidebar-setlist-item-btn" onClick={onSelect}>
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
