import { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, FolderPlus, Trash2, X, ListMusic, ListMusicIcon } from 'lucide-react';
import { useSongLists } from '../context/SongListsContext';
import { useSetlists } from '../context/SetlistsContext';

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

  const [addingFolder, setAddingFolder] = useState(false);
  const [addingSetlist, setAddingSetlist] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [songDropTargetId, setSongDropTargetId] = useState<string | null>(null);
  const [setlistDropTargetId, setSetlistDropTargetId] = useState<string | null>(null);

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
            <FolderPlus size={15} />
          </button>
          {mobile && onClose && (
            <button className="sidebar-icon-btn" title="Close sidebar" onClick={onClose}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <button
        className={`sidebar-all-songs${activeSongListId === null && activeSetlistId === null ? ' active' : ''}`}
        onClick={() => { clearActiveSelection(); setActiveSetlistId(null); onNavigate?.(); }}
      >
        All songs
      </button>

      <div className="sidebar-folders">
        {songLists.map((list) => (
          <FolderItem
            key={list.id}
            listId={list.id}
            name={list.name}
            count={list.songIds.length}
            active={activeSongListId === list.id}
            songDropTarget={songDropTargetId === list.id}
            onDragOver={(e) => handleDragOver(e, list.id)}
            onDragLeave={() => setSongDropTargetId((c) => (c === list.id ? null : c))}
            onDrop={(e) => handleDrop(e, list.id)}
            onSelect={() => { setActiveSongListId(list.id); setActiveSetlistId(null); onNavigate?.(); }}
            onDelete={() => deleteSongList(list.id)}
          />
        ))}

        {addingFolder && (
          <InlineInput
            value={draftName}
            onChange={setDraftName}
            onCommit={commitFolder}
            onCancel={() => setAddingFolder(false)}
            placeholder="Folder name…"
          />
        )}
      </div>

      {!addingFolder && (
        <button
          className="sidebar-new-list-btn"
          onClick={() => { setAddingFolder(true); setDraftName(''); }}
        >
          <FolderPlus size={13} /> New folder
        </button>
      )}

      <div className="sidebar-setlists-section">
        <div className="sidebar-setlists-header">
          <h3 className="sidebar-section-title">Setlists</h3>
          <button
            className="sidebar-icon-btn"
            title="New setlist"
            onClick={() => { setAddingSetlist(true); setDraftName(''); }}
          >
            <FolderPlus size={15} />
          </button>
        </div>

        <div className="sidebar-setlists">
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
              onSelect={() => { setActiveSetlistId(setlist.id); setActiveSongListId(null); clearActiveSelection(); onNavigate?.(); }}
              onDelete={() => deleteSetlist(setlist.id)}
            />
          ))}

          {addingSetlist && (
            <InlineInput
              value={draftName}
              onChange={setDraftName}
              onCommit={commitSetlist}
              onCancel={() => setAddingSetlist(false)}
              placeholder="Setlist name…"
            />
          )}
        </div>

        {!addingSetlist && setlists.length > 0 && (
          <button
            className="sidebar-new-setlist-btn"
            onClick={() => { setAddingSetlist(true); setDraftName(''); }}
          >
            <FolderPlus size={13} /> New setlist
          </button>
        )}

        {setlists.length === 0 && !addingSetlist && (
          <button
            className="sidebar-new-setlist-btn sidebar-new-setlist-btn--primary"
            onClick={() => { setAddingSetlist(true); setDraftName(''); }}
          >
            <ListMusic size={13} /> Create your first setlist
          </button>
        )}
      </div>
    </aside>
    </div>
  );
}

interface FolderItemProps {
  listId: string;
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

function FolderItem({
  name,
  count,
  active,
  songDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelect,
  onDelete,
}: FolderItemProps) {
  return (
    <div
      className={`sidebar-list-item${active ? ' active' : ''}${songDropTarget ? ' song-drop-target' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button className="sidebar-list-item-btn" onClick={onSelect}>
        {active ? <FolderOpen size={14} /> : <Folder size={14} />}
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
