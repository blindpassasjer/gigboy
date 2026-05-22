import { useMemo, useState } from 'react';
import { GUITAR_CHORDS } from '../data/guitarChords';
import type { DiagramInstrument } from './ChordDiagram';

// ─── Chord identification ─────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Standard tuning: E2 A2 D3 G3 B3 E4
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];

// Build reverse lookup: sorted pitch-class signature → chord names from GUITAR_CHORDS.
// This is the same data ChordDiagram uses for the guitar diagram, so results are
// perfectly consistent with what the diagram would show.
const GUITAR_PC_LOOKUP = (() => {
  const map = new Map<string, string[]>();
  for (const [name, frets] of Object.entries(GUITAR_CHORDS)) {
    const midi = frets
      .map((f, i) => (f === -1 ? null : OPEN_MIDI[i] + f))
      .filter((m): m is number => m !== null);
    const key = Array.from(new Set(midi.map(m => m % 12)))
      .sort((a, b) => a - b)
      .join(',');
    const list = map.get(key) ?? [];
    list.push(name);
    map.set(key, list);
  }
  return map;
})();

// Interval-based fallback for voicings not in the database, and for piano mode.
// Covers every chord type that ChordDiagram's piano view can render.
const QUALITIES: { suffix: string; intervals: number[] }[] = [
  { suffix: '',      intervals: [0, 4, 7] },
  { suffix: 'm',     intervals: [0, 3, 7] },
  { suffix: '5',     intervals: [0, 7] },
  { suffix: 'sus2',  intervals: [0, 2, 7] },
  { suffix: 'sus4',  intervals: [0, 5, 7] },
  { suffix: '6',     intervals: [0, 4, 7, 9] },
  { suffix: 'm6',    intervals: [0, 3, 7, 9] },
  { suffix: '7',     intervals: [0, 4, 7, 10] },
  { suffix: 'maj7',  intervals: [0, 4, 7, 11] },
  { suffix: 'm7',    intervals: [0, 3, 7, 10] },
  { suffix: 'add9',  intervals: [0, 2, 4, 7] },
  { suffix: 'dim',   intervals: [0, 3, 6] },
  { suffix: 'aug',   intervals: [0, 4, 8] },
  { suffix: 'dim7',  intervals: [0, 3, 6, 9] },
  { suffix: 'm7b5',  intervals: [0, 3, 6, 10] },
  { suffix: '9',     intervals: [0, 2, 4, 7, 10] },
  { suffix: 'maj9',  intervals: [0, 2, 4, 7, 11] },
  { suffix: 'm9',    intervals: [0, 2, 3, 7, 10] },
];

function pcSignature(pcs: Set<number>): string {
  return Array.from(pcs).sort((a, b) => a - b).join(',');
}

function identifyGuitarChords(pcs: Set<number>, bassPC: number): string[] {
  if (pcs.size < 2) return [];
  // Primary: exact database match (same source as ChordDiagram)
  const dbMatches = GUITAR_PC_LOOKUP.get(pcSignature(pcs)) ?? [];
  if (dbMatches.length > 0) return dbMatches.slice(0, 4);
  // Fallback: interval analysis for voicings not in the database
  return identifyByIntervals(pcs, bassPC);
}

function identifyPianoChords(pcs: Set<number>, bassPC: number): string[] {
  if (pcs.size < 2) return [];
  return identifyByIntervals(pcs, bassPC);
}

function identifyByIntervals(pcs: Set<number>, bassPC: number): string[] {
  const results: { name: string; score: number }[] = [];
  for (let root = 0; root < 12; root++) {
    for (const q of QUALITIES) {
      const required = q.intervals.map(i => (root + i) % 12);
      if (!required.every(pc => pcs.has(pc))) continue;
      const rootName = NOTE_NAMES[root];
      const isSlash = bassPC !== root;
      const name = isSlash
        ? `${rootName}${q.suffix}/${NOTE_NAMES[bassPC]}`
        : `${rootName}${q.suffix}`;
      const score = (bassPC === root ? 10 : 0) - (pcs.size - q.intervals.length) - (isSlash ? 2 : 0);
      results.push({ name, score });
    }
  }
  results.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  return results
    .filter(r => !seen.has(r.name) && seen.add(r.name))
    .map(r => r.name)
    .slice(0, 4);
}

// ─── Interactive guitar fretboard ─────────────────────────────────────────────

const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
const NUM_STRINGS = 6;
const FRETS_SHOWN = 5;
const STR_GAP = 24;
const FRET_H = 28;
const GML = 28;
const GMT = 32;
const GMR = 12;
const GRID_W = (NUM_STRINGS - 1) * STR_GAP;
const SVG_W = GML + GRID_W + GMR;
const SVG_H = GMT + FRETS_SHOWN * FRET_H + 20;

interface GuitarFretboardProps {
  strings: number[]; // -1=muted, 0=open, 1-12=fret
  startFret: number;
  onStringChange: (i: number, fret: number) => void;
}

function InteractiveGuitarFretboard({ strings, startFret, onStringChange }: GuitarFretboardProps) {
  const showNut = startFret === 1;
  const cx = (i: number) => GML + i * STR_GAP;
  const dotCy = (f: number) => GMT + (f - startFret + 0.5) * FRET_H;

  function handleFretClick(si: number, fret: number) {
    // Toggle: clicking an active fret goes to open; else place finger
    onStringChange(si, strings[si] === fret ? 0 : fret);
  }

  function handleHeaderClick(si: number) {
    // Cycle: open (0) → muted (-1) → open (0)
    onStringChange(si, strings[si] === -1 ? 0 : -1);
  }

  return (
    <svg
      width={SVG_W}
      height={SVG_H}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      style={{ display: 'block', userSelect: 'none' }}
    >
      {/* Fret bars */}
      {Array.from({ length: FRETS_SHOWN + 1 }, (_, i) => (
        <line
          key={i}
          x1={GML} y1={GMT + i * FRET_H}
          x2={GML + GRID_W} y2={GMT + i * FRET_H}
          stroke="var(--chord-finder-fret, #555)"
          strokeWidth={i === 0 && showNut ? 4 : 1}
        />
      ))}

      {/* Strings */}
      {Array.from({ length: NUM_STRINGS }, (_, i) => (
        <line
          key={i}
          x1={cx(i)} y1={GMT}
          x2={cx(i)} y2={GMT + FRETS_SHOWN * FRET_H}
          stroke="var(--chord-finder-string, #777)"
          strokeWidth={1}
        />
      ))}

      {/* Fret position label */}
      {!showNut && (
        <text x={GML - 4} y={GMT + FRET_H * 0.5}
          textAnchor="end" dominantBaseline="middle"
          fontSize={10} fill="var(--muted)" fontFamily="sans-serif">
          {startFret}fr
        </text>
      )}

      {/* Clickable header areas */}
      {Array.from({ length: NUM_STRINGS }, (_, i) => (
        <rect key={i}
          x={cx(i) - STR_GAP / 2} y={0}
          width={STR_GAP} height={GMT}
          fill="transparent" style={{ cursor: 'pointer' }}
          onClick={() => handleHeaderClick(i)}
        />
      ))}

      {/* X / O string indicators */}
      {strings.map((fret, i) => {
        if (fret === -1) return (
          <text key={i} x={cx(i)} y={GMT - 10}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={13} fill="#c0392b" fontWeight="bold" fontFamily="sans-serif"
            style={{ cursor: 'pointer', pointerEvents: 'none' }}>
            ✕
          </text>
        );
        return (
          <circle key={i} cx={cx(i)} cy={GMT - 10} r={5}
            fill="none" stroke="var(--chord-finder-open, #777)" strokeWidth={1.5}
            style={{ cursor: 'pointer', pointerEvents: 'none' }}
          />
        );
      })}

      {/* Clickable fret cells */}
      {Array.from({ length: NUM_STRINGS }, (_, si) =>
        Array.from({ length: FRETS_SHOWN }, (_, fi) => {
          const fret = startFret + fi;
          const active = strings[si] === fret;
          return (
            <rect key={`${si}-${fi}`}
              x={cx(si) - STR_GAP / 2} y={GMT + fi * FRET_H}
              width={STR_GAP} height={FRET_H}
              fill={active ? 'rgba(92,79,166,0.12)' : 'transparent'}
              style={{ cursor: 'pointer' }}
              onClick={() => handleFretClick(si, fret)}
            />
          );
        })
      )}

      {/* Finger dots */}
      {strings.map((fret, i) => {
        if (fret <= 0) return null;
        if (fret < startFret || fret >= startFret + FRETS_SHOWN) return null;
        return <circle key={i} cx={cx(i)} cy={dotCy(fret)} r={9} fill="#5c4fa6" style={{ pointerEvents: 'none' }} />;
      })}

      {/* String labels */}
      {STRING_LABELS.map((label, i) => (
        <text key={i} x={cx(i)} y={GMT + FRETS_SHOWN * FRET_H + 14}
          textAnchor="middle" fontSize={10} fill="var(--muted)" fontFamily="sans-serif">
          {label}
        </text>
      ))}
    </svg>
  );
}

// ─── Interactive piano ────────────────────────────────────────────────────────

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_PCS: { pc: number; wOff: number }[] = [
  { pc: 1, wOff: 1 },
  { pc: 3, wOff: 2 },
  { pc: 6, wOff: 4 },
  { pc: 8, wOff: 5 },
  { pc: 10, wOff: 6 },
];

interface PianoProps {
  activePCs: Set<number>;
  onToggle: (pc: number) => void;
}

function InteractivePiano({ activePCs, onToggle }: PianoProps) {
  const WKW = 28;
  const WKH = 72;
  const BKW = 18;
  const BKH = 44;
  const ACCENT = '#5c4fa6';
  const totalW = 7 * WKW;

  return (
    <div style={{ position: 'relative', width: totalW, height: WKH, userSelect: 'none' }}>
      {WHITE_PCS.map((pc, wOff) => (
        <div key={pc}
          style={{
            position: 'absolute',
            left: wOff * WKW + 1,
            top: 0,
            width: WKW - 2,
            height: WKH,
            background: activePCs.has(pc) ? ACCENT : 'var(--chord-finder-white-key, #fff)',
            border: '1px solid #ccc',
            borderRadius: '0 0 4px 4px',
            cursor: 'pointer',
          }}
          onClick={() => onToggle(pc)}
        />
      ))}
      {BLACK_PCS.map(({ pc, wOff }) => (
        <div key={pc}
          style={{
            position: 'absolute',
            left: wOff * WKW - BKW / 2,
            top: 0,
            width: BKW,
            height: BKH,
            background: activePCs.has(pc) ? ACCENT : 'var(--chord-finder-black-key, #222)',
            borderRadius: '0 0 3px 3px',
            zIndex: 1,
            cursor: 'pointer',
          }}
          onClick={(e) => { e.stopPropagation(); onToggle(pc); }}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  instrument: DiagramInstrument;
}

export default function ChordFinder({ instrument }: Props) {
  const [strings, setStrings] = useState<number[]>([-1, -1, -1, -1, -1, -1]);
  const [startFret, setStartFret] = useState(1);
  const [activePCs, setActivePCs] = useState<Set<number>>(new Set());

  function handleStringChange(i: number, fret: number) {
    setStrings(prev => { const next = [...prev]; next[i] = fret; return next; });
  }

  function handleTogglePC(pc: number) {
    setActivePCs(prev => {
      const next = new Set(prev);
      if (next.has(pc)) next.delete(pc); else next.add(pc);
      return next;
    });
  }

  function handleReset() {
    setStrings([-1, -1, -1, -1, -1, -1]);
    setStartFret(1);
    setActivePCs(new Set());
  }

  const guitarMatches = useMemo(() => {
    const sounding = strings
      .map((fret, i) => fret === -1 ? null : OPEN_MIDI[i] + fret)
      .filter((m): m is number => m !== null);
    if (sounding.length < 2) return [];
    const pcs = new Set(sounding.map(m => m % 12));
    const bassPC = Math.min(...sounding) % 12;
    return identifyGuitarChords(pcs, bassPC);
  }, [strings]);

  const pianoMatches = useMemo(() => {
    if (activePCs.size < 2) return [];
    const bassPC = Math.min(...activePCs);
    return identifyPianoChords(activePCs, bassPC);
  }, [activePCs]);

  const matches = instrument === 'guitar' ? guitarMatches : pianoMatches;
  const soundingCount = instrument === 'guitar'
    ? strings.filter(f => f !== -1).length
    : activePCs.size;
  const hasInput = soundingCount >= 2;

  return (
    <div className="chord-finder">
      <div className="chord-finder-diagram">
        {instrument === 'guitar' ? (
          <>
            <InteractiveGuitarFretboard
              strings={strings}
              startFret={startFret}
              onStringChange={handleStringChange}
            />
            <div className="chord-finder-fret-nav">
              <button
                className="chord-finder-nav-btn"
                onClick={() => setStartFret(f => Math.max(1, f - 1))}
                disabled={startFret <= 1}
                aria-label="Shift fretboard up"
              >▲</button>
              <button
                className="chord-finder-nav-btn"
                onClick={() => setStartFret(f => Math.min(12, f + 1))}
                disabled={startFret >= 12}
                aria-label="Shift fretboard down"
              >▼</button>
            </div>
          </>
        ) : (
          <InteractivePiano activePCs={activePCs} onToggle={handleTogglePC} />
        )}
      </div>

      <div className="chord-finder-result-row">
        {matches.length > 0 ? (
          <div className="chord-finder-matches">
            {matches.map((name, i) => (
              <span
                key={name}
                className={`chord-finder-match${i === 0 ? ' chord-finder-match--primary' : ''}`}
              >
                {name}
              </span>
            ))}
          </div>
        ) : hasInput ? (
          <span className="chord-finder-no-match">No chord identified</span>
        ) : (
          <span className="chord-finder-hint">
            {instrument === 'guitar'
              ? 'Click strings to toggle mute/open, click frets to place fingers'
              : 'Click keys to select notes'}
          </span>
        )}
        {(soundingCount > 0) && (
          <button className="chord-finder-reset" onClick={handleReset} aria-label="Reset">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
