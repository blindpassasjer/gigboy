import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clamp01 } from '../lib/songHandNotes';
import type { HandNoteStroke, SongHandNoteDocument } from '../types';

interface Props {
  visible: boolean;
  drawEnabled: boolean;
  notes: SongHandNoteDocument[];
  myStrokes: HandNoteStroke[];
  strokeColor?: string;
  strokeWidth?: number;
  onMyStrokesChange: (strokes: HandNoteStroke[], viewport: { width: number; height: number }) => void;
}

interface ActiveStrokeState {
  id: string;
  color: string;
  width: number;
  points: number[];
  createdAt: string;
}

interface TwoFingerScrollState {
  midY: number;
  scrollTop: number;
  el: HTMLElement;
}

/** Stroke paired with the rendering context needed for cross-device scaling. */
interface StrokeForRendering {
  stroke: HandNoteStroke | ActiveStrokeState;
  /** Width of the canvas when this stroke was saved. Used to scale strokeWidth proportionally. */
  savedViewportWidth: number;
  /** Height of the canvas when this stroke was saved. Used to convert v1 y-coords to v2-equivalent. */
  savedViewportHeight: number;
  /**
   * v2: both x and y are width-relative (y can exceed 1).
   * v1 / false: legacy — y is height-relative (y ∈ [0,1]).
   */
  isV2: boolean;
}

/**
 * Draw a single stroke onto `ctx`.
 *
 * @param currentWidth  CSS-pixel width of the canvas being drawn onto.
 * @param currentHeight CSS-pixel height of the canvas being drawn onto.
 * @param savedViewportWidth  Width at which the stroke was originally recorded.
 *   Used to scale strokeWidth so it looks proportionally the same on any screen.
 * @param isV2  When true, y coordinates are width-relative (same scale as x).
 *   When false (legacy), y coordinates are height-relative.
 */
function drawStroke(
  ctx: CanvasRenderingContext2D,
  { stroke, savedViewportWidth, savedViewportHeight, isV2 }: StrokeForRendering,
  currentWidth: number,
  currentHeight: number,
) {
  if (stroke.points.length < 2) return;

  // Notes without valid viewport data (savedViewportWidth <= 1) must not be
  // scaled — treating them as "drawn on a 1px canvas" would produce enormous
  // strokes.  Use widthScale = 1 so the raw stroke.width is rendered as-is.
  const hasValidViewport = savedViewportWidth > 1;
  const widthScale = hasValidViewport ? currentWidth / savedViewportWidth : 1;
  const lineWidth = Math.max(stroke.width * widthScale, 0.5);

  // Coordinate helpers:
  //   v2:              rx = nx * W,  ry = ny * W  (aspect-ratio preserved)
  //   v1 with viewport: convert y to v2-space via the saved aspect ratio so
  //                     shapes look the same on any screen size.
  //   v1 legacy (no valid viewport): fall back to mapping y onto canvas height.
  const rx = (nx: number) => nx * currentWidth;
  const ry = (ny: number) => {
    if (isV2) return ny * currentWidth;
    if (hasValidViewport) return (ny * savedViewportHeight / savedViewportWidth) * currentWidth;
    return ny * currentHeight;
  };

  // Show a visible dot as soon as the pointer touches down.
  if (stroke.points.length < 4) {
    const x = rx(stroke.points[0]);
    const y = ry(stroke.points[1]);
    const radius = Math.max(lineWidth * 0.8, 1.6);
    ctx.beginPath();
    ctx.fillStyle = stroke.color;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
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
  ctx.moveTo(rx(stroke.points[0]), ry(stroke.points[1]));
  for (let i = 2; i < stroke.points.length - 2; i += 2) {
    const cpX = rx(stroke.points[i]);
    const cpY = ry(stroke.points[i + 1]);
    const midX = (cpX + rx(stroke.points[i + 2])) / 2;
    const midY = (cpY + ry(stroke.points[i + 3])) / 2;
    ctx.quadraticCurveTo(cpX, cpY, midX, midY);
  }
  const n = stroke.points.length;
  ctx.lineTo(rx(stroke.points[n - 2]), ry(stroke.points[n - 1]));

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

export default function SongHandNotesOverlay({
  visible,
  drawEnabled,
  notes,
  myStrokes,
  strokeColor = '#22c55e',
  strokeWidth = 2.5,
  onMyStrokesChange,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const myStrokesRef = useRef<HandNoteStroke[]>(myStrokes);
  const activeStrokeRef = useRef<ActiveStrokeState | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const twoFingerScrollRef = useRef<TwoFingerScrollState | null>(null);
  const rafRef = useRef<number | null>(null);
  const allStrokesForRenderingRef = useRef<StrokeForRendering[]>([]);

  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenStrokesRef = useRef<StrokeForRendering[]>([]);
  const offscreenViewportRef = useRef({ width: 0, height: 0 });

  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const viewportRef = useRef({ width: 1, height: 1 });
  const [revision, setRevision] = useState(0);

  // Observe the overlay element itself (stageRef) so the measured viewport
  // always matches the element used for pointer-event coordinate normalisation.
  const syncViewportFromStage = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const width = Math.max(Math.round(rect.width), 1);
    const height = Math.max(Math.round(rect.height), 1);

    // Update ref immediately so rAF drawing in the same event-loop tick uses correct dimensions,
    // even before React re-renders with the new viewport state.
    viewportRef.current = { width, height };

    setViewport((current) => {
      if (current.width === width && current.height === height) return current;
      return { width, height };
    });
  }, []);

  useEffect(() => {
    myStrokesRef.current = myStrokes;
  }, [myStrokes]);

  /** All visible strokes wrapped with their rendering context. */
  const allStrokesForRendering = useMemo<StrokeForRendering[]>(() => {
    return notes.flatMap((note) =>
      note.strokes.map((stroke) => ({
        stroke,
        savedViewportWidth: note.viewport.width,
        savedViewportHeight: note.viewport.height,
        isV2: note.coordinateSystem === 'v2',
      }))
    );
  }, [notes]);

  useEffect(() => {
    allStrokesForRenderingRef.current = allStrokesForRendering;
  }, [allStrokesForRendering]);

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

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = viewport;
    const physW = Math.max(Math.floor(width * dpr), 1);
    const physH = Math.max(Math.floor(height * dpr), 1);

    canvas.width = physW;
    canvas.height = physH;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Rebuild the offscreen cache only when strokes or viewport actually changed,
    // not when only `revision` changed (e.g. active stroke start/end).
    if (
      offscreenStrokesRef.current !== allStrokesForRendering ||
      offscreenViewportRef.current.width !== width ||
      offscreenViewportRef.current.height !== height
    ) {
      offscreenStrokesRef.current = allStrokesForRendering;
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
        offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        offCtx.clearRect(0, 0, width, height);
        for (const strokeCtx of allStrokesForRendering) {
          drawStroke(offCtx, strokeCtx, width, height);
        }
      }
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const off = offscreenRef.current;
    if (off) ctx.drawImage(off, 0, 0);

    if (activeStrokeRef.current) {
      drawStroke(ctx, { stroke: activeStrokeRef.current, savedViewportWidth: width, savedViewportHeight: height, isV2: true }, width, height);
    }
  }, [allStrokesForRendering, viewport, revision]);

  /**
   * Normalise a pointer position into the v2 coordinate space:
   * x = clientX_relative / rect.width  ∈ [0, 1]
   * y = clientY_relative / rect.width  ∈ [0, rect.height/rect.width]
   *
   * Dividing y by WIDTH (not height) preserves the aspect ratio of any drawn shape
   * when the canvas is displayed on a screen with a different viewport size.
   */
  const pointFromPointerEvent = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return null;

    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const x = clamp01((event.clientX - rect.left) / rect.width);
    const y = Math.max(0, (event.clientY - rect.top) / rect.width);
    return { x, y };
  }, []);

  const finishStroke = useCallback(() => {
    const active = activeStrokeRef.current;
    activeStrokeRef.current = null;
    pointerIdRef.current = null;
    setRevision((prev) => prev + 1);

    if (!active || active.points.length < 4) return;

    const finalizedStroke: HandNoteStroke = {
      id: active.id,
      color: active.color,
      width: active.width,
      points: active.points,
      createdAt: active.createdAt,
    };

    onMyStrokesChange([...myStrokesRef.current, finalizedStroke], viewport);
  }, [onMyStrokesChange, viewport]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawEnabled) return;

    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // Second finger: cancel any in-progress stroke and switch to two-finger scroll mode.
    if (activePointersRef.current.size >= 2) {
      if (activeStrokeRef.current) {
        activeStrokeRef.current = null;
        pointerIdRef.current = null;
        setRevision((prev) => prev + 1);
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

    const point = pointFromPointerEvent(event);
    if (!point) return;

    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);

    activeStrokeRef.current = {
      id: crypto.randomUUID(),
      color: strokeColor,
      width: strokeWidth,
      points: [point.x, point.y],
      createdAt: new Date().toISOString(),
    };

    setRevision((prev) => prev + 1);
  }, [drawEnabled, pointFromPointerEvent, strokeColor, strokeWidth, syncViewportFromStage]);

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

    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // Coalesced events capture all touch samples batched between frames
    const raw = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const events: PointerEvent[] = raw.length > 0 ? raw : [event.nativeEvent];

    let added = false;
    for (const ce of events) {
      // v2: both x and y divided by width to preserve aspect ratio.
      const px = clamp01((ce.clientX - rect.left) / rect.width);
      const py = Math.max(0, (ce.clientY - rect.top) / rect.width);

      const total = active.points.length;
      const lastX = active.points[total - 2];
      const lastY = active.points[total - 1];
      const dx = px - lastX;
      const dy = py - lastY;
      if (dx * dx + dy * dy < 0.0025 * 0.0025) continue;

      active.points.push(px, py);
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
      if (!canvas || !ctx) return;

      const { width, height } = viewportRef.current;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Blit cached strokes — O(1) instead of O(n strokes)
      const off = offscreenRef.current;
      if (off) ctx.drawImage(off, 0, 0);

      if (activeStrokeRef.current) {
        drawStroke(ctx, { stroke: activeStrokeRef.current, savedViewportWidth: width, savedViewportHeight: height, isV2: true }, width, height);
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
    const point = pointFromPointerEvent(event);
    if (active && point) {
      const total = active.points.length;
      const lastX = active.points[total - 2];
      const lastY = active.points[total - 1];
      if (lastX !== point.x || lastY !== point.y) {
        active.points.push(point.x, point.y);
      }
    }

    event.preventDefault();
    finishStroke();
  }, [drawEnabled, finishStroke, pointFromPointerEvent]);

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);

    if (activePointersRef.current.size === 0) {
      twoFingerScrollRef.current = null;
    }

    if (pointerIdRef.current !== event.pointerId) return;
    // Discard: system interrupted the gesture, not the user's intention to commit
    activeStrokeRef.current = null;
    pointerIdRef.current = null;
    setRevision((prev) => prev + 1);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

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
