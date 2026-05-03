import { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, PenLine, Plus, Smile, Trash2, Undo2, X } from 'lucide-react';
import type { HandNoteStroke, SongHandNoteDocument, Stageplot, StageplotItem } from '../types';
import SongHandNotesOverlay from './SongHandNotesOverlay';
import { showConfirmToast } from '../utils/toastDialogs';
import { stageplotIconForKind } from '../lib/stageplotIcons';

interface StageplotEditorProps {
  stageplot: Stageplot;
  canEdit: boolean;
  currentUser: {
    id: string | null;
    name: string;
    avatar?: string | null;
  };
  onRename: (name: string) => void;
  onUpdateIcon: (icon?: string) => void;
  onDelete: () => Promise<void>;
  onSaveContent: (items: StageplotItem[], drawingLayers: SongHandNoteDocument[]) => Promise<void>;
  onCopyPublicLink: () => Promise<void>;
}

const ITEM_DRAG_MIME = 'application/x-folio-stageplot-item-template';
const EMOJI_OPTIONS = ['🎤', '🎸', '🎹', '🥁', '🎷', '🎺', '🪕', '🔊', '📦', '✨'] as const;

const DEFAULT_PALETTE = [
  { kind: 'vocals', label: 'Vocals', color: '#f97316' },
  { kind: 'guitar', label: 'Guitar', color: '#22c55e' },
  { kind: 'bass', label: 'Bass', color: '#0ea5e9' },
  { kind: 'drums', label: 'Drums', color: '#ef4444' },
  { kind: 'keys', label: 'Keys', color: '#a855f7' },
  { kind: 'monitor', label: 'Monitor', color: '#f59e0b' },
  { kind: 'amp', label: 'Amp', color: '#14b8a6' },
] as const;

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeEmojiIcon(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return [...trimmed].slice(0, 2).join('');
}

function userLayerFrom(layers: SongHandNoteDocument[], userId: string | null) {
  if (!userId) return null;
  return layers.find((layer) => layer.authorUid === userId) ?? null;
}

function upsertLayer(layers: SongHandNoteDocument[], nextLayer: SongHandNoteDocument) {
  return [
    nextLayer,
    ...layers.filter((layer) => layer.authorUid !== nextLayer.authorUid),
  ];
}

export default function StageplotEditor({
  stageplot,
  canEdit,
  currentUser,
  onRename,
  onUpdateIcon,
  onDelete,
  onSaveContent,
  onCopyPublicLink,
}: StageplotEditorProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<StageplotItem[]>(stageplot.items);
  const [drawingLayers, setDrawingLayers] = useState<SongHandNoteDocument[]>(stageplot.drawingLayers ?? []);
  const [drawEnabled, setDrawEnabled] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [renameValue, setRenameValue] = useState(stageplot.name);
  const [renaming, setRenaming] = useState(false);
  const [iconDraft, setIconDraft] = useState(stageplot.icon ?? '🎤');
  const [showIconEditor, setShowIconEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<HandNoteStroke[][]>([]);

  useEffect(() => {
    setItems(stageplot.items);
    setDrawingLayers(stageplot.drawingLayers ?? []);
    setRenameValue(stageplot.name);
    setIconDraft(stageplot.icon ?? '🎤');
  }, [stageplot]);

  const myLayer = useMemo(() => userLayerFrom(drawingLayers, currentUser.id), [currentUser.id, drawingLayers]);
  const myStrokes = myLayer?.strokes ?? [];

  const persistContent = async (nextItems: StageplotItem[], nextLayers: SongHandNoteDocument[]) => {
    setSaving(true);
    await onSaveContent(nextItems, nextLayers);
    setSaving(false);
  };

  const makeItem = (template: { kind: string; label: string; color: string }, x: number, y: number): StageplotItem => ({
    id: crypto.randomUUID(),
    kind: template.kind,
    label: template.label,
    color: template.color,
    x,
    y,
  });

  const addItemAtPosition = (template: { kind: string; label: string; color: string }, x: number, y: number) => {
    const item = makeItem(template, x, y);
    const nextItems = [...items, item];
    setItems(nextItems);
    void persistContent(nextItems, drawingLayers);
  };

  const handlePaletteDragStart = (event: React.DragEvent<HTMLButtonElement>, template: { kind: string; label: string; color: string }) => {
    // If drawing mode is active, the drawing overlay can intercept drag/drop.
    // Disable it as soon as the user starts dragging a template.
    setDrawEnabled(false);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(ITEM_DRAG_MIME, JSON.stringify(template));
    event.dataTransfer.setData('text/plain', template.label);
  };

  const handlePaletteAddClick = (template: { kind: string; label: string; color: string }) => {
    if (!canEdit) return;
    addItemAtPosition(template, 0.5, 0.5);
  };

  const handleStageDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    const raw = event.dataTransfer.getData(ITEM_DRAG_MIME);
    if (!raw) return;

    event.preventDefault();

    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    try {
      const template = JSON.parse(raw) as { kind?: unknown; label?: unknown; color?: unknown };
      if (typeof template.kind !== 'string' || typeof template.label !== 'string') return;
      addItemAtPosition(
        {
          kind: template.kind,
          label: template.label,
          color: typeof template.color === 'string' ? template.color : '#6b7280',
        },
        clamp01((event.clientX - rect.left) / rect.width),
        clamp01((event.clientY - rect.top) / rect.height)
      );
    } catch {
      // Ignore malformed drag payloads.
    }
  };

  const moveItem = (itemId: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (!canEdit || drawEnabled) return;

    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const pointerId = event.pointerId;
    const target = event.currentTarget;
    target.setPointerCapture(pointerId);

    let latestItems = items;

    const move = (moveEvent: PointerEvent) => {
      setItems((prev) => {
        const next = prev.map((item) => (
        item.id === itemId
          ? {
              ...item,
              x: clamp01((moveEvent.clientX - rect.left) / rect.width),
              y: clamp01((moveEvent.clientY - rect.top) / rect.height),
            }
          : item
        ));
        latestItems = next;
        return next;
      });
    };

    const release = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', release);
      target.removeEventListener('pointercancel', release);
      void persistContent(latestItems, drawingLayers);
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', release, { once: true });
    target.addEventListener('pointercancel', release, { once: true });
  };

  const addCustomItem = () => {
    if (!canEdit) return;
    const label = customLabel.trim();
    if (!label) return;

    const nextItems = [
      ...items,
      {
        id: crypto.randomUUID(),
        kind: 'custom',
        label,
        color: '#6b7280',
        x: 0.5,
        y: 0.5,
      },
    ];

    setCustomLabel('');
    setItems(nextItems);
    void persistContent(nextItems, drawingLayers);
  };

  const removeSelectedItem = () => {
    if (!selectedItemId || !canEdit) return;
    const deletingId = selectedItemId;
    setItems((prev) => {
      const nextItems = prev.filter((item) => item.id !== deletingId);
      void persistContent(nextItems, drawingLayers);
      return nextItems;
    });
    setSelectedItemId(null);
  };

  useEffect(() => {
    if (!canEdit || !selectedItemId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      event.preventDefault();
      const nextItems = items.filter((item) => item.id !== selectedItemId);
      setItems(nextItems);
      setSelectedItemId(null);
      void persistContent(nextItems, drawingLayers);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canEdit, selectedItemId, items, drawingLayers]);

  const handleRenameCommit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== stageplot.name) {
      onRename(trimmed);
    }
    setRenameValue(stageplot.name);
    setRenaming(false);
  };

  const handleStrokesChange = (strokes: HandNoteStroke[], viewport: { width: number; height: number }) => {
    if (!currentUser.id) return;

    setUndoStack((prev) => [...prev, myStrokes]);

    const nextLayer: SongHandNoteDocument = {
      authorUid: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar ?? null,
      updatedAt: new Date().toISOString(),
      viewport,
      strokes,
    };

    const nextLayers = upsertLayer(drawingLayers, nextLayer);

    setDrawingLayers(nextLayers);
    void persistContent(items, nextLayers);
  };

  const handleUndoStroke = () => {
    if (!currentUser.id) return;
    if (undoStack.length === 0) return;

    const nextUndoStack = undoStack.slice(0, undoStack.length - 1);
    const lastStrokes = undoStack[undoStack.length - 1] ?? [];
    const viewportRect = stageRef.current?.getBoundingClientRect();
    const nextLayer: SongHandNoteDocument = {
      authorUid: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar ?? null,
      updatedAt: new Date().toISOString(),
      viewport: {
        width: viewportRect?.width ?? 1,
        height: viewportRect?.height ?? 1,
      },
      strokes: lastStrokes,
    };

    const nextLayers = upsertLayer(drawingLayers, nextLayer);
    setUndoStack(nextUndoStack);
    setDrawingLayers(nextLayers);
    void persistContent(items, nextLayers);
  };

  const handleClearMyDrawing = () => {
    if (!currentUser.id) return;
    if (myStrokes.length === 0) return;

    const viewportRect = stageRef.current?.getBoundingClientRect();
    const nextLayer: SongHandNoteDocument = {
      authorUid: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar ?? null,
      updatedAt: new Date().toISOString(),
      viewport: {
        width: viewportRect?.width ?? 1,
        height: viewportRect?.height ?? 1,
      },
      strokes: [],
    };

    const nextLayers = upsertLayer(drawingLayers, nextLayer);
    setUndoStack((prev) => [...prev, myStrokes]);
    setDrawingLayers(nextLayers);
    void persistContent(items, nextLayers);
  };

  const handleDeleteStageplot = async () => {
    const confirmed = await showConfirmToast(`Move stageplot "${stageplot.name}" to trash?`, {
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;
    await onDelete();
  };

  return (
    <section className="stageplot-view">
      <div className="song-list-sticky">
        <div className="setlist-header songlist-header stageplot-header">
          <div className="setlist-title-block">
            {renaming ? (
              <input
                type="text"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleRenameCommit();
                  if (event.key === 'Escape') {
                    setRenameValue(stageplot.name);
                    setRenaming(false);
                  }
                }}
                onBlur={handleRenameCommit}
                className="setlist-name-input"
              />
            ) : (
              <div className="song-list-title-row">
                <h1 className="song-list-heading setlist-title" onDoubleClick={() => canEdit && setRenaming(true)}>
                  {stageplot.icon ? <span className="song-list-heading-icon" aria-hidden="true">{stageplot.icon}</span> : null}
                  {stageplot.name}
                </h1>
                {canEdit ? (
                  <button type="button" className="title-rename-btn" onClick={() => setRenaming(true)} title="Rename stageplot">
                    <PenLine size={14} />
                  </button>
                ) : null}
              </div>
            )}
            <p className="song-list-summary setlist-song-count">
              {items.length} item{items.length === 1 ? '' : 's'}{saving ? ' • Saving…' : ''}
            </p>
          </div>
          <div className="setlist-header-actions">
            <button
              type="button"
              className={`setlist-action-btn setlist-action-btn--secondary${stageplot.publicShareEnabled ? ' setlist-action-btn--active' : ''}`}
              onClick={() => void onCopyPublicLink()}
              title={stageplot.publicShareEnabled ? 'Copy public link' : 'Create & copy public link'}
            >
              <Link2 size={14} />
            </button>
            {canEdit ? (
              <>
                <button
                  type="button"
                  className="setlist-action-btn setlist-action-btn--secondary"
                  onClick={() => setShowIconEditor((value) => !value)}
                  title="Set stageplot icon"
                >
                  <Smile size={14} />
                </button>
                <button
                  type="button"
                  className="setlist-action-btn setlist-action-btn--secondary"
                  onClick={() => void handleDeleteStageplot()}
                  title={`Delete stageplot ${stageplot.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </>
            ) : null}
          </div>
          {canEdit ? (
            <div className="stageplot-toolbar">
              <div className="stageplot-palette">
                {DEFAULT_PALETTE.map((entry) => (
                  <button
                    key={entry.kind}
                    type="button"
                    className="stageplot-palette-btn"
                    draggable
                    onDragStart={(event) => handlePaletteDragStart(event, entry)}
                    onClick={() => handlePaletteAddClick(entry)}
                    title={`Drag ${entry.label} to stage`}
                  >
                    <img
                      src={stageplotIconForKind(entry.kind)}
                      alt=""
                      aria-hidden="true"
                      className="stageplot-instrument-icon stageplot-instrument-icon--palette"
                    />
                    <span>{entry.label}</span>
                  </button>
                ))}
              </div>
              <div className="stageplot-toolbar-actions">
                <input
                  type="text"
                  value={customLabel}
                  onChange={(event) => setCustomLabel(event.target.value)}
                  placeholder="Custom item"
                  className="setlist-name-input"
                />
                <button type="button" className="notes-toolbar-btn" onClick={addCustomItem}>
                  <Plus size={12} /> Add
                </button>
                <button
                  type="button"
                  className={`notes-toolbar-btn${drawEnabled ? ' setlist-action-btn--active' : ''}`}
                  onClick={() => setDrawEnabled((prev) => !prev)}
                >
                  <PenLine size={12} /> Draw
                </button>
                <button type="button" className="notes-toolbar-btn" onClick={handleUndoStroke} disabled={undoStack.length === 0}>
                  <Undo2 size={12} /> Undo
                </button>
                <button type="button" className="notes-toolbar-btn" onClick={handleClearMyDrawing}>
                  <X size={12} /> Clear
                </button>
                <button type="button" className="notes-toolbar-btn" onClick={removeSelectedItem} disabled={!selectedItemId}>
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {showIconEditor && canEdit ? (
          <div className="list-appearance-editor" role="region" aria-label="Stageplot icon settings">
            <div className="list-appearance-group">
              <span className="list-appearance-label">Emoji</span>
              <div className="emoji-choice-grid" role="listbox" aria-label="Stageplot emoji options">
                {EMOJI_OPTIONS.map((emoji) => {
                  const selected = iconDraft === emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      className={`emoji-choice-btn${selected ? ' active' : ''}`}
                      onClick={() => setIconDraft(emoji)}
                      aria-pressed={selected}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              className="setlist-action-btn"
              onClick={() => {
                onUpdateIcon(normalizeEmojiIcon(iconDraft));
                setShowIconEditor(false);
              }}
            >
              Save
            </button>
            <button type="button" className="setlist-action-btn setlist-action-btn--secondary" onClick={() => setShowIconEditor(false)}>
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={stageRef}
        className="stageplot-stage song-notes-stage"
        onDragOver={(event) => {
          if (!canEdit) return;
          if (!event.dataTransfer.types.includes(ITEM_DRAG_MIME)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={handleStageDrop}
      >
        <div className="stageplot-stage-grid" />
        <div className="stageplot-front-edge" aria-hidden="true" />
        <div className="stageplot-audience-marker" aria-label="Audience-facing side">
          Audience
        </div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`stageplot-item${selectedItemId === item.id ? ' stageplot-item--selected' : ''}`}
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              borderColor: item.color ?? 'var(--border)',
              color: item.color ?? 'var(--text)',
            }}
            onPointerDown={(event) => {
              setSelectedItemId(item.id);
              moveItem(item.id, event);
            }}
            onClick={() => setSelectedItemId(item.id)}
            title={drawEnabled ? 'Disable drawing to move items' : item.label}
          >
            <img
              src={stageplotIconForKind(item.kind)}
              alt=""
              aria-hidden="true"
              className="stageplot-instrument-icon stageplot-instrument-icon--item"
            />
            <span>{item.label}</span>
          </button>
        ))}

        <SongHandNotesOverlay
          visible
          drawEnabled={canEdit && drawEnabled}
          notes={drawingLayers}
          myStrokes={myStrokes}
          onMyStrokesChange={handleStrokesChange}
          strokeColor="#fb7185"
          strokeWidth={2.6}
        />
      </div>
    </section>
  );
}
