import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';

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
  const baseBpm = typeof tempo === 'number' && Number.isFinite(tempo) && tempo > 0
    ? Math.round(tempo)
    : null;
  const [bpm, setBpm] = useState<number>(baseBpm ?? 80);
  const beatsPerBar = useMemo(() => parseBeatsPerBar(timeSignature), [timeSignature]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeBeat, setActiveBeat] = useState(0);
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
  }, [baseBpm]);

  useEffect(() => {
    setActiveBeat(0);
  }, [bpm, beatsPerBar]);

  useEffect(() => {
    if (!isRunning) return;

    const intervalMs = Math.max(80, Math.round(60000 / bpm));
    const intervalId = window.setInterval(() => {
      setActiveBeat((previous) => {
        const next = (previous + 1) % beatsPerBar;
        playClick(next === 0);
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, beatsPerBar, isRunning, soundEnabled]);

  const playState = isRunning ? 'running' : 'paused';

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
