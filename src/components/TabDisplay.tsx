import { useState, useRef, useCallback, useEffect } from 'react';
import { Pencil, Play, Repeat, Square } from 'lucide-react';
import { playTab, stopPlayback, preloadSampler } from '../lib/midiPlayer';

interface Props {
  tabLines: string[];
  transpose?: number;
  bpm?: number;
  timeSignature?: string;
  showPlayback?: boolean;
  onEdit?: () => void;
}

function extractLinePrefix(line: string): { prefix: string; content: string } {
  const match = line.match(/^[eEbBgGdDaA]\s*[|:]\s*/);
  if (!match) return { prefix: '', content: line.replace(/\|$/, '') };
  return { prefix: match[0], content: line.slice(match[0].length).replace(/\|$/, '') };
}


export default function TabDisplay({
  tabLines,
  transpose = 0,
  bpm = 120,
  timeSignature,
  showPlayback = true,
  onEdit,
}: Props) {
  useEffect(() => { void preloadSampler(); }, []);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoopingRef = useRef(false);
  // playRef holds the latest startOnce so the timer callback can recurse without stale closures
  const playRef = useRef<() => Promise<void>>();

  const startOnce = useCallback(async () => {
    const durationMs = await playTab(tabLines, bpm, transpose);
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
  const contents = split.map(({ content }) => content);
  const maxContentLength = contents.reduce((max, c) => Math.max(max, c.length), 0);
  const displayLines = split.map(({ prefix, content }) => `${prefix}${content.padEnd(maxContentLength, '-')}`);

  return (
    <div className="tab-block">
      <pre className="tab-content">
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
          {onEdit && (
            <button
              type="button"
              className="tab-edit-btn"
              onClick={onEdit}
              title="Edit tab"
            >
              <Pencil size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
