import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX, Plus, Minus } from 'lucide-react';

interface Props {
  tempo?: number;
  timeSignature?: string;
  className?: string;
  /** When provided, syncs the metronome start/stop to external playback */
  isPlaying?: boolean;
}

function parseBeatsPerBar(timeSignature?: string): number {
  if (!timeSignature) return 4;
  const match = timeSignature.trim().match(/^(\d+)\s*\/\s*\d+$/);
  if (!match) return 4;
  const numerator = Number.parseInt(match[1], 10);
  if (!Number.isFinite(numerator) || numerator < 1) return 4;
  return Math.min(numerator, 12);
}

export default function VisualMetronome({ tempo, timeSignature, className = '', isPlaying }: Props) {
  const baseBpm = typeof tempo === 'number' && Number.isFinite(tempo) && tempo > 0
    ? Math.round(tempo)
    : null;
  // BPM is managed locally and never persisted to song data.
  // Tempo overrides are session-only and reset when the song changes.
  const [bpm, setBpm] = useState<number>(baseBpm ?? 80);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(bpm));
  const editInputRef = useRef<HTMLInputElement>(null);
  const beatsPerBar = useMemo(() => parseBeatsPerBar(timeSignature), [timeSignature]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeBeat, setActiveBeat] = useState(0);
  const [tick, setTick] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  function playClick(isDownbeat: boolean) {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = isDownbeat ? 1000 : 800;
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.06);
    } catch {
      // AudioContext may be unavailable in some environments
    }
  }

  useEffect(() => {
    if (!baseBpm) return;
    setBpm(baseBpm);
    setEditValue(String(baseBpm));
  }, [baseBpm]);

  useEffect(() => {
    setActiveBeat(0);
  }, [bpm, beatsPerBar]);

  useEffect(() => {
    return () => {
      void audioCtxRef.current?.close();
    };
  }, []);

  // Sync to external playback: start/stop and reset beat on play
  useEffect(() => {
    if (isPlaying === undefined) return;
    if (isPlaying) {
      setActiveBeat(0);
      setIsRunning(true);
    } else {
      setIsRunning(false);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isRunning) return;

    const intervalMs = Math.max(80, Math.round(60000 / bpm));
    const intervalId = window.setInterval(() => {
      setActiveBeat((previous) => {
        const next = (previous + 1) % beatsPerBar;
        playClick(next === 0);
        return next;
      });
      setTick((t) => t + 1);
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, beatsPerBar, isRunning, soundEnabled]);

  const handleTempoClick = () => {
    setIsEditing(true);
    setEditValue(String(bpm));
  };

  const handleTempoCommit = () => {
    const parsed = Number.parseInt(editValue, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 300) {
      setBpm(Math.round(parsed));
    }
    setIsEditing(false);
  };

  const handleTempoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTempoCommit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleTempoIncrement = (delta: number) => {
    const newBpm = Math.max(30, Math.min(300, bpm + delta));
    setBpm(newBpm);
  };

  return (
    <div className={`visual-metronome ${className}`.trim()}>
      <button
        type="button"
        className="visual-metronome-toggle"
        onClick={() => setIsRunning((value) => !value)}
        aria-label={isRunning ? 'Pause visual metronome' : 'Start visual metronome'}
        title={isRunning ? 'Pause metronome' : 'Start metronome'}
      >
        {isRunning ? <Pause size={14} /> : <Play size={14} />}
      </button>

      <button
        type="button"
        className={`visual-metronome-sound${soundEnabled ? ' is-active' : ''}`}
        onClick={() => setSoundEnabled((v) => !v)}
        aria-label={soundEnabled ? 'Disable metronome sound' : 'Enable metronome sound'}
        title={soundEnabled ? 'Sound on' : 'Sound off'}
      >
        {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
      </button>

      <div className="visual-metronome-readout">
        <span
          key={isRunning ? tick : 'idle'}
          className={`visual-metronome-light${isRunning ? ' is-running' : ''}${isRunning && activeBeat === 0 ? ' is-downbeat' : ''}`}
          aria-hidden="true"
        />
        <div className="visual-metronome-tempo-controls">
          <button
            type="button"
            className="visual-metronome-tempo-btn"
            onClick={() => handleTempoIncrement(-1)}
            title="Decrease tempo by 1 BPM"
            aria-label="Decrease tempo"
          >
            <Minus size={12} />
          </button>
          {isEditing ? (
            <input
              ref={editInputRef}
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleTempoCommit}
              onKeyDown={handleTempoKeyDown}
              autoFocus
              className="visual-metronome-tempo-input"
              min="30"
              max="300"
            />
          ) : (
            <button
              type="button"
              className="visual-metronome-tempo-display"
              onClick={handleTempoClick}
              title="Click to change tempo"
              aria-label="Edit tempo"
            >
              ♩ {bpm} bpm
            </button>
          )}
          <button
            type="button"
            className="visual-metronome-tempo-btn"
            onClick={() => handleTempoIncrement(1)}
            title="Increase tempo by 1 BPM"
            aria-label="Increase tempo"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      <div className="visual-metronome-beats" aria-hidden="true">
        {Array.from({ length: beatsPerBar }).map((_, index) => (
          <span
            key={`${beatsPerBar}-${index}`}
            className={`visual-metronome-beat${index === activeBeat ? ' is-active' : ''}${index === 0 ? ' is-downbeat' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}
