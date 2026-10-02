import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Play, Repeat, Square } from 'lucide-react';
import { playStrum, stopPlayback } from '../lib/midiPlayer';
import { guitarVoicing, parseStrumLines, slotLabels, type StrumBar, type StrumSlot } from '../utils/strumParser';
import { parseBeatsPerBar } from '../utils/metronome';
import { transposeChord } from '../utils/chordParser';

interface Props {
  /** One line per bar, as stored between {start_of_strum} and {end_of_strum}. */
  strumLines: string[];
  label?: string;
  /** Chords from the song, offered as the chord the pattern is played over. */
  chords?: string[];
  transpose?: number;
  bpm?: number;
  timeSignature?: string;
  showPlayback?: boolean;
  onEdit?: () => void;
}

const DEFAULT_BPM = 100;

function strokeGlyph(slot: StrumSlot): string {
  if (!slot.stroke) return '';
  if (slot.muted) return '×';
  return slot.stroke === 'D' ? '↓' : '↑';
}

function slotClass(slot: StrumSlot, active: boolean): string {
  return [
    'strum-slot',
    slot.stroke ? `strum-slot--${slot.stroke === 'D' ? 'down' : 'up'}` : 'strum-slot--rest',
    slot.accent ? 'strum-slot--accent' : '',
    slot.muted ? 'strum-slot--muted' : '',
    active ? 'strum-slot--active' : '',
  ].filter(Boolean).join(' ');
}

/** Read-only grid of strum arrows for one bar, with the count (1 & 2 & …) underneath. */
export function StrumBarGrid({
  bar,
  beatsPerBar,
  activeSlot,
}: {
  bar: StrumBar;
  beatsPerBar: number;
  activeSlot?: number | null;
}) {
  const labels = slotLabels(bar.length, beatsPerBar);
  return (
    <div className="strum-bar" style={{ gridTemplateColumns: `repeat(${bar.length}, minmax(1.6rem, 1fr))` }}>
      {bar.map((slot, i) => (
        <div key={i} className="strum-cell">
          <span className={slotClass(slot, activeSlot === i)}>{strokeGlyph(slot)}</span>
          <span className={`strum-count${/^\d+$/.test(labels[i]) ? ' strum-count--beat' : ''}`}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function StrumDisplay({
  strumLines,
  label,
  chords = [],
  transpose = 0,
  bpm = DEFAULT_BPM,
  timeSignature,
  showPlayback = true,
  onEdit,
}: Props) {
  const bars = useMemo(() => parseStrumLines(strumLines).bars, [strumLines]);
  const beatsPerBar = useMemo(() => parseBeatsPerBar(timeSignature), [timeSignature]);

  // Chords are shown/played at the song's current transposition. Playback applies the
  // transposition to the chord name, so the voicing (and its fingering) matches the diagrams.
  const options = useMemo(
    () => Array.from(new Set(chords.map((c) => transposeChord(c, transpose)))).filter((c) => guitarVoicing(c)),
    [chords, transpose],
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const chord = chosen && options.includes(chosen) ? chosen : options[0] ?? 'C';

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [active, setActive] = useState<{ bar: number; slot: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    stopPlayback();
    clearTimer();
    setIsPlaying(false);
    setActive(null);
  }, [clearTimer]);

  const start = useCallback(async (loop: boolean) => {
    const frets = guitarVoicing(chord);
    if (!frets) return;
    clearTimer();
    setIsPlaying(true);
    const durationMs = await playStrum({
      bars,
      frets,
      bpm,
      beatsPerBar,
      loop,
      onSlot: (bar, slot) => setActive({ bar, slot }),
    });
    if (durationMs === 0) {
      setIsPlaying(false);
      return;
    }
    if (!loop) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setIsPlaying(false);
        setActive(null);
      }, durationMs);
    }
  }, [bars, beatsPerBar, bpm, chord, clearTimer]);

  // Stop on unmount so a pattern doesn't keep playing after navigating away.
  useEffect(() => () => { stopPlayback(); clearTimer(); }, [clearTimer]);

  function handlePlay() {
    if (isPlaying) {
      stop();
      return;
    }
    void start(isLooping);
  }

  function toggleLoop() {
    const next = !isLooping;
    setIsLooping(next);
    // The loop flag is baked in when playback starts, so restart to apply it.
    if (isPlaying) void start(next);
  }

  return (
    <div className="strum-block">
      {label && <div className="strum-label">{label}</div>}
      <div className="strum-bars">
        {bars.map((bar, i) => (
          <StrumBarGrid
            key={i}
            bar={bar}
            beatsPerBar={beatsPerBar}
            activeSlot={active?.bar === i ? active.slot : null}
          />
        ))}
        {bars.length === 0 && <div className="strum-empty">Empty strumming pattern</div>}
      </div>
      {showPlayback && bars.length > 0 && (
        <div className="tab-playback-controls strum-controls">
          <button
            type="button"
            className={`tab-play-btn${isPlaying ? ' tab-play-btn--playing' : ''}`}
            onClick={handlePlay}
            title={isPlaying ? 'Stop playback' : `Play pattern on ${chord}`}
          >
            {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            {isPlaying ? 'Stop' : 'Play'}
          </button>
          <select
            className="strum-chord-select"
            value={chord}
            onChange={(e) => {
              setChosen(e.target.value);
              if (isPlaying) stop();
            }}
            aria-label="Chord to play the pattern on"
          >
            {(options.length > 0 ? options : ['C']).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            type="button"
            className={`tab-loop-btn${isLooping ? ' tab-loop-btn--active' : ''}`}
            onClick={toggleLoop}
            title={isLooping ? 'Disable loop' : 'Enable loop'}
          >
            <Repeat size={12} />
          </button>
          {onEdit && (
            <button type="button" className="tab-edit-btn" onClick={onEdit} title="Edit strumming pattern">
              <Pencil size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
