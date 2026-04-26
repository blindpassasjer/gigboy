import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type DiagramInstrument = 'guitar' | 'piano';

interface Props {
  chord: string;
  instrument: DiagramInstrument;
  anchorRect: DOMRect;
  onClose: () => void;
}

// ─── Guitar chord data ────────────────────────────────────────────────────────
// frets[i] = fret on string i (low E → high e): -1=muted, 0=open, n=fret n

const GUITAR_CHORDS: Record<string, number[]> = {
  // Major
  C:      [-1, 3, 2, 0, 1, 0],
  'C#':   [-1, 4, 6, 6, 6, 4],
  D:      [-1,-1, 0, 2, 3, 2],
  'D#':   [-1, 6, 8, 8, 8, 6],
  E:      [ 0, 2, 2, 1, 0, 0],
  F:      [ 1, 3, 3, 2, 1, 1],
  'F#':   [ 2, 4, 4, 3, 2, 2],
  G:      [ 3, 2, 0, 0, 0, 3],
  'G#':   [ 4, 6, 6, 5, 4, 4],
  A:      [-1, 0, 2, 2, 2, 0],
  'A#':   [ 6, 8, 8, 7, 6, 6],
  B:      [-1, 2, 4, 4, 4, 2],
  // Minor
  Cm:     [-1, 3, 5, 5, 4, 3],
  'C#m':  [-1, 4, 6, 6, 5, 4],
  Dm:     [-1,-1, 0, 2, 3, 1],
  'D#m':  [-1, 6, 8, 8, 7, 6],
  Em:     [ 0, 2, 2, 0, 0, 0],
  Fm:     [ 1, 3, 3, 1, 1, 1],
  'F#m':  [ 2, 4, 4, 2, 2, 2],
  Gm:     [ 3, 5, 5, 3, 3, 3],
  'G#m':  [ 4, 6, 6, 4, 4, 4],
  Am:     [-1, 0, 2, 2, 1, 0],
  'A#m':  [ 6, 8, 8, 6, 6, 6],
  Bm:     [-1, 2, 4, 4, 3, 2],
  // Dominant 7th
  C7:     [-1, 3, 2, 3, 1, 0],
  'C#7':  [-1, 4, 3, 4, 2, 0],
  D7:     [-1,-1, 0, 2, 1, 2],
  'D#7':  [-1, 6, 5, 6, 4, 6],
  E7:     [ 0, 2, 0, 1, 0, 0],
  F7:     [ 1, 3, 1, 2, 1, 1],
  'F#7':  [ 2, 4, 2, 3, 2, 2],
  G7:     [ 3, 2, 0, 0, 0, 1],
  'G#7':  [ 4, 6, 4, 5, 4, 4],
  A7:     [-1, 0, 2, 0, 2, 0],
  'A#7':  [ 6, 8, 6, 7, 6, 6],
  B7:     [-1, 2, 1, 2, 0, 2],
  // Minor 7th
  Cm7:    [-1, 3, 5, 3, 4, 3],
  'C#m7': [-1, 4, 6, 4, 5, 4],
  Dm7:    [-1,-1, 0, 2, 1, 1],
  'D#m7': [-1, 6, 8, 6, 7, 6],
  Em7:    [ 0, 2, 0, 0, 0, 0],
  Fm7:    [ 1, 3, 1, 1, 1, 1],
  'F#m7': [ 2, 4, 2, 2, 2, 2],
  Gm7:    [ 3, 5, 3, 3, 3, 3],
  'G#m7': [ 4, 6, 4, 4, 4, 4],
  Am7:    [-1, 0, 2, 0, 1, 0],
  'A#m7': [ 6, 8, 6, 6, 6, 6],
  Bm7:    [-1, 2, 4, 2, 3, 2],
  // Major 7th
  Cmaj7:    [-1, 3, 2, 0, 0, 0],
  'C#maj7': [-1, 4, 6, 6, 6, 3],
  Dmaj7:    [-1,-1, 0, 2, 2, 2],
  'D#maj7': [-1, 6, 5, 7, 7, 6],
  Emaj7:    [ 0, 2, 1, 1, 0, 0],
  Fmaj7:    [-1,-1, 3, 2, 1, 0],
  'F#maj7': [ 2, 4, 3, 3, 2, 2],
  Gmaj7:    [ 3, 2, 0, 0, 0, 2],
  'G#maj7': [ 4, 6, 5, 5, 4, 4],
  Amaj7:    [-1, 0, 2, 1, 2, 0],
  'A#maj7': [-1, 1, 3, 2, 3, 1],
  Bmaj7:    [-1, 2, 4, 3, 4, 2],
  // Sus chords
  Csus2:  [-1, 3, 0, 0, 1, 3],
  Dsus2:  [-1,-1, 0, 2, 3, 0],
  Esus2:  [ 0, 2, 2, 4, 0, 0],
  Gsus2:  [ 3, 2, 0, 0, 3, 3],
  Asus2:  [-1, 0, 2, 2, 0, 0],
  Csus4:  [-1, 3, 3, 0, 1, 1],
  Dsus4:  [-1,-1, 0, 2, 3, 3],
  Esus4:  [ 0, 2, 2, 2, 0, 0],
  Gsus4:  [ 3, 3, 0, 0, 1, 3],
  Asus4:  [-1, 0, 2, 2, 3, 0],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeForLookup(chord: string): string {
  const base = chord.split('/')[0];
  return base
    .replace(/^Db/, 'C#')
    .replace(/^Eb/, 'D#')
    .replace(/^Gb/, 'F#')
    .replace(/^Ab/, 'G#')
    .replace(/^Bb/, 'A#');
}

const ROOT_MAP: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

function chordToPitchClasses(chord: string): Set<number> {
  const base = chord.split('/')[0];
  const m = base.match(/^[A-G][#b]?/);
  if (!m) return new Set();
  const root = ROOT_MAP[m[0]] ?? 0;
  const suffix = base.slice(m[0].length);
  let intervals: number[];
  if (suffix === 'm7')        intervals = [0, 3, 7, 10];
  else if (suffix === 'maj7') intervals = [0, 4, 7, 11];
  else if (suffix === '7')    intervals = [0, 4, 7, 10];
  else if (suffix === 'm')    intervals = [0, 3, 7];
  else if (suffix === 'dim')  intervals = [0, 3, 6];
  else if (suffix === 'dim7') intervals = [0, 3, 6, 9];
  else if (suffix === 'aug')  intervals = [0, 4, 8];
  else if (suffix === 'sus2') intervals = [0, 2, 7];
  else if (suffix === 'sus4') intervals = [0, 5, 7];
  else                        intervals = [0, 4, 7];
  return new Set(intervals.map(i => (root + i) % 12));
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

  // Start from fret 1 for open-position chords, otherwise from the min fret
  const startFret = minFret <= 1 ? 1 : minFret;
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

function PianoDiagram({ pitchClasses }: { pitchClasses: Set<number> }) {
  const OCTAVES = 2;
  const WKW = 20;  // white key width
  const WKH = 68;  // white key height
  const BKW = 13;  // black key width
  const BKH = 40;  // black key height
  const ACCENT = '#5c4fa6';
  const totalW = OCTAVES * 7 * WKW;

  return (
    <div style={{ position: 'relative', width: totalW, height: WKH, userSelect: 'none' }}>
      {Array.from({ length: OCTAVES }, (_, oct) => (
        WHITE_PCS.map((pc, wOff) => (
          <div key={`w-${oct}-${wOff}`} style={{
            position: 'absolute',
            left: (oct * 7 + wOff) * WKW + 1,
            top: 0,
            width: WKW - 2,
            height: WKH,
            background: pitchClasses.has(pc) ? ACCENT : '#fff',
            border: '1px solid #ccc',
            borderRadius: '0 0 4px 4px',
          }} />
        ))
      ))}
      {Array.from({ length: OCTAVES }, (_, oct) => (
        BLACK_PCS.map(({ pc, wOff }) => (
          <div key={`b-${oct}-${pc}`} style={{
            position: 'absolute',
            left: (oct * 7 + wOff) * WKW - BKW / 2,
            top: 0,
            width: BKW,
            height: BKH,
            background: pitchClasses.has(pc) ? ACCENT : '#222',
            borderRadius: '0 0 3px 3px',
            zIndex: 1,
          }} />
        ))
      ))}
    </div>
  );
}

// ─── Popup ────────────────────────────────────────────────────────────────────

export default function ChordDiagram({ chord, instrument, anchorRect, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchorRect.bottom + 8, left: anchorRect.left + anchorRect.width / 2 });

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

  const normalized = normalizeForLookup(chord);
  const guitarFrets = GUITAR_CHORDS[normalized];
  const pitchClasses = chordToPitchClasses(chord);

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
      ) : (
        <PianoDiagram pitchClasses={pitchClasses} />
      )}
    </div>,
    document.body
  );
}
