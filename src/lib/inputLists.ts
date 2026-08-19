import type { InputList } from '../types';

function compareBySortOrderThenName<T extends { sortOrder?: number; name?: string }>(a: T, b: T) {
  const aSortOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bSortOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;

  if (aSortOrder !== bSortOrder) {
    return aSortOrder - bSortOrder;
  }

  return (a.name ?? '').localeCompare(b.name ?? '');
}

export function sortInputLists(riders: InputList[]) {
  return [...riders].sort(compareBySortOrderThenName);
}

export function withSequentialInputListSortOrder(riders: InputList[]) {
  return riders.map((rider, index) => ({ ...rider, sortOrder: index }));
}
