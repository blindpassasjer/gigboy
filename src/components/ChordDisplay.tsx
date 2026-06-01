import { useMemo } from 'react';
import { parseChordPro, lineHasChords, transposeChord, convertChordNotation } from '../utils/chordParser';
import type { ChordNotation } from '../utils/chordParser';
import type { ParsedLine } from '../types';
import type { DiagramInstrument } from './ChordDiagram';
import TabDisplay from './TabDisplay';

interface Props {
  chordpro: string;
  transpose?: number;
  showChords?: boolean;
  notation?: ChordNotation;
  bpm?: number;
  timeSignature?: string;
  instrument?: DiagramInstrument;
  onChordClick?: (chord: string, rect: DOMRect) => void;
}

export default function ChordDisplay({
  chordpro,
  transpose = 0,
  showChords = true,
  notation = 'anglo',
  bpm,
  timeSignature,
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
          bpm={bpm}
          timeSignature={timeSignature}
          onChordClick={onChordClick}
        />
      ))}
    </div>
  );
}

const SECTION_LABELS: Record<string, string> = {
  verse: 'Verse',
  chorus: 'Chorus',
  intro: 'Intro',
  bridge: 'Bridge',
  pre_chorus: 'Pre-Chorus',
  interlude: 'Interlude',
  solo: 'Solo',
  outro: 'Outro',
};

interface LineRendererProps {
  line: ParsedLine;
  transpose: number;
  showChords: boolean;
  notation: ChordNotation;
  bpm?: number;
  timeSignature?: string;
  onChordClick?: (chord: string, rect: DOMRect) => void;
}

function LineRenderer({
  line,
  transpose,
  showChords,
  notation,
  bpm,
  timeSignature,
  onChordClick,
}: LineRendererProps) {
  if (line.type === 'empty') return <div className="chord-line chord-line--empty" />;

  if (line.type === 'comment') return null;

  if (line.type === 'tab') {
    return (
      <TabDisplay
        tabLines={line.tabLines ?? []}
        transpose={transpose}
        bpm={bpm}
        timeSignature={timeSignature}
      />
    );
  }

  if (line.type === 'section') {
    const label = SECTION_LABELS[line.sectionType ?? ''] ?? line.sectionType ?? '';
    return (
      <div className={`chord-section chord-section--${line.sectionType}`}>
        {label && <div className="section-label">{label}</div>}
        {line.sectionLines?.map((subline, j) => (
          <LineRenderer
            key={j}
            line={subline}
            transpose={transpose}
            showChords={showChords}
            notation={notation}
            bpm={bpm}
            timeSignature={timeSignature}
            onChordClick={onChordClick}
          />
        ))}
      </div>
    );
  }

  if (line.type === 'directive') {
    const dir = line.directive!;
    if (dir === 'title') return <h2 className="song-title-directive">{line.directiveValue}</h2>;
    if (dir === 'subtitle' || dir === 'artist')
      return <p className="song-subtitle-directive">{line.directiveValue}</p>;
    // Short-form section labels (e.g. {chorus} without start/end)
    if (dir === 'chorus') return <div className="section-label">Chorus</div>;
    if (dir === 'intro') return <div className="section-label">Intro</div>;
    if (dir === 'verse') return <div className="section-label">Verse</div>;
    if (dir === 'bridge') return <div className="section-label">Bridge</div>;
    if (dir === 'interlude') return <div className="section-label">Interlude</div>;
    if (dir === 'solo') return <div className="section-label">Solo</div>;
    if (dir === 'outro') return <div className="section-label">Outro</div>;
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
