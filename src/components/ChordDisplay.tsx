import { useMemo } from 'react';
import { parseChordPro, lineHasChords, transposeChord, convertChordNotation } from '../utils/chordParser';
import type { ChordNotation } from '../utils/chordParser';
import type { ParsedLine } from '../types';
import type { DiagramInstrument } from './ChordDiagram';

interface Props {
  chordpro: string;
  transpose?: number;
  showChords?: boolean;
  notation?: ChordNotation;
  instrument?: DiagramInstrument;
  onChordClick?: (chord: string, rect: DOMRect) => void;
}

export default function ChordDisplay({
  chordpro,
  transpose = 0,
  showChords = true,
  notation = 'anglo',
  onChordClick,
}: Props) {
  const lines = useMemo(() => parseChordPro(chordpro), [chordpro]);

  return (
    <div className="chord-display">
      {lines.map((line, i) => (
        <LineRenderer
          key={i}
          line={line}
          transpose={transpose}
          showChords={showChords}
          notation={notation}
          onChordClick={onChordClick}
        />
      ))}
    </div>
  );
}

function LineRenderer({
  line,
  transpose,
  showChords,
  notation,
  onChordClick,
}: {
  line: ParsedLine;
  transpose: number;
  showChords: boolean;
  notation: ChordNotation;
  onChordClick?: (chord: string, rect: DOMRect) => void;
}) {
  if (line.type === 'empty') return <div className="chord-line chord-line--empty" />;

  if (line.type === 'comment') return null;

  if (line.type === 'directive') {
    const dir = line.directive!;
    if (dir === 'title') return <h2 className="song-title-directive">{line.directiveValue}</h2>;
    if (dir === 'subtitle' || dir === 'artist')
      return <p className="song-subtitle-directive">{line.directiveValue}</p>;
    if (dir === 'chorus' || dir === 'start_of_chorus')
      return <div className="section-label">Chorus</div>;
    if (dir === 'intro' || dir === 'start_of_intro')
      return <div className="section-label">Intro</div>;
    if (dir === 'verse' || dir === 'start_of_verse')
      return <div className="section-label">Verse</div>;
    if (dir === 'bridge' || dir === 'start_of_bridge')
      return <div className="section-label">Bridge</div>;
    if (dir === 'interlude' || dir === 'start_of_interlude')
      return <div className="section-label">Interlude</div>;
    if (dir === 'outro' || dir === 'start_of_outro')
      return <div className="section-label">Outro</div>;
    if (
      dir === 'end_of_chorus' ||
      dir === 'end_of_intro' ||
      dir === 'end_of_interlude' ||
      dir === 'end_of_outro' ||
      dir === 'end_of_verse' ||
      dir === 'end_of_bridge'
    )
      return null;
    if (line.directiveValue) return <div className="section-label">{line.directiveValue}</div>;
    return null;
  }

  // Chord-lyric line
  const segments = line.segments ?? [];
  const hasChords = showChords && lineHasChords(line);
  const isChordOnly = hasChords && segments.every(seg => !seg.lyric.trim());

  return (
    <div className={`chord-line ${hasChords ? 'chord-line--has-chords' : ''} ${isChordOnly ? 'chord-line--chord-only' : ''}`}>
      {segments.map((seg, idx) => (
        <span key={idx} className="chord-segment">
          {showChords && (
            <span className="chord-name">
              {seg.chord ? (
                onChordClick ? (
                  <button
                    className="chord-name-btn"
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      // Always pass Anglo chord to diagram lookup
                      onChordClick(transposeChord(seg.chord, transpose), rect);
                    }}
                  >
                    {convertChordNotation(transposeChord(seg.chord, transpose), notation)}
                  </button>
                ) : (
                  convertChordNotation(transposeChord(seg.chord, transpose), notation)
                )
              ) : (
                <>&nbsp;</>
              )}
            </span>
          )}
          <span className="lyric-text">{seg.lyric || (showChords && seg.chord ? ' ' : '')}</span>
        </span>
      ))}
    </div>
  );
}
