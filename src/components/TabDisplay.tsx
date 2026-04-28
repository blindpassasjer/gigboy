import { useState, useRef, useCallback } from 'react';
import { Play, Square } from 'lucide-react';
import { playTab, stopPlayback } from '../lib/midiPlayer';
import { buildBeatGuide } from '../utils/tabParser';

interface Props {
  tabLines: string[];
  transpose?: number;
  timeSignature?: string;
  showPlayback?: boolean;
}

function extractLinePrefix(line: string): { prefix: string; content: string } {
  const match = line.match(/^[eEbBgGdDaA]\s*[|:]\s*/);
  if (!match) return { prefix: '', content: line };
  return { prefix: match[0], content: line.slice(match[0].length) };
}

export default function TabDisplay({
  tabLines,
  transpose = 0,
  timeSignature,
  showPlayback = true,
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      stopPlayback();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    const durationMs = await playTab(tabLines, 120, transpose);

    if (durationMs > 0) {
      timerRef.current = setTimeout(() => {
        setIsPlaying(false);
        timerRef.current = null;
      }, durationMs);
    } else {
      setIsPlaying(false);
    }
  }, [tabLines, isPlaying, transpose]);

  const split = tabLines.map(extractLinePrefix);
  const maxContentLength = split.reduce((max, line) => Math.max(max, line.content.length), 0);
  const firstPrefix = split[0]?.prefix ?? '';
  const guide = buildBeatGuide(maxContentLength, timeSignature);
  const displayLines = split.map(({ prefix, content }) => `${prefix}${content.padEnd(maxContentLength, '-')}`);

  return (
    <div className="tab-block">
      <pre className="tab-content">
        <span className="tab-guide-line">{`${firstPrefix}${guide}`}</span>
        {'\n'}
        {displayLines.join('\n')}
      </pre>
      {showPlayback && (
        <button
          type="button"
          className={`tab-play-btn${isPlaying ? ' tab-play-btn--playing' : ''}`}
          onClick={handlePlay}
          title={isPlaying ? 'Stop playback' : 'Play tab'}
        >
          {isPlaying
            ? <Square size={12} fill="currentColor" />
            : <Play size={12} fill="currentColor" />}
          {isPlaying ? 'Stop' : 'Play'}
        </button>
      )}
    </div>
  );
}
