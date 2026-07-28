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
