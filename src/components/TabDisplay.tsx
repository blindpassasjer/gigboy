import { useState, useRef, useCallback } from 'react';
import { Play, Repeat, Square } from 'lucide-react';
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
  const [isLooping, setIsLooping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoopingRef = useRef(false);
  // playRef holds the latest startOnce so the timer callback can recurse without stale closures
  const playRef = useRef<() => Promise<void>>();

  const startOnce = useCallback(async () => {
    const durationMs = await playTab(tabLines, 120, transpose);
    if (durationMs > 0) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (isLoopingRef.current) {
          playRef.current?.();
        } else {
          setIsPlaying(false);
        }
      }, durationMs);
    } else {
      setIsPlaying(false);
    }
  }, [tabLines, transpose]);

  playRef.current = startOnce;

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
    await startOnce();
  }, [isPlaying, startOnce]);

  function toggleLoop() {
    const next = !isLooping;
    setIsLooping(next);
    isLoopingRef.current = next;
  }

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
        <div className="tab-playback-controls">
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
          <button
            type="button"
            className={`tab-loop-btn${isLooping ? ' tab-loop-btn--active' : ''}`}
            onClick={toggleLoop}
            title={isLooping ? 'Disable loop' : 'Enable loop'}
          >
            <Repeat size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
