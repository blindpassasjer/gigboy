import { useEffect, useMemo, useState } from 'react';
import { Pause, Play } from 'lucide-react';

interface Props {
  tempo?: number;
  timeSignature?: string;
  className?: string;
}

function parseBeatsPerBar(timeSignature?: string): number {
  if (!timeSignature) return 4;
  const match = timeSignature.trim().match(/^(\d+)\s*\/\s*\d+$/);
  if (!match) return 4;
  const numerator = Number.parseInt(match[1], 10);
  if (!Number.isFinite(numerator) || numerator < 1) return 4;
  return Math.min(numerator, 12);
}

export default function VisualMetronome({ tempo, timeSignature, className = '' }: Props) {
  const bpm = typeof tempo === 'number' && Number.isFinite(tempo) && tempo > 0
    ? Math.round(tempo)
    : null;
  const beatsPerBar = useMemo(() => parseBeatsPerBar(timeSignature), [timeSignature]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeBeat, setActiveBeat] = useState(0);

  useEffect(() => {
    setActiveBeat(0);
  }, [bpm, beatsPerBar]);

  useEffect(() => {
    if (!bpm || !isRunning) return;

    const intervalMs = Math.max(80, Math.round(60000 / bpm));
    const intervalId = window.setInterval(() => {
      setActiveBeat((previous) => (previous + 1) % beatsPerBar);
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [bpm, beatsPerBar, isRunning]);

  useEffect(() => {
    if (bpm) return;
    setIsRunning(false);
  }, [bpm]);

  if (!bpm) return null;

  const playState = isRunning ? 'running' : 'paused';

  return (
    <div className={`visual-metronome ${className}`.trim()}>
      <button
        type="button"
        className="visual-metronome-toggle"
        onClick={() => setIsRunning((value) => !value)}
        aria-label={isRunning ? 'Pause visual metronome' : 'Start visual metronome'}
      >
        {isRunning ? <Pause size={14} /> : <Play size={14} />}
        {isRunning ? 'Pause' : 'Start'}
      </button>

      <div className="visual-metronome-readout">
        <span
          className={`visual-metronome-light${isRunning ? ' is-running' : ''}`}
          style={{
            animationDuration: `${Math.max(80, Math.round(60000 / bpm))}ms`,
            animationPlayState: playState,
          }}
          aria-hidden="true"
        />
        <span className="visual-metronome-tempo">♩ {bpm} bpm</span>
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
