import { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, FolderPlus, Trash2, X } from 'lucide-react';
import { useSongLists } from '../context/SongListsContext';

const SONG_DRAG_MIME = 'application/x-songbook-song-id';
const SONG_DRAG_FALLBACK_MIME = 'text/x-songbook-song-id';

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

  const [addingFolder, setAddingFolder] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [songDropTargetId, setSongDropTargetId] = useState<string | null>(null);

  const commitFolder = () => {
    if (draftName.trim()) addSongList(draftName.trim());
    setDraftName('');
    setAddingFolder(false);
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

  if (!open) return null;

  return (
    <aside className={`sidebar${mobile ? ' sidebar--mobile' : ''}`}>
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
        className={`sidebar-all-songs${activeSongListId === null ? ' active' : ''}`}
        onClick={() => { clearActiveSelection(); onNavigate?.(); }}
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
            onSelect={() => { setActiveSongListId(list.id); onNavigate?.(); }}
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
    </aside>
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
