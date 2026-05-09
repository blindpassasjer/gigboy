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

  ctx.moveTo(stroke.points[0] * width, stroke.points[1] * height);

  for (let index = 2; index < stroke.points.length; index += 2) {
    ctx.lineTo(stroke.points[index] * width, stroke.points[index + 1] * height);
  }

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
      return { width, height };
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
        return { width, height };
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

    const point = pointFromPointerEvent(event);
    if (!point) return;

    const total = active.points.length;
    const lastX = active.points[total - 2];
    const lastY = active.points[total - 1];
    const dx = point.x - lastX;
    const dy = point.y - lastY;
    const minDistance = 0.0025;

    if ((dx * dx) + (dy * dy) < (minDistance * minDistance)) return;

    active.points.push(point.x, point.y);
    setRevision((prev) => prev + 1);
  }, [drawEnabled, pointFromPointerEvent]);

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
    event.preventDefault();
    finishStroke();
  }, [finishStroke]);

  if (!visible) return null;

  return (
    <div
      ref={stageRef}
      className={`song-hand-notes-overlay${drawEnabled ? ' song-hand-notes-overlay--drawing' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerUp}
    >
      <canvas ref={canvasRef} className="song-hand-notes-canvas" />
    </div>
  );
}
