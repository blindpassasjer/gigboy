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

function drawStroke(ctx: CanvasRenderingContext2D, stroke: HandNoteStroke | ActiveStrokeState, width: number, height: number) {
  if (stroke.points.length < 2) return;

  // Show a visible dot as soon as the pointer touches down.
  if (stroke.points.length < 4) {
    const x = stroke.points[0] * width;
    const y = stroke.points[1] * height;
    const radius = Math.max(stroke.width * 0.8, 1.6);

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
  ctx.lineWidth = stroke.width;
  // Subtle glow helps strokes stand out on mixed lyric/chord backgrounds.
  ctx.shadowColor = stroke.color;
  ctx.shadowBlur = Math.max(stroke.width * 0.75, 1);

  // Quadratic bezier through midpoints for smooth handwriting curves
  ctx.moveTo(stroke.points[0] * width, stroke.points[1] * height);
  for (let i = 2; i < stroke.points.length - 2; i += 2) {
    const cpX = stroke.points[i] * width;
    const cpY = stroke.points[i + 1] * height;
    const midX = (cpX + stroke.points[i + 2] * width) / 2;
    const midY = (cpY + stroke.points[i + 3] * height) / 2;
    ctx.quadraticCurveTo(cpX, cpY, midX, midY);
  }
  const n = stroke.points.length;
  ctx.lineTo(stroke.points[n - 2] * width, stroke.points[n - 1] * height);

  ctx.stroke();
  ctx.shadowBlur = 0;
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

  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const viewportRef = useRef({ width: 1, height: 1 });
  const [revision, setRevision] = useState(0);

  const measureTarget = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    return stage.parentElement ?? stage;
  }, []);

  const syncViewportFromStage = useCallback(() => {
    const target = measureTarget();
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const width = Math.max(Math.round(rect.width), 1);
    const height = Math.max(Math.round(rect.height), 1);

    setViewport((current) => {
      if (current.width === width && current.height === height) return current;
      const next = { width, height };
      viewportRef.current = next;
      return next;
    });
  }, [measureTarget]);

  useEffect(() => {
    myStrokesRef.current = myStrokes;
  }, [myStrokes]);

  const allVisibleStrokes = useMemo(() => {
    return notes.flatMap((note) => note.strokes);
  }, [notes]);

  useEffect(() => {
    syncViewportFromStage();

    const element = measureTarget();
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(Math.round(entry.contentRect.width), 1);
      const height = Math.max(Math.round(entry.contentRect.height), 1);
      setViewport((current) => {
        if (current.width === width && current.height === height) return current;
        const next = { width, height };
        viewportRef.current = next;
        return next;
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [measureTarget, syncViewportFromStage]);

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
    canvas.width = Math.max(Math.floor(viewport.width * dpr), 1);
    canvas.height = Math.max(Math.floor(viewport.height * dpr), 1);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.width, viewport.height);

    for (const stroke of allVisibleStrokes) {
      drawStroke(ctx, stroke, viewport.width, viewport.height);
    }

    if (activeStrokeRef.current) {
      drawStroke(ctx, activeStrokeRef.current, viewport.width, viewport.height);
    }
  }, [allVisibleStrokes, viewport, revision]);

  const pointFromPointerEvent = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return null;

    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const x = clamp01((event.clientX - rect.left) / rect.width);
    const y = clamp01((event.clientY - rect.top) / rect.height);
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
    if (pointerIdRef.current !== event.pointerId) return;

    const active = activeStrokeRef.current;
    if (!active) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const { width, height } = viewportRef.current;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Coalesced events capture all touch samples batched between frames
    const raw = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const events: PointerEvent[] = raw.length > 0 ? raw : [event.nativeEvent];

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = active.color;
    ctx.lineWidth = active.width;
    ctx.shadowColor = active.color;
    ctx.shadowBlur = Math.max(active.width * 0.75, 1);

    for (const ce of events) {
      const px = clamp01((ce.clientX - rect.left) / rect.width);
      const py = clamp01((ce.clientY - rect.top) / rect.height);

      const total = active.points.length;
      const lastX = active.points[total - 2];
      const lastY = active.points[total - 1];
      const dx = px - lastX;
      const dy = py - lastY;
      if (dx * dx + dy * dy < 0.0025 * 0.0025) continue;

      const x1 = lastX * width;
      const y1 = lastY * height;
      const x2 = px * width;
      const y2 = py * height;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      active.points.push(px, py);
    }

    ctx.shadowBlur = 0;
  }, [drawEnabled]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
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
    if (pointerIdRef.current !== event.pointerId) return;
    // Discard: system interrupted the gesture, not the user's intention to commit
    activeStrokeRef.current = null;
    pointerIdRef.current = null;
    setRevision((prev) => prev + 1);
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
