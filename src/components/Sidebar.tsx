import { useState, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Folder, FolderOpen, Trash2, X, ListMusic, ListMusicIcon, Users, Plus } from 'lucide-react';
import { useSongLists } from '../context/SongListsContext';
import { useSetlists } from '../context/SetlistsContext';
import { useBands } from '../context/BandsContext';

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
  const {
    songLists,
    activeSongListId,
    addSongList,
    deleteSongList,
    addSongToList,
    clearActiveSelection,
    setActiveSongListId,
  } = useSongLists();

  const {
    setlists,
    activeSetlistId,
    addSetlist,
    deleteSetlist,
    addSongToSetlist,
    setActiveSetlistId,
  } = useSetlists();

  const { bands, createBand } = useBands();

  const [addingFolder, setAddingFolder] = useState(false);
  const [addingSetlist, setAddingSetlist] = useState(false);
  const [addingBand, setAddingBand] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [songDropTargetId, setSongDropTargetId] = useState<string | null>(null);
  const [setlistDropTargetId, setSetlistDropTargetId] = useState<string | null>(null);
  const setlistDropActive = setlistDropTargetId !== null;

  const goToLibraryView = () => {
    if (pathname !== '/') {
      navigate('/');
    }
    onNavigate?.();
  };

  const commitFolder = () => {
    if (draftName.trim()) addSongList(draftName.trim());
    setDraftName('');
    setAddingFolder(false);
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
        navigate(`/bands/${result.bandId}`);
        onNavigate?.();
      }
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

  return (
    <div className={`sidebar-anim${open ? ' sidebar-anim--open' : ''}${mobile ? ' sidebar-anim--mobile' : ''}`}>
    <aside className={`sidebar${mobile ? ' sidebar--mobile' : ''}${open ? ' sidebar--open' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-title">Library</span>
        <div className="sidebar-header-actions">
          <button
            className="sidebar-icon-btn"
            title="New folder"
            onClick={() => { setAddingFolder(true); setDraftName(''); }}
          >
            <Plus size={15} />
          </button>
          {mobile && onClose && (
            <button className="sidebar-icon-btn" title="Close sidebar" onClick={onClose}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-folders">
        <div className={`sidebar-list-item sidebar-list-item--pinned${activeSongListId === null && activeSetlistId === null ? ' active' : ''}`}>
          <button
            className="sidebar-list-item-btn"
            onClick={() => { clearActiveSelection(); setActiveSetlistId(null); goToLibraryView(); }}
          >
            <ListMusic size={14} />
            <span className="sidebar-list-name">All songs</span>
          </button>
        </div>

        {songLists.map((list) => (
          <FolderItem
            key={list.id}
            listId={list.id}
            name={list.name}
            icon={list.icon}
            color={list.color}
            count={list.songIds.length}
            active={activeSongListId === list.id}
            songDropTarget={songDropTargetId === list.id}
            onDragOver={(e) => handleDragOver(e, list.id)}
            onDragLeave={() => setSongDropTargetId((c) => (c === list.id ? null : c))}
            onDrop={(e) => handleDrop(e, list.id)}
            onSelect={() => { setActiveSongListId(list.id); setActiveSetlistId(null); goToLibraryView(); }}
            onDelete={() => deleteSongList(list.id)}
          />
        ))}

        {addingFolder && (
          <InlineInput
            value={draftName}
            onChange={setDraftName}
            onCommit={commitFolder}
            onCancel={() => setAddingFolder(false)}
            placeholder="Folder name..."
          />
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
            <div
              key={band.id}
              className={`sidebar-band-item${pathname === `/bands/${band.id}` ? ' active' : ''}`}
            >
              <button
                className="sidebar-band-item-btn"
                onClick={() => { navigate(`/bands/${band.id}`); onNavigate?.(); }}
              >
                <Users size={14} />
                <span className="sidebar-band-name">{band.name}</span>
              </button>
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

      <div className={`sidebar-setlists-section${setlistDropActive ? ' drop-active' : ''}`}>
        <div className="sidebar-setlists-header">
          <h3 className="sidebar-section-title">Setlists</h3>
          <button
            className="sidebar-icon-btn"
            title="New setlist"
            onClick={() => { setAddingSetlist(true); setDraftName(''); }}
          >
            <Plus size={15} />
          </button>
        </div>

        <div className={`sidebar-setlists${setlistDropActive ? ' drop-active' : ''}`}>
          {setlists.map((setlist) => (
            <SetlistItem
              key={setlist.id}
              setlistId={setlist.id}
              name={setlist.name}
              count={setlist.songIds.length}
              active={activeSetlistId === setlist.id}
              songDropTarget={setlistDropTargetId === setlist.id}
              onDragOver={(e) => handleSetlistDragOver(e, setlist.id)}
              onDragLeave={() => setSetlistDropTargetId((c) => (c === setlist.id ? null : c))}
              onDrop={(e) => handleSetlistDrop(e, setlist.id)}
              onSelect={() => { setActiveSetlistId(setlist.id); setActiveSongListId(null); clearActiveSelection(); goToLibraryView(); }}
              onDelete={() => deleteSetlist(setlist.id)}
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
      </div>
    </aside>
    </div>
  );
}

interface FolderItemProps {
  listId: string;
  name: string;
  icon?: string;
  color?: string;
  count: number;
  active: boolean;
  songDropTarget: boolean;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onSelect: () => void;
  onDelete: () => void;
}

function FolderItem({
  name,
  icon,
  color,
  count,
  active,
  songDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelect,
  onDelete,
}: FolderItemProps) {
  const style = color
    ? ({ '--list-accent': color } as CSSProperties)
    : undefined;

  return (
    <div
      className={`sidebar-list-item${active ? ' active' : ''}${songDropTarget ? ' song-drop-target' : ''}`}
      style={style}
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
      <button className="sidebar-list-delete" title="Delete folder" onClick={onDelete}>
        <Trash2 size={12} />
      </button>
    </div>
  );
}

interface SetlistItemProps {
  setlistId: string;
  name: string;
  count: number;
  active: boolean;
  songDropTarget: boolean;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onSelect: () => void;
  onDelete: () => void;
}

function SetlistItem({
  name,
  count,
  active,
  songDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelect,
  onDelete,
}: SetlistItemProps) {
  return (
    <div
      className={`sidebar-setlist-item${active ? ' active' : ''}${songDropTarget ? ' song-drop-target' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button className="sidebar-setlist-item-btn" onClick={onSelect}>
        {active ? <ListMusicIcon size={14} /> : <ListMusic size={14} />}
        <span className="sidebar-setlist-name">{name}</span>
        {songDropTarget && <span className="sidebar-setlist-drop-label">Drop song</span>}
        {count > 0 && <span className="sidebar-setlist-count">{count}</span>}
      </button>
      <button className="sidebar-setlist-delete" title="Delete setlist" onClick={onDelete}>
        <Trash2 size={12} />
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
