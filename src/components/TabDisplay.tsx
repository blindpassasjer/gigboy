import { useState, useRef, useCallback } from 'react';
import { Play, Square } from 'lucide-react';
import { playTab, stopPlayback } from '../lib/midiPlayer';

interface Props {
  tabLines: string[];
  transpose?: number;
}

export default function TabDisplay({ tabLines, transpose = 0 }: Props) {
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

  return (
    <div className="tab-block">
      <pre className="tab-content">{tabLines.join('\n')}</pre>
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
    </div>
  );
}
