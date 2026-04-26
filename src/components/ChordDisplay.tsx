import { useMemo } from 'react';
import { parseChordPro, lineHasChords, transposeChord } from '../utils/chordParser';
import type { ParsedLine } from '../types';
import type { DiagramInstrument } from './ChordDiagram';

interface Props {
  chordpro: string;
  transpose?: number;
  showChords?: boolean;
  instrument?: DiagramInstrument;
  onChordClick?: (chord: string, rect: DOMRect) => void;
}

export default function ChordDisplay({
  chordpro,
  transpose = 0,
  showChords = true,
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
  onChordClick,
}: {
  line: ParsedLine;
  transpose: number;
  showChords: boolean;
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

  return (
    <div className={`chord-line ${hasChords ? 'chord-line--has-chords' : ''}`}>
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
                      onChordClick(transposeChord(seg.chord, transpose), rect);
                    }}
                  >
                    {transposeChord(seg.chord, transpose)}
                  </button>
                ) : (
                  transposeChord(seg.chord, transpose)
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
