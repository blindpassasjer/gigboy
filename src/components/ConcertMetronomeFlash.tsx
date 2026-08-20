import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseBeatsPerBar } from '../utils/metronome';

interface Props {
  tempo?: number;
  timeSignature?: string;
}

/**
 * Ambient, silent beat indicator for Concert Mode: flashes the screen edge on
 * every beat of the current song's tempo, brighter on the downbeat. Runs
 * automatically whenever a tempo is set — no play/pause, no sound, no UI.
 */
export default function ConcertMetronomeFlash({ tempo, timeSignature }: Props) {
  const bpm = typeof tempo === 'number' && Number.isFinite(tempo) && tempo > 0
    ? Math.round(tempo)
    : null;
  const beatsPerBar = useMemo(() => parseBeatsPerBar(timeSignature), [timeSignature]);
  const [activeBeat, setActiveBeat] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setActiveBeat(0);
  }, [bpm, beatsPerBar]);

  useEffect(() => {
    if (!bpm) return;
    const intervalMs = Math.max(80, Math.round(60000 / bpm));
    const intervalId = window.setInterval(() => {
      setActiveBeat((previous) => (previous + 1) % beatsPerBar);
      setTick((t) => t + 1);
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [bpm, beatsPerBar]);

  if (!bpm) return null;

  return createPortal(
    <span
      key={tick}
      className={`concert-metronome-flash${activeBeat === 0 ? ' is-downbeat' : ''}`}
      aria-hidden="true"
    />,
    document.body
  );
}
