/**
 * Move an element identified by `id` in an array so it appears immediately before
 * the element identified by `beforeId`. If `beforeId` is null, the element is
 * moved to the end. Returns the original array when no valid target is found.
 */
export function moveBeforeId<T>(
  items: T[],
  getId: (item: T) => string,
  id: string,
  beforeId: string | null,
): T[] {
  const currentIndex = items.findIndex((item) => getId(item) === id);
  if (currentIndex < 0) return items;

  const next = [...items];
  const [moving] = next.splice(currentIndex, 1);
  if (!moving) return items;

  if (beforeId === null) {
    next.push(moving);
    return next;
  }

  const targetIndex = next.findIndex((item) => getId(item) === beforeId);
  if (targetIndex < 0) return items;

  next.splice(targetIndex, 0, moving);
  return next;
}

/**
 * Move a string ID within an array of IDs so it appears immediately before
 * `beforeId`. If `beforeId` is null, the ID is moved to the end.
 */
export function moveIdBefore(
  ids: string[],
  id: string,
  beforeId: string | null,
): string[] {
  const currentIndex = ids.indexOf(id);
  if (currentIndex < 0) return ids;

  const next = [...ids];
  next.splice(currentIndex, 1);

  if (beforeId === null) {
    next.push(id);
    return next;
  }

  const targetIndex = next.indexOf(beforeId);
  if (targetIndex < 0) return ids;

  next.splice(targetIndex, 0, id);
  return next;
}
