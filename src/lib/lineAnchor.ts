import type { LineAnchor, LyricNoteDocument } from '../types';

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Rect of each positionable line, relative to `stage`'s own box (not the viewport). */
export function resolveLineRects(stage: HTMLElement): Map<number, DOMRect> {
  const stageRect = stage.getBoundingClientRect();
  const map = new Map<number, DOMRect>();
  stage.querySelectorAll<HTMLElement>('[data-line-id]').forEach((el) => {
    const id = Number(el.dataset.lineId);
    if (!Number.isFinite(id)) return;
    const r = el.getBoundingClientRect();
    map.set(id, new DOMRect(r.left - stageRect.left, r.top - stageRect.top, r.width, r.height));
  });
  return map;
}

/** Finds the content stage (the element carrying the `[data-line-id]` lines) for an overlay element. */
export function findContentStage(overlayEl: HTMLElement | null): HTMLElement | null {
  return overlayEl?.closest('.song-notes-stage') ?? null;
}

/**
 * Resolves a viewport point to a line-relative anchor by finding the positionable line whose
 * vertical range contains the point (falling back to the nearest line by vertical distance).
 * The resulting fx/fy are NOT clamped — a free-hand point can land outside the line's own
 * box (above/below/beside its text) and still be reproduced exactly on reflow, since the
 * line→page mapping is a simple linear scale from the line's rect.
 */
export function anchorFromClientPoint(
  stage: HTMLElement,
  clientX: number,
  clientY: number,
): LineAnchor | null {
  const lineEls = Array.from(stage.querySelectorAll<HTMLElement>('[data-line-id]'));
  if (lineEls.length === 0) return null;

  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const el of lineEls) {
    const r = el.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom) {
      best = el;
      bestDist = 0;
      break;
    }
    const centerY = (r.top + r.bottom) / 2;
    const dist = Math.abs(clientY - centerY);
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  }
  if (!best) return null;

  const lineId = Number(best.dataset.lineId);
  if (!Number.isFinite(lineId)) return null;

  const r = best.getBoundingClientRect();
  const width = Math.max(r.width, 1);
  const height = Math.max(r.height, 1);
  return {
    lineId,
    fx: (clientX - r.left) / width,
    fy: (clientY - r.top) / height,
  };
}

/**
 * Resolves a stored anchor back to a point relative to the stage's own box, using the line
 * rects captured by `resolveLineRects`. Falls back to the nearest surviving line id if the
 * original line was removed from the song (e.g. after an edit).
 */
export function pointFromAnchor(
  rects: Map<number, DOMRect>,
  anchor: LineAnchor,
): { x: number; y: number } | null {
  let r = rects.get(anchor.lineId);
  if (!r && rects.size > 0) {
    let closestId = anchor.lineId;
    let bestDiff = Infinity;
    for (const id of rects.keys()) {
      const diff = Math.abs(id - anchor.lineId);
      if (diff < bestDiff) {
        bestDiff = diff;
        closestId = id;
      }
    }
    r = rects.get(closestId);
  }
  if (!r) return null;
  return { x: r.x + anchor.fx * r.width, y: r.y + anchor.fy * r.height };
}

/** Line ids that have at least one note anchored somewhere on them. */
export function extractPinnedLineIds(notes: LyricNoteDocument[]): Set<number> {
  const ids = new Set<number>();
  for (const note of notes) {
    for (const stroke of note.strokes) {
      for (const point of stroke.points) {
        ids.add(point.lineId);
      }
    }
    for (const textNote of note.textNotes ?? []) {
      ids.add(textNote.lineId);
    }
  }
  return ids;
}
