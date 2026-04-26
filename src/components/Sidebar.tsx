import { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, FolderPlus, List, Plus, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { useSongLists } from '../context/SongListsContext';

const SONG_DRAG_MIME = 'application/x-songbook-song-id';
const LIST_DRAG_MIME = 'application/x-songbook-list-id';

interface Props {
  open: boolean;
}

export default function Sidebar({ open }: Props) {
  const {
    folders,
    songLists,
    activeFolderId,
    activeSongListId,
    addFolder,
    addSongToList,
    deleteFolder,
    addSongList,
    deleteSongList,
    moveSongList,
    clearActiveSelection,
    setActiveFolderId,
    setActiveSongListId,
  } = useSongLists();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [addingFolder, setAddingFolder] = useState(false);
  const [addingListIn, setAddingListIn] = useState<string | 'root' | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draggingListId, setDraggingListId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ folderKey: string | 'root'; beforeListId: string | null } | null>(null);
  const [songDropTargetId, setSongDropTargetId] = useState<string | null>(null);

  const toggleFolder = (id: string) => {
    setActiveFolderId(id);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const commitFolder = () => {
    if (draftName.trim()) addFolder(draftName.trim());
    setDraftName('');
    setAddingFolder(false);
  };

  const commitList = (folderId?: string) => {
    if (draftName.trim()) addSongList(draftName.trim(), folderId);
    setDraftName('');
    setAddingListIn(null);
  };

  const startAddingListIn = (folderId: string) => {
    setExpandedFolders((prev) => new Set([...prev, folderId]));
    setAddingListIn(folderId);
    setDraftName('');
  };

  const unfiledLists = songLists.filter((l) => !l.folderId);

  const handleListDragStart = (listId: string, event: React.DragEvent<HTMLDivElement>) => {
    setDraggingListId(listId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(LIST_DRAG_MIME, listId);
    event.dataTransfer.setData('text/plain', listId);
  };

  const handleListDragEnd = () => {
    setDraggingListId(null);
    setDropPreview(null);
    setSongDropTargetId(null);
  };

  const handleListDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    folderKey: string | 'root',
    listId: string
  ) => {
    const isSongDrop = event.dataTransfer.types.includes(SONG_DRAG_MIME);

    if (isSongDrop) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setSongDropTargetId(listId);
      return;
    }

    if (!draggingListId || draggingListId === listId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setSongDropTargetId(null);
    setDropPreview({ folderKey, beforeListId: listId });
  };

  const handleContainerDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    folderKey: string | 'root'
  ) => {
    if (!draggingListId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setSongDropTargetId(null);
    setDropPreview({ folderKey, beforeListId: null });
  };

  const commitDrop = (
    event: React.DragEvent<HTMLDivElement>,
    listId: string | null,
    targetFolderId: string | undefined,
    beforeListId: string | null
  ) => {
    event.preventDefault();

    const droppedSongId = event.dataTransfer.getData(SONG_DRAG_MIME);
    if (droppedSongId && listId) {
      addSongToList(listId, droppedSongId);
      setSongDropTargetId(null);
      setDropPreview(null);
      return;
    }

    if (!draggingListId) return;
    moveSongList(draggingListId, targetFolderId, beforeListId);
    setDraggingListId(null);
    setDropPreview(null);
    setSongDropTargetId(null);
  };

  if (!open) return null;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Song Lists</span>
        <button
          className="sidebar-icon-btn"
          title="New folder"
          onClick={() => { setAddingFolder(true); setDraftName(''); }}
        >
          <FolderPlus size={15} />
        </button>
      </div>

      <button
        className={`sidebar-all-songs${activeSongListId === null && activeFolderId === null ? ' active' : ''}`}
        onClick={clearActiveSelection}
      >
        All songs
      </button>

      {addingFolder && (
        <InlineInput
          value={draftName}
          onChange={setDraftName}
          onCommit={commitFolder}
          onCancel={() => setAddingFolder(false)}
          placeholder="Folder name…"
        />
      )}

      {folders.map((folder) => {
        const isExpanded = expandedFolders.has(folder.id);
        const listsInFolder = songLists.filter((l) => l.folderId === folder.id);
        return (
          <div key={folder.id} className="sidebar-folder">
            <div className="sidebar-folder-header">
              <button
                className={`sidebar-folder-toggle${activeFolderId === folder.id ? ' active' : ''}`}
                onClick={() => toggleFolder(folder.id)}
              >
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                <span className="sidebar-folder-name">{folder.name}</span>
              </button>
              <div className="sidebar-folder-actions">
                <button title="New list" onClick={() => startAddingListIn(folder.id)}>
                  <Plus size={13} />
                </button>
                <button title="Delete folder" onClick={() => deleteFolder(folder.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {isExpanded && (
              <div
                className={`sidebar-folder-children${dropPreview?.folderKey === folder.id && dropPreview.beforeListId === null ? ' drop-active' : ''}`}
                onDragOver={(e) => handleContainerDragOver(e, folder.id)}
                onDrop={(e) => commitDrop(e, null, folder.id, dropPreview?.folderKey === folder.id ? dropPreview.beforeListId : null)}
              >
                {listsInFolder.map((list) => (
                  <SidebarListItem
                    key={list.id}
                    listId={list.id}
                    folderKey={folder.id}
                    name={list.name}
                    count={list.songIds.length}
                    active={activeSongListId === list.id}
                    dragging={draggingListId === list.id}
                    songDropTarget={songDropTargetId === list.id}
                    dropBefore={dropPreview?.folderKey === folder.id && dropPreview.beforeListId === list.id}
                    onDragStart={handleListDragStart}
                    onDragEnd={handleListDragEnd}
                    onDragOver={handleListDragOver}
                    onDrop={(e, beforeListId) => commitDrop(e, list.id, folder.id, beforeListId)}
                    onDragLeave={() => setSongDropTargetId((current) => (current === list.id ? null : current))}
                    onSelect={() => setActiveSongListId(list.id)}
                    onDelete={() => deleteSongList(list.id)}
                  />
                ))}
                {addingListIn === folder.id && (
                  <InlineInput
                    indented
                    value={draftName}
                    onChange={setDraftName}
                    onCommit={() => commitList(folder.id)}
                    onCancel={() => setAddingListIn(null)}
                    placeholder="List name…"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      <div
        className={`sidebar-root-lists${dropPreview?.folderKey === 'root' && dropPreview.beforeListId === null ? ' drop-active' : ''}`}
        onDragOver={(e) => handleContainerDragOver(e, 'root')}
        onDrop={(e) => commitDrop(e, null, undefined, dropPreview?.folderKey === 'root' ? dropPreview.beforeListId : null)}
      >
        {unfiledLists.map((list) => (
          <SidebarListItem
            key={list.id}
            listId={list.id}
            folderKey="root"
            name={list.name}
            count={list.songIds.length}
            active={activeSongListId === list.id}
            dragging={draggingListId === list.id}
            songDropTarget={songDropTargetId === list.id}
            dropBefore={dropPreview?.folderKey === 'root' && dropPreview.beforeListId === list.id}
            onDragStart={handleListDragStart}
            onDragEnd={handleListDragEnd}
            onDragOver={handleListDragOver}
            onDrop={(e, beforeListId) => commitDrop(e, list.id, undefined, beforeListId)}
            onDragLeave={() => setSongDropTargetId((current) => (current === list.id ? null : current))}
            onSelect={() => setActiveSongListId(list.id)}
            onDelete={() => deleteSongList(list.id)}
          />
        ))}
      </div>

      {addingListIn === 'root' ? (
        <InlineInput
          value={draftName}
          onChange={setDraftName}
          onCommit={() => commitList(undefined)}
          onCancel={() => setAddingListIn(null)}
          placeholder="List name…"
        />
      ) : (
        <button
          className="sidebar-new-list-btn"
          onClick={() => { setAddingListIn('root'); setDraftName(''); }}
        >
          <Plus size={13} /> New list
        </button>
      )}
    </aside>
  );
}

interface ListItemProps {
  listId: string;
  folderKey: string | 'root';
  name: string;
  count: number;
  active: boolean;
  dragging: boolean;
  songDropTarget: boolean;
  dropBefore: boolean;
  onDragStart: (listId: string, event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>, folderKey: string | 'root', listId: string) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, beforeListId: string) => void;
  onDragLeave: () => void;
  onSelect: () => void;
  onDelete: () => void;
}

function SidebarListItem({
  listId,
  folderKey,
  name,
  count,
  active,
  dragging,
  songDropTarget,
  dropBefore,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onDragLeave,
  onSelect,
  onDelete,
}: ListItemProps) {
  return (
    <div
      className={`sidebar-list-item${active ? ' active' : ''}${dragging ? ' dragging' : ''}${songDropTarget ? ' song-drop-target' : ''}${dropBefore ? ' drop-before' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(listId, e)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, folderKey, listId)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, listId)}
    >
      <button className="sidebar-list-item-btn" onClick={onSelect}>
        <List size={13} />
        <span className="sidebar-list-name">{name}</span>
        {count > 0 && <span className="sidebar-list-count">{count}</span>}
      </button>
      <button className="sidebar-list-delete" title="Delete list" onClick={onDelete}>
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
  indented?: boolean;
}

function InlineInput({ value, onChange, onCommit, onCancel, placeholder, indented }: InlineInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className={`sidebar-inline-input${indented ? ' indented' : ''}`}>
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
