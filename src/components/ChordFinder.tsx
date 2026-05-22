import { useMemo, useState } from 'react';
import { GUITAR_CHORDS } from '../data/guitarChords';
import {
  GuitarDiagram,
  PianoDiagram,
  normalizeForLookup,
  parseChordModel,
  buildPianoNotes,
} from './ChordDiagram';
import type { DiagramInstrument } from './ChordDiagram';

interface Props {
  instrument: DiagramInstrument;
}

export default function ChordFinder({ instrument }: Props) {
  const [input, setInput] = useState('');

  const trimmed = input.trim();
  const normalized = trimmed ? normalizeForLookup(trimmed) : '';
  const guitarFrets = normalized ? (GUITAR_CHORDS[normalized] ?? null) : null;

  const chordModel = useMemo(() => (trimmed ? parseChordModel(trimmed) : null), [trimmed]);

  const pianoNotes = useMemo(() => {
    if (!chordModel) return new Set<number>();
    return new Set(buildPianoNotes(chordModel.rootPc, chordModel.triadIntervals, 0));
  }, [chordModel]);

  return (
    <div className="chord-finder">
      <input
        type="text"
        className="chord-finder-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Am, G7, Cmaj7…"
        aria-label="Chord name"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="none"
      />
      {trimmed && (
        <div className="chord-finder-result">
          {instrument === 'guitar' ? (
            guitarFrets ? (
              <GuitarDiagram frets={guitarFrets} />
            ) : (
              <p className="chord-finder-unavailable">No guitar diagram for "{trimmed}"</p>
            )
          ) : chordModel && chordModel.triadIntervals.length > 0 ? (
            <PianoDiagram activeNotes={pianoNotes} />
          ) : (
            <p className="chord-finder-unavailable">No piano diagram for "{trimmed}"</p>
          )}
        </div>
      )}
    </div>
  );
}
