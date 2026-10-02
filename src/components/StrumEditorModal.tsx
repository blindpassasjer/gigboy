import { useEffect, useRef, useState } from 'react';
import { Minus, Play, Plus, Square, X } from 'lucide-react';
import { playStrum, stopPlayback } from '../lib/midiPlayer';
import {
  REST_SLOT,
  guitarVoicing,
  parseStrumBar,
  slotLabels,
  type StrumBar,
  type StrumBlock,
  type StrumSlot,
} from '../utils/strumParser';
import { parseBeatsPerBar } from '../utils/metronome';

interface Props {
  /** Existing block when editing; omitted when inserting a new one. */
  initial?: StrumBlock;
  /** Chords from the song, offered as the chord to preview the pattern on. */
  chords?: string[];
  tempo?: number;
  timeSignature?: string;
  onInsert: (block: StrumBlock) => void;
  onClose: () => void;
}

const MAX_BARS = 4;
const SLOT_OPTIONS = [4, 6, 8, 12, 16];
const DEFAULT_CHORDS = ['C', 'G', 'Am', 'F', 'D', 'Em'];

const PRESETS: { name: string; bar: string }[] = [
  { name: 'Folk', bar: 'D . D U . U D U' },
  { name: 'Pop', bar: 'D . D U . U D U' },
  { name: 'Down-up', bar: 'D U D U D U D U' },
  { name: 'Quarter downs', bar: 'D . D . D . D .' },
  { name: 'Reggae', bar: '. . Dx . . . Dx .' },
  { name: 'Ballad', bar: 'D . . U . U D U' },
  { name: 'Waltz (3/4)', bar: 'D . D U D U' },
];

/** Tap order: rest → down → up → accented down → accented up → muted → rest. */
const CYCLE: StrumSlot[] = [
  REST_SLOT,
  { stroke: 'D', accent: false, muted: false },
  { stroke: 'U', accent: false, muted: false },
  { stroke: 'D', accent: true, muted: false },
  { stroke: 'U', accent: true, muted: false },
  { stroke: 'D', accent: false, muted: true },
];

function sameSlot(a: StrumSlot, b: StrumSlot): boolean {
  return a.stroke === b.stroke && a.accent === b.accent && a.muted === b.muted;
}

function nextSlot(slot: StrumSlot): StrumSlot {
  const idx = CYCLE.findIndex((c) => sameSlot(c, slot));
  return { ...CYCLE[(idx + 1) % CYCLE.length] };
}

function glyph(slot: StrumSlot): string {
  if (!slot.stroke) return '·';
  if (slot.muted) return '×';
  return slot.stroke === 'D' ? '↓' : '↑';
}

function emptyBar(count: number): StrumBar {
  return Array.from({ length: count }, () => ({ ...REST_SLOT }));
}

/** Fits a bar to a new slot count, keeping the leading slots. */
function resizeBar(bar: StrumBar, count: number): StrumBar {
  return Array.from({ length: count }, (_, i) => (bar[i] ? { ...bar[i] } : { ...REST_SLOT }));
}

export default function StrumEditorModal({ initial, chords = [], tempo, timeSignature, onInsert, onClose }: Props) {
  const beatsPerBar = parseBeatsPerBar(timeSignature);
  const isEditing = !!initial;
  const [label, setLabel] = useState(initial?.label ?? '');
  const [slotCount, setSlotCount] = useState(initial?.bars[0]?.length ?? beatsPerBar * 2);
  const [bars, setBars] = useState<StrumBar[]>(
    initial && initial.bars.length > 0 ? initial.bars : [emptyBar(beatsPerBar * 2)],
  );
  const [chord, setChord] = useState(chords[0] ?? 'C');
  const [isPlaying, setIsPlaying] = useState(false);
  const [active, setActive] = useState<{ bar: number; slot: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chordOptions = chords.length > 0 ? chords : DEFAULT_CHORDS;
  const isEmpty = bars.every((bar) => bar.every((s) => !s.stroke));

  function stop() {
    stopPlayback();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setIsPlaying(false);
    setActive(null);
  }

  useEffect(() => () => {
    stopPlayback();
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function updateBars(next: StrumBar[]) {
    if (isPlaying) stop();
    setBars(next);
  }

  function cycleSlot(barIdx: number, slotIdx: number) {
    updateBars(bars.map((bar, b) => (b === barIdx ? bar.map((s, i) => (i === slotIdx ? nextSlot(s) : s)) : bar)));
  }

  function changeSlotCount(count: number) {
    setSlotCount(count);
    updateBars(bars.map((bar) => resizeBar(bar, count)));
  }

  function applyPreset(text: string) {
    const preset = parseStrumBar(text);
    setSlotCount(preset.length);
    // A preset replaces the whole pattern with that single bar.
    updateBars([preset]);
  }

  async function handlePlay() {
    if (isPlaying) {
      stop();
      return;
    }
    const frets = guitarVoicing(chord);
    if (!frets) return;
    setIsPlaying(true);
    const ms = await playStrum({
      bars,
      frets,
      bpm: tempo ?? 100,
      beatsPerBar,
      onSlot: (bar, slot) => setActive({ bar, slot }),
    });
    if (ms === 0) {
      setIsPlaying(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setIsPlaying(false);
      setActive(null);
    }, ms);
  }

  return (
    <div className="tab-seq-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tab-seq-modal strum-modal" role="dialog" aria-modal="true" aria-label="Strumming pattern">
        <div className="tab-seq-header">
          <span className="tab-seq-title">{isEditing ? 'Edit Strumming Pattern' : 'Insert Strumming Pattern'}</span>
          <button className="tab-seq-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="tab-seq-body strum-editor-body">
          <div className="strum-editor-row">
            <label className="strum-editor-field">
              <span>Label</span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Verse feel"
                maxLength={60}
              />
            </label>
            <label className="strum-editor-field">
              <span>Slots per bar</span>
              <select value={slotCount} onChange={(e) => changeSlotCount(Number(e.target.value))}>
                {Array.from(new Set([...SLOT_OPTIONS, slotCount])).sort((a, b) => a - b).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="strum-editor-presets" role="group" aria-label="Presets">
            {PRESETS.map((p) => (
              <button key={p.name} type="button" className="strum-preset-btn" onClick={() => applyPreset(p.bar)}>
                {p.name}
              </button>
            ))}
          </div>

          {bars.map((bar, barIdx) => {
            const labels = slotLabels(bar.length, beatsPerBar);
            return (
              <div key={barIdx} className="strum-editor-bar">
                <div className="strum-bar" style={{ gridTemplateColumns: `repeat(${bar.length}, minmax(1.9rem, 1fr))` }}>
                  {bar.map((slot, slotIdx) => (
                    <div key={slotIdx} className="strum-cell">
                      <button
                        type="button"
                        className={[
                          'strum-slot strum-slot--button',
                          slot.stroke ? `strum-slot--${slot.stroke === 'D' ? 'down' : 'up'}` : 'strum-slot--rest',
                          slot.accent ? 'strum-slot--accent' : '',
                          slot.muted ? 'strum-slot--muted' : '',
                          active?.bar === barIdx && active.slot === slotIdx ? 'strum-slot--active' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => cycleSlot(barIdx, slotIdx)}
                        aria-label={`Bar ${barIdx + 1} slot ${slotIdx + 1}`}
                      >
                        {glyph(slot)}
                      </button>
                      <span className={`strum-count${/^\d+$/.test(labels[slotIdx]) ? ' strum-count--beat' : ''}`}>
                        {labels[slotIdx]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="tab-seq-bar-controls">
            <button
              type="button"
              className="tab-seq-bar-ctrl-btn"
              onClick={() => updateBars(bars.slice(0, -1))}
              disabled={bars.length <= 1}
              aria-label="Remove bar"
            >
              <Minus size={12} /> Bar
            </button>
            <span className="tab-seq-bar-count">{bars.length} bar{bars.length !== 1 ? 's' : ''}</span>
            <button
              type="button"
              className="tab-seq-bar-ctrl-btn"
              onClick={() => updateBars([...bars, emptyBar(slotCount)])}
              disabled={bars.length >= MAX_BARS}
              aria-label="Add bar"
            >
              <Plus size={12} /> Bar
            </button>
          </div>
        </div>

        <div className="tab-seq-hint">
          Tap a slot to cycle: <strong>↓</strong> down · <strong>↑</strong> up · accented (bold) · <strong>×</strong> muted · rest
        </div>

        <div className="tab-seq-footer">
          <div className="tab-seq-playback">
            <button
              type="button"
              className={`tab-seq-btn tab-seq-btn--play${isPlaying ? ' tab-seq-btn--playing' : ''}`}
              onClick={handlePlay}
              disabled={isEmpty}
              title={isPlaying ? 'Stop' : 'Play preview'}
            >
              {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              {isPlaying ? 'Stop' : 'Play'}
            </button>
            <select
              className="strum-chord-select"
              value={chord}
              onChange={(e) => { setChord(e.target.value); if (isPlaying) stop(); }}
              aria-label="Chord to preview on"
            >
              {chordOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="tab-seq-footer-actions">
            <button
              type="button"
              className="tab-seq-btn tab-seq-btn--ghost"
              onClick={() => updateBars(bars.map((b) => emptyBar(b.length)))}
            >
              Clear
            </button>
            <span className="tab-seq-footer-sep" aria-hidden="true" />
            <button type="button" className="tab-seq-btn tab-seq-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="tab-seq-btn tab-seq-btn--primary"
              onClick={() => onInsert({ label: label.trim() || undefined, bars })}
              disabled={isEmpty}
            >
              {isEditing ? 'Update Pattern' : 'Insert Pattern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
