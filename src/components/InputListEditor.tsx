import { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Plus, Trash2, PenLine, ClipboardList } from 'lucide-react';
import type { RiderEquipmentItem, InputList, InputListLine } from '../types';
import { showConfirmToast } from '../utils/toastDialogs';
import { ICON_OPTIONS } from '../lib/iconOptions';

interface Props {
  rider: InputList;
  canEdit: boolean;
  showHeader?: boolean;
  onRename: (name: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onUpdateIcon: (icon?: string) => Promise<void> | void;
  onSaveContent: (params: {
    lines: InputListLine[];
    preferredEquipment: RiderEquipmentItem[];
    inventoryEquipment: RiderEquipmentItem[];
  }) => Promise<void> | void;
  onCopyPublicLink: () => Promise<void> | void;
}

function normalizeEmojiIcon(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return [...trimmed].slice(0, 2).join('');
}

function createLine(): InputListLine {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
  };
}

function createEquipmentItem(): RiderEquipmentItem {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
  };
}

export default function InputListEditor({
  rider,
  canEdit,
  showHeader = true,
  onRename,
  onDelete,
  onUpdateIcon,
  onSaveContent,
  onCopyPublicLink,
}: Props) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(rider.name);
  const [lines, setLines] = useState<InputListLine[]>(rider.lines);
  const [preferredEquipment, setPreferredEquipment] = useState<RiderEquipmentItem[]>(rider.preferredEquipment);
  const [inventoryEquipment, setInventoryEquipment] = useState<RiderEquipmentItem[]>(rider.inventoryEquipment);
  const [showIconEditor, setShowIconEditor] = useState(false);
  const [iconDraft, setIconDraft] = useState(rider.icon ?? '🎤');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveStateResetTimerRef = useRef<number | null>(null);
  const saveRequestIdRef = useRef(0);
  const iconPickerRef = useRef<HTMLDivElement | null>(null);
  const iconTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Reset ALL local state when the active rider changes (different id).
  const prevRiderIdRef = useRef(rider.id);
  useEffect(() => {
    if (prevRiderIdRef.current === rider.id) return;
    prevRiderIdRef.current = rider.id;
    setRenameValue(rider.name);
    setLines(rider.lines);
    setPreferredEquipment(rider.preferredEquipment);
    setInventoryEquipment(rider.inventoryEquipment);
    setIconDraft(rider.icon ?? '🎤');
    setSaveState('idle');
    setShowIconEditor(false);
  }, [rider.id, rider.icon, rider.inventoryEquipment, rider.lines, rider.name, rider.preferredEquipment]);

  useEffect(() => {
    return () => {
      if (saveStateResetTimerRef.current !== null) {
        window.clearTimeout(saveStateResetTimerRef.current);
      }
    };
  }, []);

  // Keep the rename input in sync when a rename is committed externally.
  useEffect(() => {
    if (!isRenaming) setRenameValue(rider.name);
  }, [isRenaming, rider.name]);

  useEffect(() => {
    if (!showIconEditor) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (iconPickerRef.current?.contains(target)) return;
      if (iconTriggerRef.current?.contains(target)) return;
      setShowIconEditor(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowIconEditor(false);
      iconTriggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showIconEditor]);

  useEffect(() => {
    setIconDraft(rider.icon ?? '🎤');
  }, [rider.icon]);

  const hasChanges = useMemo(() => {
    return JSON.stringify({ lines, preferredEquipment, inventoryEquipment }) !== JSON.stringify({
      lines: rider.lines,
      preferredEquipment: rider.preferredEquipment,
      inventoryEquipment: rider.inventoryEquipment,
    });
  }, [inventoryEquipment, lines, preferredEquipment, rider.inventoryEquipment, rider.lines, rider.preferredEquipment]);

  const handleRenameCommit = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameValue(rider.name);
      setIsRenaming(false);
      return;
    }

    if (trimmed !== rider.name) {
      await onRename(trimmed);
    }
    setIsRenaming(false);
  };

  // Autosave with debounce whenever content changes.
  useEffect(() => {
    if (!canEdit || !hasChanges) return;

    setSaveState('saving');
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;

    const timer = setTimeout(() => {
      void Promise.resolve(onSaveContent({ lines, preferredEquipment, inventoryEquipment }))
        .then(() => {
          if (requestId !== saveRequestIdRef.current) return;
          setSaveState('saved');
          if (saveStateResetTimerRef.current !== null) {
            window.clearTimeout(saveStateResetTimerRef.current);
          }
          saveStateResetTimerRef.current = window.setTimeout(() => {
            setSaveState((current) => (current === 'saved' ? 'idle' : current));
          }, 1800);
        })
        .catch(() => {
          if (requestId !== saveRequestIdRef.current) return;
          setSaveState('error');
        });
    }, 1000);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, preferredEquipment, inventoryEquipment]);

  const saveStatusLabel = saveState === 'saving'
    ? 'Autosaving…'
    : saveState === 'saved'
      ? 'All changes saved'
      : saveState === 'error'
        ? 'Autosave failed'
        : 'Autosave on';

  const saveStatusClassName = saveState === 'saving'
    ? 'notes-save-status notes-save-status--saving'
    : saveState === 'saved'
      ? 'notes-save-status notes-save-status--saved'
      : saveState === 'error'
        ? 'notes-save-status notes-save-status--error'
        : 'notes-save-status notes-save-status--idle';

  const handleDeleteRider = async () => {
    if (!onDelete) return;
    const confirmed = await showConfirmToast(`Move rider "${rider.name}" to trash?`, {
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;
    await onDelete();
  };

  return (
    <>
      {showHeader ? (
        <div className="song-list-sticky list-sticky-header">
          <div className="setlist-header songlist-header resource-header">
            <div className="setlist-title-block">
              {isRenaming ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleRenameCommit();
                    if (event.key === 'Escape') {
                      setRenameValue(rider.name);
                      setIsRenaming(false);
                    }
                  }}
                  onBlur={() => void handleRenameCommit()}
                  className="setlist-name-input"
                />
              ) : (
                <div className="song-list-title-row">
                  <h1 className="song-list-heading resource-title setlist-title resource-title--setlist">
                    {canEdit ? (
                      <div className="icon-picker-wrapper" ref={iconPickerRef}>
                        <button
                          ref={iconTriggerRef}
                          type="button"
                          className={`icon-picker-trigger${showIconEditor ? ' is-open' : ''}`}
                          aria-haspopup="dialog"
                          aria-expanded={showIconEditor}
                          onClick={(e) => { e.stopPropagation(); setShowIconEditor((v) => !v); }}
                          title="Change rider icon"
                          aria-label="Change rider icon"
                        >
                          <span className="song-list-heading-icon resource-title-icon" aria-hidden="true">{rider.icon ?? '🎤'}</span>
                        </button>
                        {showIconEditor && (
                          <div className="icon-picker-popover" role="dialog" aria-label="Choose rider icon">
                            <div className="emoji-choice-grid" role="radiogroup" aria-label="Rider icon options">
                              <button
                                type="button"
                                className={`emoji-choice-btn${!rider.icon ? ' active' : ''}`}
                                onClick={() => { void onUpdateIcon(undefined); setIconDraft('🎤'); setShowIconEditor(false); }}
                                aria-pressed={!rider.icon}
                              >
                                <ClipboardList size={16} />
                              </button>
                              {ICON_OPTIONS.map((emoji) => {
                                const selected = iconDraft === emoji;
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className={`emoji-choice-btn${selected ? ' active' : ''}`}
                                    onClick={() => { void onUpdateIcon(normalizeEmojiIcon(emoji)); setIconDraft(emoji); setShowIconEditor(false); }}
                                    aria-pressed={selected}
                                  >
                                    {emoji}
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              className="icon-picker-reset-btn"
                              onClick={() => { void onUpdateIcon(undefined); setIconDraft('🎤'); setShowIconEditor(false); }}
                            >
                              Reset to default
                            </button>
                          </div>
                        )}
                      </div>
                    ) : rider.icon ? (
                      <span className="song-list-heading-icon resource-title-icon" aria-hidden="true">{rider.icon}</span>
                    ) : null}
                    {rider.name}
                  </h1>
                  {canEdit ? (
                    <button type="button" className="title-rename-btn" onClick={() => setIsRenaming(true)} title="Rename rider">
                      <PenLine size={14} />
                    </button>
                  ) : null}
                </div>
              )}
              <div className="autosave-status-row">
                <p className="song-list-summary setlist-song-count">
                  {lines.length} line{lines.length === 1 ? '' : 's'}
                </p>
                {canEdit ? (
                  <span className={saveStatusClassName} aria-live="polite">{saveStatusLabel}</span>
                ) : null}
              </div>
            </div>
            <div className="setlist-header-actions resource-header-actions">
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--accent"
                onClick={() => void onCopyPublicLink()}
                title={rider.publicShareEnabled ? 'Copy public link' : 'Create & copy public link'}
              >
                <Link2 size={14} />
              </button>
              {canEdit ? (
                <>
                  {onDelete ? (
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--secondary"
                      onClick={() => void handleDeleteRider()}
                      title={`Delete rider ${rider.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>


        </div>
      ) : null}

      <section className="technical-rider-section">
        <div className="technical-rider-section-header">
          <h2>Technical Lines</h2>
        </div>

        <div className="technical-rider-table-wrap">
          <table className="technical-rider-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Description</th>
                {canEdit ? <th aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.id}>
                  <td>{index + 1}</td>
                  <td>
                    {canEdit ? (
                      <input
                        type="text"
                        value={line.name}
                        onChange={(event) => {
                          const name = event.target.value;
                          setLines((prev) => prev.map((entry) => (entry.id === line.id ? { ...entry, name } : entry)));
                        }}
                        placeholder="Input list"
                      />
                    ) : (
                      line.name || '-'
                    )}
                  </td>
                  <td>
                    {canEdit ? (
                      <input
                        type="text"
                        value={line.description}
                        onChange={(event) => {
                          const description = event.target.value;
                          setLines((prev) => prev.map((entry) => (entry.id === line.id ? { ...entry, description } : entry)));
                        }}
                        placeholder="Description"
                      />
                    ) : (
                      line.description || '-'
                    )}
                  </td>
                  {canEdit ? (
                    <td>
                      <button
                        type="button"
                        className="setlist-action-btn setlist-action-btn--secondary"
                        onClick={() => setLines((prev) => prev.filter((entry) => entry.id !== line.id))}
                        title="Delete row"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 4 : 3} className="technical-rider-empty-cell">No line items yet.</td>
                </tr>
              ) : null}
              {canEdit ? (
                <tr>
                  <td>
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--secondary"
                      onClick={() => setLines((prev) => [...prev, createLine()])}
                      title="Add row"
                    >
                      <Plus size={14} />
                    </button>
                  </td>
                  <td colSpan={3} />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <EquipmentTableEditor
        title="Preferred Equipment"
        items={preferredEquipment}
        canEdit={canEdit}
        onChange={setPreferredEquipment}
      />

      <EquipmentTableEditor
        title="We Bring (Inventory)"
        items={inventoryEquipment}
        canEdit={canEdit}
        onChange={setInventoryEquipment}
      />
    </>
  );
}

interface EquipmentTableEditorProps {
  title: string;
  items: RiderEquipmentItem[];
  canEdit: boolean;
  onChange: (items: RiderEquipmentItem[]) => void;
}

function EquipmentTableEditor({ title, items, canEdit, onChange }: EquipmentTableEditorProps) {
  return (
    <section className="technical-rider-section">
      <div className="technical-rider-section-header">
        <h2>{title}</h2>
      </div>

      <div className="technical-rider-table-wrap">
        <table className="technical-rider-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Description</th>
              {canEdit ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td>
                  {canEdit ? (
                    <input
                      type="text"
                      value={item.name}
                      onChange={(event) => {
                        const name = event.target.value;
                        onChange(items.map((entry) => (entry.id === item.id ? { ...entry, name } : entry)));
                      }}
                      placeholder="Equipment name"
                    />
                  ) : (
                    item.name || '-'
                  )}
                </td>
                <td>
                  {canEdit ? (
                    <input
                      type="text"
                      value={item.description ?? ''}
                      onChange={(event) => {
                        const description = event.target.value;
                        onChange(items.map((entry) => (entry.id === item.id ? { ...entry, description } : entry)));
                      }}
                      placeholder="Description"
                    />
                  ) : (
                    item.description || '-'
                  )}
                </td>
                {canEdit ? (
                  <td>
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--secondary"
                      onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}
                      title="Delete equipment"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 4 : 3} className="technical-rider-empty-cell">No equipment listed.</td>
              </tr>
            ) : null}
            {canEdit ? (
              <tr>
                <td>
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    onClick={() => onChange([...items, createEquipmentItem()])}
                    title="Add row"
                  >
                    <Plus size={14} />
                  </button>
                </td>
                <td colSpan={3} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
