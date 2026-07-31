import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { anchorFromClientPoint, findContentStage, lineIdAtClientY, pointFromAnchor, resolveLineRects } from '../lib/lineAnchor';
import type { LyricNoteStroke, LineAnchor, LyricNoteDocument } from '../types';

interface Props {
  visible: boolean;
  drawEnabled: boolean;
  notes: LyricNoteDocument[];
  myStrokes: LyricNoteStroke[];
  strokeColor?: string;
  strokeWidth?: number;
  onMyStrokesChange: (strokes: LyricNoteStroke[]) => void;
  /**
   * Called with the line id as soon as a stroke starts on it (and with `null` once the
   * stroke ends), so the parent can pin that line to single-row layout for the gesture's
   * duration — see the doc comment on `anchorFromClientPoint`.
   */
  onActiveLineChange?: (lineId: number | null) => void;
}

interface ActiveStrokeState {
  id: string;
  color: string;
  width: number;
  points: LineAnchor[];
  createdAt: string;
}

interface TwoFingerScrollState {
  midY: number;
  scrollTop: number;
  el: HTMLElement;
}

/**
 * Draws a single stroke onto `ctx`, resolving each point's line anchor to a pixel position
 * against the current (freshly measured) line rects — this is what keeps the stroke pinned
 * to its lyric line across reflow/resize instead of drifting with raw stage coordinates.
 */
function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: LyricNoteStroke | ActiveStrokeState,
  lineRects: Map<number, DOMRect>,
) {
  const pts = stroke.points
    .map((p) => pointFromAnchor(lineRects, p))
    .filter((p): p is { x: number; y: number } => p !== null);

  if (pts.length === 0) return;

  const lineWidth = Math.max(stroke.width, 0.5);

  if (pts.length === 1) {
    const radius = Math.max(lineWidth * 0.8, 1.6);
    ctx.beginPath();
    ctx.fillStyle = stroke.color;
    ctx.arc(pts[0].x, pts[0].y, radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = lineWidth;
  // Subtle glow helps strokes stand out on mixed lyric/chord backgrounds.
  ctx.shadowColor = stroke.color;
  ctx.shadowBlur = Math.max(lineWidth * 0.75, 1);

  // Quadratic bezier through midpoints for smooth handwriting curves.
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const cpX = pts[i].x;
    const cpY = pts[i].y;
    const midX = (cpX + pts[i + 1].x) / 2;
    const midY = (cpY + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(cpX, cpY, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);

  ctx.stroke();
  ctx.shadowBlur = 0;
}

function findScrollContainer(el: HTMLElement): HTMLElement {
  let current: HTMLElement | null = el.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return current;
    current = current.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

export default function LyricHandNotesOverlay({
  visible,
  drawEnabled,
  notes,
  myStrokes,
  strokeColor = '#22c55e',
  strokeWidth = 2.5,
  onMyStrokesChange,
  onActiveLineChange,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const myStrokesRef = useRef<LyricNoteStroke[]>(myStrokes);
  const activeStrokeRef = useRef<ActiveStrokeState | null>(null);
  const lastActivePointRef = useRef<{ x: number; y: number } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const twoFingerScrollRef = useRef<TwoFingerScrollState | null>(null);
  const rafRef = useRef<number | null>(null);

  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenStrokesRef = useRef<LyricNoteStroke[]>([]);
  const offscreenViewportRef = useRef({ width: 0, height: 0 });

  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const viewportRef = useRef({ width: 1, height: 1 });
  const [revision, setRevision] = useState(0);

  // Observe the overlay element itself (stageRef) so the measured viewport
  // always matches the element used for canvas sizing.
  const syncViewportFromStage = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const width = Math.max(Math.round(rect.width), 1);
    const height = Math.max(Math.round(rect.height), 1);

    viewportRef.current = { width, height };

    setViewport((current) => {
      if (current.width === width && current.height === height) return current;
      return { width, height };
    });
  }, []);

  useEffect(() => {
    myStrokesRef.current = myStrokes;
  }, [myStrokes]);

  const allStrokes = useMemo<LyricNoteStroke[]>(
    () => notes.flatMap((note) => note.strokes),
    [notes],
  );

  useEffect(() => {
    syncViewportFromStage();

    const element = stageRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(Math.round(entry.contentRect.width), 1);
      const height = Math.max(Math.round(entry.contentRect.height), 1);
      viewportRef.current = { width, height };
      setViewport((current) => {
        if (current.width === width && current.height === height) return current;
        return { width, height };
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [syncViewportFromStage]);

  useEffect(() => {
    if (!visible) return;

    // The song surface height can settle one or two frames after mount.
    const raf1 = window.requestAnimationFrame(() => {
      syncViewportFromStage();
    });
    const raf2 = window.requestAnimationFrame(() => {
      syncViewportFromStage();
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [visible, notes, syncViewportFromStage]);

  useEffect(() => {
    if (!visible) return;

    const handleWindowResize = () => syncViewportFromStage();
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [visible, syncViewportFromStage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const contentStage = findContentStage(stageRef.current);
    if (!contentStage) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = viewport;
    const physW = Math.max(Math.floor(width * dpr), 1);
    const physH = Math.max(Math.floor(height * dpr), 1);

    canvas.width = physW;
    canvas.height = physH;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Rebuild the offscreen cache only when strokes or viewport actually changed,
    // not when only `revision` changed (e.g. active stroke start/end) — but always
    // rebuild on viewport change since line rects (and therefore stroke positions) shift.
    if (
      offscreenStrokesRef.current !== allStrokes ||
      offscreenViewportRef.current.width !== width ||
      offscreenViewportRef.current.height !== height
    ) {
      offscreenStrokesRef.current = allStrokes;
      offscreenViewportRef.current = { width, height };

      let off = offscreenRef.current;
      if (!off || off.width !== physW || off.height !== physH) {
        off = document.createElement('canvas');
        off.width = physW;
        off.height = physH;
        offscreenRef.current = off;
      }
      const offCtx = off.getContext('2d');
      if (offCtx) {
        const lineRects = resolveLineRects(contentStage);
        offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        offCtx.clearRect(0, 0, width, height);
        for (const stroke of allStrokes) {
          drawStroke(offCtx, stroke, lineRects);
        }
      }
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const off = offscreenRef.current;
    if (off) {
      // The offscreen canvas was drawn in physical pixels (via setTransform(dpr,...)).
      // Reset to identity so drawImage copies at 1:1 physical pixels, avoiding an
      // accidental second DPR upscale from the current transform.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(off, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    if (activeStrokeRef.current) {
      const lineRects = resolveLineRects(contentStage);
      drawStroke(ctx, activeStrokeRef.current, lineRects);
    }
  }, [allStrokes, viewport, revision]);

  const anchorFromPointerEvent = useCallback((event: React.PointerEvent<HTMLDivElement>): LineAnchor | null => {
    const contentStage = findContentStage(stageRef.current);
    if (!contentStage) return null;
    return anchorFromClientPoint(contentStage, event.clientX, event.clientY);
  }, []);

  const finishStroke = useCallback(() => {
    const active = activeStrokeRef.current;
    activeStrokeRef.current = null;
    pointerIdRef.current = null;
    lastActivePointRef.current = null;
    setRevision((prev) => prev + 1);

    if (!active || active.points.length < 2) {
      onActiveLineChange?.(null);
      return;
    }

    const finalizedStroke: LyricNoteStroke = {
      id: active.id,
      color: active.color,
      width: active.width,
      points: active.points,
      createdAt: active.createdAt,
    };

    onMyStrokesChange([...myStrokesRef.current, finalizedStroke]);
    onActiveLineChange?.(null);
  }, [onMyStrokesChange, onActiveLineChange]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawEnabled) return;

    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // Second finger: cancel any in-progress stroke and switch to two-finger scroll mode.
    if (activePointersRef.current.size >= 2) {
      if (activeStrokeRef.current) {
        activeStrokeRef.current = null;
        pointerIdRef.current = null;
        lastActivePointRef.current = null;
        setRevision((prev) => prev + 1);
        onActiveLineChange?.(null);
      }
      if (!twoFingerScrollRef.current && stageRef.current) {
        const points = [...activePointersRef.current.values()];
        const midY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
        const el = findScrollContainer(stageRef.current);
        twoFingerScrollRef.current = { midY, scrollTop: el.scrollTop, el };
      }
      return;
    }

    // Single finger: start drawing.
    if (pointerIdRef.current !== null) return;

    // Ensure first stroke frame renders with real stage size instead of fallback 1x1.
    syncViewportFromStage();

    // Pin the touched line to single-row layout *before* measuring its rect, so the anchor
    // captured below matches the geometry the note will be replayed against later (see
    // anchorFromClientPoint's doc comment). onActiveLineChange is expected to flush this
    // synchronously so the DOM has already reflowed by the time we call anchorFromPointerEvent.
    const contentStage = findContentStage(stageRef.current);
    if (contentStage) {
      const lineId = lineIdAtClientY(contentStage, event.clientY);
      if (lineId !== null) onActiveLineChange?.(lineId);
    }

    const anchor = anchorFromPointerEvent(event);
    if (!anchor) return;

    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);

    activeStrokeRef.current = {
      id: crypto.randomUUID(),
      color: strokeColor,
      width: strokeWidth,
      points: [anchor],
      createdAt: new Date().toISOString(),
    };
    lastActivePointRef.current = { x: event.clientX, y: event.clientY };

    setRevision((prev) => prev + 1);
  }, [drawEnabled, anchorFromPointerEvent, onActiveLineChange, strokeColor, strokeWidth, syncViewportFromStage]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawEnabled) return;

    // Keep tracked position current for all active pointers.
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    // Two-finger scroll: move the scroll container by the midpoint delta.
    if (twoFingerScrollRef.current && activePointersRef.current.size >= 2) {
      const points = [...activePointersRef.current.values()];
      const midY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      const { midY: startMidY, scrollTop, el } = twoFingerScrollRef.current;
      el.scrollTop = scrollTop + (startMidY - midY);
      return;
    }

    if (pointerIdRef.current !== event.pointerId) return;

    const active = activeStrokeRef.current;
    if (!active) return;

    const contentStage = findContentStage(stageRef.current);
    if (!contentStage) return;

    // Coalesced events capture all touch samples batched between frames
    const raw = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const events: PointerEvent[] = raw.length > 0 ? raw : [event.nativeEvent];

    let added = false;
    for (const ce of events) {
      const last = lastActivePointRef.current;
      if (last) {
        const dx = ce.clientX - last.x;
        const dy = ce.clientY - last.y;
        if (dx * dx + dy * dy < 4) continue; // require ~2px of movement in screen space
      }

      const anchor = anchorFromClientPoint(contentStage, ce.clientX, ce.clientY);
      if (!anchor) continue;

      active.points.push(anchor);
      lastActivePointRef.current = { x: ce.clientX, y: ce.clientY };
      added = true;
    }

    if (!added) return;

    // Redraw via rAF using the same bezier drawStroke used for finalized strokes,
    // so the live stroke looks identical to the committed result (no jagged-to-smooth jump).
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const stage = findContentStage(stageRef.current);
      if (!canvas || !ctx || !stage) return;

      const { width, height } = viewportRef.current;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Blit cached strokes — O(1) instead of O(n strokes)
      const off = offscreenRef.current;
      if (off) ctx.drawImage(off, 0, 0, width, height);

      if (activeStrokeRef.current) {
        const lineRects = resolveLineRects(stage);
        drawStroke(ctx, activeStrokeRef.current, lineRects);
      }
    });
  }, [drawEnabled]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);

    // Clear scroll state once all fingers are lifted.
    if (activePointersRef.current.size === 0) {
      twoFingerScrollRef.current = null;
    }

    if (!drawEnabled) return;
    if (pointerIdRef.current !== event.pointerId) return;

    const active = activeStrokeRef.current;
    const anchor = anchorFromPointerEvent(event);
    if (active && anchor) {
      active.points.push(anchor);
    }

    event.preventDefault();
    finishStroke();
  }, [drawEnabled, finishStroke, anchorFromPointerEvent]);

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);

    if (activePointersRef.current.size === 0) {
      twoFingerScrollRef.current = null;
    }

    if (pointerIdRef.current !== event.pointerId) return;
    // Discard: system interrupted the gesture, not the user's intention to commit
    activeStrokeRef.current = null;
    pointerIdRef.current = null;
    lastActivePointRef.current = null;
    setRevision((prev) => prev + 1);
    onActiveLineChange?.(null);
  }, [onActiveLineChange]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // Discard any in-progress gesture when draw mode is turned off (e.g. switching
  // to Type) — otherwise pointerIdRef/activeStrokeRef stay stuck on the interrupted
  // stroke and swallow the first touch the next time Draw is re-enabled.
  useEffect(() => {
    if (drawEnabled) return;
    activePointersRef.current.clear();
    twoFingerScrollRef.current = null;
    const hadActiveStroke = activeStrokeRef.current !== null;
    activeStrokeRef.current = null;
    pointerIdRef.current = null;
    lastActivePointRef.current = null;
    if (hadActiveStroke) {
      setRevision((prev) => prev + 1);
      onActiveLineChange?.(null);
    }
  }, [drawEnabled, onActiveLineChange]);

  if (!visible) return null;

  return (
    <div
      ref={stageRef}
      className={`song-hand-notes-overlay${drawEnabled ? ' song-hand-notes-overlay--drawing' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <canvas ref={canvasRef} className="song-hand-notes-canvas" />
    </div>
  );
}
