import type { RiderEquipmentItem, InputList, InputListLine } from '../types';

function normalizeLine(raw: unknown): InputListLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.id !== 'string') return null;

  return {
    id: data.id,
    name: typeof data.name === 'string' ? data.name : 'Line',
    description: typeof data.description === 'string' ? data.description : '',
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
  };
}

function normalizeEquipmentItem(raw: unknown): RiderEquipmentItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.id !== 'string') return null;

  return {
    id: data.id,
    name: typeof data.name === 'string' ? data.name : 'Item',
    description: typeof data.description === 'string' ? data.description : undefined,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
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

function withSequentialSortOrder<T extends { sortOrder?: number }>(entries: T[]) {
  return entries.map((entry, index) => ({ ...entry, sortOrder: index }));
}

export function normalizeInputList(id: string, raw: Record<string, unknown>): InputList {
  const linesRaw = Array.isArray(raw.lines) ? raw.lines : [];
  const preferredRaw = Array.isArray(raw.preferredEquipment) ? raw.preferredEquipment : [];
  const inventoryRaw = Array.isArray(raw.inventoryEquipment) ? raw.inventoryEquipment : [];

  const lines = withSequentialSortOrder(
    linesRaw
      .map(normalizeLine)
      .filter((entry): entry is InputListLine => Boolean(entry))
      .sort(compareBySortOrderThenName)
  );

  const preferredEquipment = withSequentialSortOrder(
    preferredRaw
      .map(normalizeEquipmentItem)
      .filter((entry): entry is RiderEquipmentItem => Boolean(entry))
      .sort(compareBySortOrderThenName)
  );

  const inventoryEquipment = withSequentialSortOrder(
    inventoryRaw
      .map(normalizeEquipmentItem)
      .filter((entry): entry is RiderEquipmentItem => Boolean(entry))
      .sort(compareBySortOrderThenName)
  );

  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : 'Untitled rider',
    icon: typeof raw.icon === 'string' ? raw.icon : undefined,
    lines,
    preferredEquipment,
    inventoryEquipment,
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

export function withSequentialRiderLineSortOrder(lines: InputListLine[]) {
  return withSequentialSortOrder(lines);
}

export function withSequentialRiderEquipmentSortOrder(items: RiderEquipmentItem[]) {
  return withSequentialSortOrder(items);
}
