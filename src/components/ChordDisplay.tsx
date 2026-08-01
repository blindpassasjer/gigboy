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
  onChordClick?: (chord: string, rect: DOMRect, element: HTMLElement) => void;
  /**
   * Ids of lines that have a note anchored somewhere on them. These lines are kept from
   * wrapping (and scroll horizontally instead) so a hand-drawn note anchored across several
   * words on the line stays a single straight shape instead of bending across two rows.
   */
  pinnedLineIds?: Set<number>;
  /**
   * Hide {title}/{subtitle}/{artist} directive lines. Callers that already show the song's
   * title/artist elsewhere (e.g. concert mode's header) pass this so the chordpro body
   * doesn't waste page space repeating them above the actual lyrics.
   */
  hideMetaDirectives?: boolean;
}

export default function ChordDisplay({
  chordpro,
  transpose = 0,
  showChords = true,
  notation = 'anglo',
  bpm,
  timeSignature,
  onChordClick,
  pinnedLineIds,
  hideMetaDirectives = false,
}: Props) {
  const lines = useMemo(() => assignLineIds(parseChordPro(chordpro)), [chordpro]);

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
          pinnedLineIds={pinnedLineIds}
          hideMetaDirectives={hideMetaDirectives}
        />
      ))}
    </div>
  );
}

/**
 * Assigns a stable, sequential `lineId` to every positionable line (chord-lyric/empty),
 * in render order including lines nested inside sections. Hand-drawn/text notes anchor
 * to this id so they stay pinned to their lyric line when the layout reflows.
 */
function assignLineIds(lines: ParsedLine[]): ParsedLine[] {
  let counter = 0;
  const assign = (list: ParsedLine[]): ParsedLine[] =>
    list.map((line) => {
      const positioned: ParsedLine = { ...line };
      if (line.type === 'chord-lyric' || line.type === 'empty') {
        positioned.lineId = counter++;
      }
      if (line.sectionLines) {
        positioned.sectionLines = assign(line.sectionLines);
      }
      return positioned;
    });
  return assign(lines);
}

const METADATA_DIRECTIVES = new Set(['key', 'capo', 'tempo', 'time', 'duration']);

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
  onChordClick?: (chord: string, rect: DOMRect, element: HTMLElement) => void;
  pinnedLineIds?: Set<number>;
  hideMetaDirectives?: boolean;
}

function LineRenderer({
  line,
  transpose,
  showChords,
  notation,
  bpm,
  timeSignature,
  onChordClick,
  pinnedLineIds,
  hideMetaDirectives,
}: LineRendererProps) {
  if (line.type === 'empty') {
    return <div className="chord-line chord-line--empty" data-line-id={line.lineId} />;
  }

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
    const label = line.sectionLabel || SECTION_LABELS[line.sectionType ?? ''] || line.sectionType || '';
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
            pinnedLineIds={pinnedLineIds}
            hideMetaDirectives={hideMetaDirectives}
          />
        ))}
      </div>
    );
  }

  if (line.type === 'directive') {
    const dir = line.directive!;
    if (dir === 'title') return hideMetaDirectives ? null : <h2 className="song-title-directive">{line.directiveValue}</h2>;
    if (dir === 'subtitle' || dir === 'artist')
      return hideMetaDirectives ? null : <p className="song-subtitle-directive">{line.directiveValue}</p>;
    // Short-form section labels (e.g. {chorus} without start/end)
    if (dir === 'chorus') return <div className="section-label">Chorus</div>;
    if (dir === 'intro') return <div className="section-label">Intro</div>;
    if (dir === 'verse') return <div className="section-label">Verse</div>;
    if (dir === 'bridge') return <div className="section-label">Bridge</div>;
    if (dir === 'interlude') return <div className="section-label">Interlude</div>;
    if (dir === 'solo') return <div className="section-label">Solo</div>;
    if (dir === 'outro') return <div className="section-label">Outro</div>;
    // Pure metadata directives (key, tempo, capo, etc.) are already surfaced via the
    // song's own fields/toolbar — don't dump their raw value as a stray, unlabeled line.
    if (METADATA_DIRECTIVES.has(dir)) return null;
    if (line.directiveValue) return <div className="section-label">{line.directiveValue}</div>;
    return null;
  }

  // Chord-lyric line
  const segments = line.segments ?? [];
  const hasChords = showChords && lineHasChords(line);
  const isChordOnly = hasChords && segments.every(seg => !seg.lyric.trim());
  const isPinned = line.lineId !== undefined && pinnedLineIds?.has(line.lineId);

  return (
    <div
      className={`chord-line ${hasChords ? 'chord-line--has-chords' : ''} ${isChordOnly ? 'chord-line--chord-only' : ''} ${isPinned ? 'chord-line--pinned' : ''}`}
      data-line-id={line.lineId}
    >
      {segments.map((seg, idx) => (
        <span key={idx} className="chord-segment">
          {showChords && (
            <span className="chord-name">
              {seg.chord ? (
                onChordClick ? (
                  <button
                    className="chord-name-btn"
                    onClick={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      onChordClick(transposeChord(seg.chord, transpose), el.getBoundingClientRect(), el);
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
