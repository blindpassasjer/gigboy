import { useEffect, useMemo, useState } from 'react';
import { Link2, Plus, Trash2, PenLine } from 'lucide-react';
import type { RiderEquipmentItem, TechnicalRider, TechnicalRiderLine } from '../types';
import { showConfirmToast } from '../utils/toastDialogs';

interface Props {
  rider: TechnicalRider;
  canEdit: boolean;
  onRename: (name: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onSaveContent: (params: {
    lines: TechnicalRiderLine[];
    preferredEquipment: RiderEquipmentItem[];
    inventoryEquipment: RiderEquipmentItem[];
  }) => Promise<void> | void;
  onCopyPublicLink: () => Promise<void> | void;
}

function createLine(): TechnicalRiderLine {
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

export default function TechnicalRiderEditor({
  rider,
  canEdit,
  onRename,
  onDelete,
  onSaveContent,
  onCopyPublicLink,
}: Props) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(rider.name);
  const [lines, setLines] = useState<TechnicalRiderLine[]>(rider.lines);
  const [preferredEquipment, setPreferredEquipment] = useState<RiderEquipmentItem[]>(rider.preferredEquipment);
  const [inventoryEquipment, setInventoryEquipment] = useState<RiderEquipmentItem[]>(rider.inventoryEquipment);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRenameValue(rider.name);
    setLines(rider.lines);
    setPreferredEquipment(rider.preferredEquipment);
    setInventoryEquipment(rider.inventoryEquipment);
  }, [rider]);

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

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    await onSaveContent({ lines, preferredEquipment, inventoryEquipment });
    setSaving(false);
  };

  const handleDeleteRider = async () => {
    if (!onDelete) return;
    const confirmed = await showConfirmToast(`Move rider "${rider.name}" to trash?`, {
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;
    await onDelete();
  };

  return (
    <section className="setlist-view technical-rider-view">
      <div className="song-list-sticky">
        <div className="setlist-header songlist-header">
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
                <h1 className="song-list-heading setlist-title">{rider.name}</h1>
                {canEdit ? (
                  <button type="button" className="title-rename-btn" onClick={() => setIsRenaming(true)} title="Rename rider">
                    <PenLine size={14} />
                  </button>
                ) : null}
              </div>
            )}
            <p className="song-list-summary setlist-song-count">
              {lines.length} line{lines.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="setlist-header-actions">
            <button
              type="button"
              className={`setlist-action-btn setlist-action-btn--secondary${rider.publicShareEnabled ? ' setlist-action-btn--active' : ''}`}
              onClick={() => void onCopyPublicLink()}
              title={rider.publicShareEnabled ? 'Copy public link' : 'Create & copy public link'}
            >
              <Link2 size={14} />
            </button>
            {canEdit ? (
              <>
                <button
                  type="button"
                  className="setlist-action-btn"
                  onClick={() => void handleSave()}
                  disabled={!hasChanges || saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
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

      <section className="technical-rider-section">
        <div className="technical-rider-section-header">
          <h2>Technical Lines</h2>
          {canEdit ? (
            <button type="button" className="setlist-action-btn setlist-action-btn--secondary" onClick={() => setLines((prev) => [...prev, createLine()])}>
              <Plus size={14} />
            </button>
          ) : null}
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
            </tbody>
          </table>
        </div>
      </section>

      <EquipmentListEditor
        title="Preferred Equipment"
        items={preferredEquipment}
        canEdit={canEdit}
        onChange={setPreferredEquipment}
      />

      <EquipmentListEditor
        title="We Bring (Inventory)"
        items={inventoryEquipment}
        canEdit={canEdit}
        onChange={setInventoryEquipment}
      />
    </section>
  );
}

interface EquipmentListEditorProps {
  title: string;
  items: RiderEquipmentItem[];
  canEdit: boolean;
  onChange: (items: RiderEquipmentItem[]) => void;
}

function EquipmentListEditor({ title, items, canEdit, onChange }: EquipmentListEditorProps) {
  return (
    <section className="technical-rider-section">
      <div className="technical-rider-section-header">
        <h2>{title}</h2>
        {canEdit ? (
          <button type="button" className="setlist-action-btn setlist-action-btn--secondary" onClick={() => onChange([...items, createEquipmentItem()])}>
            <Plus size={14} />
          </button>
        ) : null}
      </div>
      <ul className="technical-rider-equipment-list">
        {items.map((item) => (
          <li key={item.id} className="technical-rider-equipment-item">
            {canEdit ? (
              <>
                <input
                  type="text"
                  value={item.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    onChange(items.map((entry) => (entry.id === item.id ? { ...entry, name } : entry)));
                  }}
                  placeholder="Equipment name"
                />
                <input
                  type="text"
                  value={item.description ?? ''}
                  onChange={(event) => {
                    const description = event.target.value;
                    onChange(items.map((entry) => (entry.id === item.id ? { ...entry, description } : entry)));
                  }}
                  placeholder="Description"
                />
                <button
                  type="button"
                  className="setlist-action-btn setlist-action-btn--secondary"
                  onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}
                  title="Delete equipment"
                >
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <>
                <strong>{item.name}</strong>
                {item.description ? <span>{item.description}</span> : null}
              </>
            )}
          </li>
        ))}
        {items.length === 0 ? <li className="technical-rider-empty">No equipment listed.</li> : null}
      </ul>
    </section>
  );
}
