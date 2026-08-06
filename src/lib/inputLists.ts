import type { InputList, StageplotItem, SongHandNoteDocument } from '../types';

function normalizeStageplotItem(raw: unknown): StageplotItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.id !== 'string') return null;
  return {
    id: data.id,
    kind: typeof data.kind === 'string' ? data.kind : 'custom',
    label: typeof data.label === 'string' ? data.label : 'Item',
    x: typeof data.x === 'number' && Number.isFinite(data.x) ? data.x : 0.5,
    y: typeof data.y === 'number' && Number.isFinite(data.y) ? data.y : 0.5,
    rotation: typeof data.rotation === 'number' && Number.isFinite(data.rotation)
      ? ((data.rotation % 360) + 360) % 360
      : 0,
    color: typeof data.color === 'string' ? data.color : undefined,
    channel: typeof data.channel === 'string' ? data.channel : undefined,
    description: typeof data.description === 'string' ? data.description : undefined,
    stand: typeof data.stand === 'string' ? data.stand : undefined,
    noChannel: data.noChannel === true ? true : undefined,
  };
}

function normalizeDrawingLayer(raw: unknown): SongHandNoteDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.authorUid !== 'string') return null;
  const viewportRaw = data.viewport && typeof data.viewport === 'object'
    ? (data.viewport as Record<string, unknown>)
    : {};
  return {
    authorUid: data.authorUid,
    authorName: typeof data.authorName === 'string' ? data.authorName : null,
    authorAvatar: typeof data.authorAvatar === 'string' ? data.authorAvatar : null,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    viewport: {
      width: typeof viewportRaw.width === 'number' && viewportRaw.width > 0 ? viewportRaw.width : 1,
      height: typeof viewportRaw.height === 'number' && viewportRaw.height > 0 ? viewportRaw.height : 1,
    },
    strokes: Array.isArray(data.strokes) ? (data.strokes as SongHandNoteDocument['strokes']) : [],
  };
}

function compareBySortOrderThenName<T extends { sortOrder?: number; name?: string }>(a: T, b: T) {
  const aSortOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bSortOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;

  if (aSortOrder !== bSortOrder) {
    return aSortOrder - bSortOrder;
  }

  return (a.name ?? '').localeCompare(b.name ?? '');
}

export function normalizeInputList(id: string, raw: Record<string, unknown>): InputList {
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : 'Untitled rider',
    icon: typeof raw.icon === 'string' ? raw.icon : undefined,
    items: Array.isArray(raw.items)
      ? raw.items.map(normalizeStageplotItem).filter((entry): entry is StageplotItem => Boolean(entry))
      : [],
    drawingLayers: Array.isArray(raw.drawingLayers)
      ? raw.drawingLayers.map(normalizeDrawingLayer).filter((entry): entry is SongHandNoteDocument => Boolean(entry))
      : [],
    hospitalityNotes: typeof raw.hospitalityNotes === 'string' ? raw.hospitalityNotes : undefined,
    publicShareEnabled: raw.publicShareEnabled === true ? true : undefined,
    bandName: typeof raw.bandName === 'string' ? raw.bandName : undefined,
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : undefined,
    collaboratorIds: Array.isArray(raw.collaboratorIds)
      ? raw.collaboratorIds.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    collaborationPermissions:
      typeof raw.collaborationPermissions === 'object' && raw.collaborationPermissions !== null
        ? Object.fromEntries(
            Object.entries(raw.collaborationPermissions as Record<string, unknown>).filter(
              ([, permission]) => permission === 'viewer' || permission === 'editor'
            )
          ) as InputList['collaborationPermissions']
        : undefined,
    accessRole: 'owner',
  };
}

export function sortInputLists(riders: InputList[]) {
  return [...riders].sort(compareBySortOrderThenName);
}

export function withSequentialInputListSortOrder(riders: InputList[]) {
  return riders.map((rider, index) => ({ ...rider, sortOrder: index }));
}
