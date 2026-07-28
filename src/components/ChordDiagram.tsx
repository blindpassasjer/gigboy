import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { GUITAR_CHORDS } from '../data/guitarChords';
import { UKULELE_CHORDS } from '../data/ukuleleChords';

export type DiagramInstrument = 'guitar' | 'piano' | 'ukulele';

interface Props {
  chord: string;
  instrument: DiagramInstrument;
  anchorRect: DOMRect;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROOT_LOOKUP_ALIAS: Record<string, string> = {
  C: 'C',
  'C#': 'C#',
  Db: 'C#',
  D: 'D',
  'D#': 'D#',
  Eb: 'D#',
  E: 'E',
  F: 'F',
  'F#': 'F#',
  Gb: 'F#',
  G: 'G',
  'G#': 'G#',
  Ab: 'G#',
  A: 'A',
  'A#': 'A#',
  Bb: 'A#',
  B: 'B',
};

function normalizeQualityForLookup(suffix: string): string {
  const compact = suffix.replace(/\s+/g, '');
  const lower = compact.toLowerCase();

  if (!compact) return '';

  // Treat common major aliases as plain major triads when no 7th is present.
  if (compact === 'M' || lower === 'maj') return '';

  if (compact === 'M7' || compact === 'Δ7' || lower === 'maj7' || lower === 'ma7') return 'maj7';
  if (lower === 'm7' || lower === 'min7' || lower === 'mi7' || compact === '-7') return 'm7';
  if (lower === 'm' || lower === 'min' || lower === 'mi' || compact === '-') return 'm';
  if (lower === 'sus') return 'sus4';

  // Already canonical in our current lookup set.
  if (lower === '7' || lower === 'sus2' || lower === 'sus4' || lower === 'maj7' || lower === 'm7' || lower === 'm') {
    return lower;
  }

  return compact;
}

function normalizeForLookup(chord: string): string {
  const base = chord.split('/')[0].trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const match = base.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return base;

  const root = `${match[1].toUpperCase()}${match[2]}`;
  const normalizedRoot = ROOT_LOOKUP_ALIAS[root] ?? root;
  const normalizedQuality = normalizeQualityForLookup(match[3] ?? '');

  return `${normalizedRoot}${normalizedQuality}`;
}

const ROOT_MAP: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

interface ChordModel {
  rootPc: number;
  triadIntervals: number[];
  fullIntervals: number[];
}

function normalizeInterval(value: number): number {
  return ((value % 12) + 12) % 12;
}

function uniqSorted(intervals: number[]): number[] {
  return Array.from(new Set(intervals.map(normalizeInterval))).sort((a, b) => a - b);
}

function containsStandaloneNumber(text: string, n: number): boolean {
  const re = new RegExp(`(^|[^0-9])${n}($|[^0-9])`);
  return re.test(text);
}

function getTriadIntervals(suffix: string): number[] {
  const s = suffix.toLowerCase();
  const startsMinor = (s.startsWith('m') && !s.startsWith('maj')) || s.startsWith('min') || s.startsWith('-');
  const startsDim = s.startsWith('dim') || s.startsWith('o') || s.includes('dim');
  const startsAug = s.startsWith('aug') || s.startsWith('+') || s.includes('aug');
  const hasSus2 = s.includes('sus2');
  const hasSus4 = s.includes('sus4') || (s.includes('sus') && !hasSus2);

  let triad = [0, 4, 7];
  if (startsDim) triad = [0, 3, 6];
  else if (startsAug) triad = [0, 4, 8];
  else if (startsMinor) triad = [0, 3, 7];

  if (hasSus2) triad = [0, 2, 7];
  else if (hasSus4) triad = [0, 5, 7];

  if (containsStandaloneNumber(s, 5) && !s.includes('sus')) {
    triad = [0, 7];
  }

  if (s.includes('b5')) triad = triad.map((n) => (n === 7 ? 6 : n));
  if (s.includes('#5') || s.includes('+5')) triad = triad.map((n) => (n === 7 ? 8 : n));

  if (s.includes('no3')) {
    triad = triad.filter((n) => n !== 3 && n !== 4 && n !== 2 && n !== 5);
  }
  if (s.includes('no5')) {
    triad = triad.filter((n) => n !== 6 && n !== 7 && n !== 8);
  }

  return uniqSorted(triad);
}

function getFullIntervals(suffix: string): number[] {
  const s = suffix.toLowerCase();
  const intervals = [...getTriadIntervals(suffix)];
  const add = (n: number) => intervals.push(normalizeInterval(n));
  const remove = (n: number) => {
    const pc = normalizeInterval(n);
    const idx = intervals.findIndex((x) => normalizeInterval(x) === pc);
    if (idx >= 0) intervals.splice(idx, 1);
  };

  const hasMajorFamily = /maj(7|9|11|13)|ma(7|9|11|13)/.test(s);
  const hasDim7 = s.includes('dim7') || s.includes('o7');
  const hasAny7 = containsStandaloneNumber(s, 7) || containsStandaloneNumber(s, 9) || containsStandaloneNumber(s, 11) || containsStandaloneNumber(s, 13);

  if (hasDim7) add(9);
  else if (hasMajorFamily || s.includes('maj7') || s.includes('ma7')) add(11);
  else if (hasAny7) add(10);
  else if (containsStandaloneNumber(s, 6) || s.includes('add6') || s.includes('add13')) add(9);

  if (containsStandaloneNumber(s, 9) || s.includes('add9') || s.includes('add2')) add(2);
  if (containsStandaloneNumber(s, 11) || s.includes('add11') || s.includes('add4')) add(5);
  if (containsStandaloneNumber(s, 13) || s.includes('add13') || s.includes('add6')) add(9);

  const alterationRe = /([b#])(5|9|11|13)/g;
  let match = alterationRe.exec(s);
  while (match) {
    const accidental = match[1];
    const degree = Number(match[2]);
    const baseInterval = degree === 5 ? 7 : degree === 9 ? 2 : degree === 11 ? 5 : 9;
    remove(baseInterval);
    add(accidental === 'b' ? baseInterval - 1 : baseInterval + 1);
    match = alterationRe.exec(s);
  }

  if (s.includes('no3')) {
    remove(3);
    remove(4);
  }
  if (s.includes('no5')) {
    remove(6);
    remove(7);
    remove(8);
  }

  return uniqSorted(intervals);
}

function parseChordModel(chord: string): ChordModel | null {
  const base = chord.split('/')[0];
  const m = base.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return null;
  const rootPc = ROOT_MAP[m[1]];
  if (rootPc === undefined) return null;
  const suffix = m[2] ?? '';
  return {
    rootPc,
    triadIntervals: getTriadIntervals(suffix),
    fullIntervals: getFullIntervals(suffix),
  };
}

function inversionLabel(index: number): string {
  if (index === 0) return 'Root';
  if (index === 1) return '1st inv';
  if (index === 2) return '2nd inv';
  if (index === 3) return '3rd inv';
  return `${index}th inv`;
}

function buildPianoNotes(rootPc: number, intervals: number[], inversion: number): number[] {
  if (intervals.length === 0) return [];

  const MIDI_START = 48; // C3
  const MIDI_END = 83;   // B5
  const base = MIDI_START + rootPc;
  const rotated = [...intervals].sort((a, b) => a - b);
  const turns = ((inversion % rotated.length) + rotated.length) % rotated.length;

  for (let i = 0; i < turns; i += 1) {
    const head = rotated.shift();
    if (head === undefined) break;
    rotated.push(head + 12);
  }

  let notes = rotated.map((intv) => base + intv);
  while (Math.max(...notes) > MIDI_END && Math.min(...notes) - 12 >= MIDI_START) {
    notes = notes.map((n) => n - 12);
  }
  while (Math.min(...notes) < MIDI_START && Math.max(...notes) + 12 <= MIDI_END) {
    notes = notes.map((n) => n + 12);
  }

  return notes;
}

// ─── Guitar diagram ───────────────────────────────────────────────────────────

const NUM_STRINGS = 6;
const FRETS_SHOWN = 5;
const STR_GAP = 24;   // px between strings
const FRET_H = 28;    // px per fret slot
const GML = 28;       // left margin (fret label)
const GMT = 30;       // top margin (X/O indicators)
const GMR = 12;       // right margin
const GRID_W = (NUM_STRINGS - 1) * STR_GAP;
const SVG_W = GML + GRID_W + GMR;
const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];

function GuitarDiagram({ frets }: { frets: number[] }) {
  const played = frets.filter(f => f > 0);
  const minFret = played.length ? Math.min(...played) : 0;
  const maxFret = played.length ? Math.max(...played) : 4;

  // Keep most shapes anchored to the first fret, except third-fret shapes.
  const startFret = minFret === 3 ? 3 : 1;
  const showNut = startFret === 1;

  // Expand window if chord spans more than FRETS_SHOWN
  const window = Math.max(FRETS_SHOWN, maxFret - startFret + 2);
  const svgH = GMT + window * FRET_H + 20;

  const dotCy = (f: number) => GMT + (f - startFret + 0.5) * FRET_H;

  return (
    <svg width={SVG_W} height={svgH} viewBox={`0 0 ${SVG_W} ${svgH}`} style={{ display: 'block' }}>
      {/* Fret bars */}
      {Array.from({ length: window + 1 }, (_, i) => (
        <line
          key={i}
          x1={GML} y1={GMT + i * FRET_H}
          x2={GML + GRID_W} y2={GMT + i * FRET_H}
          stroke="#333"
          strokeWidth={i === 0 && showNut ? 4 : 1}
        />
      ))}

      {/* Strings */}
      {Array.from({ length: NUM_STRINGS }, (_, i) => (
        <line
          key={i}
          x1={GML + i * STR_GAP} y1={GMT}
          x2={GML + i * STR_GAP} y2={GMT + window * FRET_H}
          stroke="#555" strokeWidth={1}
        />
      ))}

      {/* Fret position label for barre chords */}
      {!showNut && (
        <text
          x={GML - 4} y={GMT + FRET_H * 0.5}
          textAnchor="end" dominantBaseline="middle"
          fontSize={10} fill="#666" fontFamily="sans-serif"
        >
          {startFret}fr
        </text>
      )}

      {/* String indicators (X, O) and finger dots */}
      {frets.map((fret, i) => {
        const cx = GML + i * STR_GAP;
        if (fret === -1) {
          return (
            <text
              key={i} x={cx} y={GMT - 10}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={13} fill="#c0392b" fontWeight="bold" fontFamily="sans-serif"
            >
              ✕
            </text>
          );
        }
        if (fret === 0) {
          return (
            <circle key={i} cx={cx} cy={GMT - 10} r={5}
              fill="none" stroke="#555" strokeWidth={1.5} />
          );
        }
        if (fret < startFret || fret >= startFret + window) return null;
        return <circle key={i} cx={cx} cy={dotCy(fret)} r={9} fill="#5c4fa6" />;
      })}

      {/* String labels at bottom */}
      {STRING_LABELS.map((label, i) => (
        <text
          key={i}
          x={GML + i * STR_GAP} y={GMT + window * FRET_H + 14}
          textAnchor="middle" fontSize={10} fill="#888" fontFamily="sans-serif"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

// ─── Ukulele diagram ──────────────────────────────────────────────────────────

const UKE_NUM_STRINGS = 4;
const UKE_GRID_W = (UKE_NUM_STRINGS - 1) * STR_GAP;
const UKE_SVG_W = GML + UKE_GRID_W + GMR;
const UKE_STRING_LABELS = ['G', 'C', 'E', 'A'];

function UkuleleDiagram({ frets }: { frets: number[] }) {
  const played = frets.filter(f => f > 0);
  const minFret = played.length ? Math.min(...played) : 0;
  const maxFret = played.length ? Math.max(...played) : 4;

  const startFret = minFret === 3 ? 3 : 1;
  const showNut = startFret === 1;
  const window = Math.max(FRETS_SHOWN, maxFret - startFret + 2);
  const svgH = GMT + window * FRET_H + 20;

  const dotCy = (f: number) => GMT + (f - startFret + 0.5) * FRET_H;

  return (
    <svg width={UKE_SVG_W} height={svgH} viewBox={`0 0 ${UKE_SVG_W} ${svgH}`} style={{ display: 'block' }}>
      {Array.from({ length: window + 1 }, (_, i) => (
        <line
          key={i}
          x1={GML} y1={GMT + i * FRET_H}
          x2={GML + UKE_GRID_W} y2={GMT + i * FRET_H}
          stroke="#333"
          strokeWidth={i === 0 && showNut ? 4 : 1}
        />
      ))}
      {Array.from({ length: UKE_NUM_STRINGS }, (_, i) => (
        <line
          key={i}
          x1={GML + i * STR_GAP} y1={GMT}
          x2={GML + i * STR_GAP} y2={GMT + window * FRET_H}
          stroke="#555" strokeWidth={1}
        />
      ))}
      {!showNut && (
        <text
          x={GML - 4} y={GMT + FRET_H * 0.5}
          textAnchor="end" dominantBaseline="middle"
          fontSize={10} fill="#666" fontFamily="sans-serif"
        >
          {startFret}fr
        </text>
      )}
      {frets.map((fret, i) => {
        const cx = GML + i * STR_GAP;
        if (fret === -1) {
          return (
            <text
              key={i} x={cx} y={GMT - 10}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={13} fill="#c0392b" fontWeight="bold" fontFamily="sans-serif"
            >
              ✕
            </text>
          );
        }
        if (fret === 0) {
          return (
            <circle key={i} cx={cx} cy={GMT - 10} r={5}
              fill="none" stroke="#555" strokeWidth={1.5} />
          );
        }
        if (fret < startFret || fret >= startFret + window) return null;
        return <circle key={i} cx={cx} cy={dotCy(fret)} r={9} fill="#5c4fa6" />;
      })}
      {UKE_STRING_LABELS.map((label, i) => (
        <text
          key={i}
          x={GML + i * STR_GAP} y={GMT + window * FRET_H + 14}
          textAnchor="middle" fontSize={10} fill="#888" fontFamily="sans-serif"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

// ─── Piano diagram ────────────────────────────────────────────────────────────

// White key pitch classes per octave: C D E F G A B
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
// Black key pitch class → position (# of white keys from start of octave, used for x offset)
const BLACK_PCS: { pc: number; wOff: number }[] = [
  { pc: 1, wOff: 1 },  // C#
  { pc: 3, wOff: 2 },  // D#
  { pc: 6, wOff: 4 },  // F#
  { pc: 8, wOff: 5 },  // G#
  { pc: 10, wOff: 6 }, // A#
];

function PianoDiagram({ activeNotes }: { activeNotes: Set<number> }) {
  const OCTAVES = 3;
  const MIDI_START = 48; // C3
  const WKW = 20;  // white key width
  const WKH = 68;  // white key height
  const BKW = 13;  // black key width
  const BKH = 40;  // black key height
  const ACCENT = '#5c4fa6';
  const totalW = OCTAVES * 7 * WKW;

  return (
    <div style={{ position: 'relative', width: totalW, height: WKH, userSelect: 'none' }}>
      {Array.from({ length: OCTAVES }, (_, oct) => (
        WHITE_PCS.map((pc, wOff) => {
          const note = MIDI_START + oct * 12 + pc;
          return (
          <div key={`w-${oct}-${wOff}`} style={{
            position: 'absolute',
            left: (oct * 7 + wOff) * WKW + 1,
            top: 0,
            width: WKW - 2,
            height: WKH,
            background: activeNotes.has(note) ? ACCENT : '#fff',
            border: '1px solid #ccc',
            borderRadius: '0 0 4px 4px',
          }} />
          );
        })
      ))}
      {Array.from({ length: OCTAVES }, (_, oct) => (
        BLACK_PCS.map(({ pc, wOff }) => {
          const note = MIDI_START + oct * 12 + pc;
          return (
          <div key={`b-${oct}-${pc}`} style={{
            position: 'absolute',
            left: (oct * 7 + wOff) * WKW - BKW / 2,
            top: 0,
            width: BKW,
            height: BKH,
            background: activeNotes.has(note) ? ACCENT : '#222',
            borderRadius: '0 0 3px 3px',
            zIndex: 1,
          }} />
          );
        })
      ))}
    </div>
  );
}

// ─── Popup ────────────────────────────────────────────────────────────────────

export default function ChordDiagram({ chord, instrument, anchorRect, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchorRect.bottom + 8, left: anchorRect.left + anchorRect.width / 2 });
  const [showInversions, setShowInversions] = useState(false);
  const [inversionIndex, setInversionIndex] = useState(0);

  // Auto-position: flip above if popup would overflow viewport bottom
  useLayoutEffect(() => {
    if (!popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    let top = anchorRect.bottom + 8;
    let left = anchorRect.left + anchorRect.width / 2;
    if (top + rect.height > window.innerHeight - 8) {
      top = anchorRect.top - rect.height - 8;
    }
    left = Math.max(rect.width / 2 + 8, Math.min(left, window.innerWidth - rect.width / 2 - 8));
    setPos({ top, left });
  }, [anchorRect]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    setShowInversions(false);
    setInversionIndex(0);
  }, [chord]);

  const normalized = normalizeForLookup(chord);
  const guitarFrets = GUITAR_CHORDS[normalized];
  const ukuleleFrets = UKULELE_CHORDS[normalized];
  const chordModel = useMemo(() => parseChordModel(chord), [chord]);
  const triadIntervals = useMemo(() => chordModel?.triadIntervals ?? [], [chordModel]);
  const inversionSteps = Math.max(1, triadIntervals.length);
  const effectiveInversion = showInversions ? inversionIndex : 0;

  const pianoNotes = useMemo(() => {
    if (!chordModel) return [];
    return buildPianoNotes(chordModel.rootPc, triadIntervals, effectiveInversion);
  }, [chordModel, triadIntervals, effectiveInversion]);

  const activePianoNotes = useMemo(() => new Set(pianoNotes), [pianoNotes]);

  useEffect(() => {
    if (!showInversions) {
      setInversionIndex(0);
      return;
    }
    setInversionIndex((prev) => Math.max(0, Math.min(prev, inversionSteps - 1)));
  }, [showInversions, inversionSteps]);

  return createPortal(
    <div
      ref={popupRef}
      className="chord-diagram-popup"
      style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
    >
      <div className="chord-diagram-header">
        <span className="chord-diagram-name">{chord}</span>
        <button className="chord-diagram-close" onClick={onClose} aria-label="Close diagram">
          <X size={13} />
        </button>
      </div>

      {instrument === 'guitar' ? (
        guitarFrets
          ? <GuitarDiagram frets={guitarFrets} />
          : <p className="chord-diagram-unavailable">No diagram for {chord}</p>
      ) : instrument === 'ukulele' ? (
        ukuleleFrets
          ? <UkuleleDiagram frets={ukuleleFrets} />
          : <p className="chord-diagram-unavailable">No ukulele diagram for {chord}</p>
      ) : (
        chordModel && triadIntervals.length > 0 ? (
          <>
            <div className="piano-diagram-controls">
              <label className="piano-diagram-toggle">
                <input
                  type="checkbox"
                  checked={showInversions}
                  onChange={(e) => setShowInversions(e.target.checked)}
                />
                Inverted chords
              </label>
              {showInversions && inversionSteps > 1 && (
                <div className="piano-inversion-group" role="group" aria-label="Piano inversion">
                  {Array.from({ length: inversionSteps }, (_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`piano-inversion-btn${inversionIndex === idx ? ' piano-inversion-btn--active' : ''}`}
                      onClick={() => setInversionIndex(idx)}
                    >
                      {inversionLabel(idx)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <PianoDiagram activeNotes={activePianoNotes} />
            <p className="chord-diagram-hint">
              Triad view
              {showInversions && inversionSteps > 1 ? ` (${inversionLabel(inversionIndex)})` : ''}
              {chordModel.fullIntervals.length > triadIntervals.length ? ' from extended chord' : ''}
            </p>
          </>
        ) : (
          <p className="chord-diagram-unavailable">No piano diagram for {chord}</p>
        )
      )}
    </div>,
    document.body
  );
}
