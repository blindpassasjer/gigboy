import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Trash2 } from 'lucide-react';
import type { Recording } from '../types';

interface Props {
  recording: Recording;
  onDelete?: () => void;
}

export default function AudioPlayer({ recording, onDelete }: Props) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(`data:${recording.mimeType};base64,${recording.data}`);
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [recording]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
  }

  const date = new Date(recording.createdAt).toLocaleDateString();

  return (
    <div className="audio-player">
      <button className="play-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="player-info">
        <span className="player-name">{recording.name}</span>
        <span className="player-date">{date}</span>
      </div>
      <div className="progress-bar" onClick={seek} role="slider" aria-valuenow={Math.round(progress * 100)}>
        <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      {onDelete && (
        <button className="delete-btn" onClick={onDelete} aria-label="Delete recording">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
