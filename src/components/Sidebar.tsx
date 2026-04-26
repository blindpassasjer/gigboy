import { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, FolderPlus, List, Plus, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { useSongLists } from '../context/SongListsContext';

interface Props {
  open: boolean;
}

export default function Sidebar({ open }: Props) {
  const {
    folders,
    songLists,
    activeSongListId,
    addFolder,
    deleteFolder,
    addSongList,
    deleteSongList,
    setActiveSongListId,
  } = useSongLists();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [addingFolder, setAddingFolder] = useState(false);
  const [addingListIn, setAddingListIn] = useState<string | 'root' | null>(null);
  const [draftName, setDraftName] = useState('');

  const toggleFolder = (id: string) => {
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
        className={`sidebar-all-songs${activeSongListId === null ? ' active' : ''}`}
        onClick={() => setActiveSongListId(null)}
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
              <button className="sidebar-folder-toggle" onClick={() => toggleFolder(folder.id)}>
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
              <div className="sidebar-folder-children">
                {listsInFolder.map((list) => (
                  <SidebarListItem
                    key={list.id}
                    name={list.name}
                    count={list.songIds.length}
                    active={activeSongListId === list.id}
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

      {unfiledLists.map((list) => (
        <SidebarListItem
          key={list.id}
          name={list.name}
          count={list.songIds.length}
          active={activeSongListId === list.id}
          onSelect={() => setActiveSongListId(list.id)}
          onDelete={() => deleteSongList(list.id)}
        />
      ))}

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
  name: string;
  count: number;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function SidebarListItem({ name, count, active, onSelect, onDelete }: ListItemProps) {
  return (
    <div className={`sidebar-list-item${active ? ' active' : ''}`}>
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
