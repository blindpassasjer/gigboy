import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Play, Pause, Trash2, Save, X, Pencil, Check } from 'lucide-react';
import { useSongRecordings } from '../hooks/useSongRecordings';
import type { Song } from '../types';
import type { User } from '../context/AuthContext';
import type { RecordingsScope, SongRecording } from '../lib/songRecordings';
import { showConfirmToast } from '../utils/toastDialogs';

const WAVEFORM_SAMPLES = 100;

interface Props {
  song: Song;
  user: User;
  /** Present when viewing a band song — recordings are stored under the band */
  bandId?: string;
}

type RecorderState = 'idle' | 'recording' | 'preview';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDateTime(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RecorderAvatar({ avatar, name }: { avatar: string | null; name: string }) {
  if (avatar) {
    return <span className="rec-avatar rec-avatar--emoji" title={name}>{avatar}</span>;
  }
  const initials = name.trim().slice(0, 1).toUpperCase();
  return <span className="rec-avatar rec-avatar--initials" title={name}>{initials}</span>;
}

interface WaveformProgressProps {
  audioUrl: string;
  progress: number;
  onSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
  ariaLabel: string;
  className?: string;
}

function computeWaveformPeaks(channelData: Float32Array, samples = WAVEFORM_SAMPLES): number[] {
  if (channelData.length === 0) {
    return Array.from({ length: samples }, () => 0.12);
  }

  const blockSize = Math.max(1, Math.floor(channelData.length / samples));
  const peaks = Array.from({ length: samples }, (_, index) => {
    const start = index * blockSize;
    const end = Math.min(channelData.length, start + blockSize);
    let peak = 0;

    for (let cursor = start; cursor < end; cursor += 1) {
      const amplitude = Math.abs(channelData[cursor]);
      if (amplitude > peak) peak = amplitude;
    }

    return peak;
  });

  const maxPeak = Math.max(...peaks, 0.01);

  return peaks.map((peak) => {
    const normalized = peak / maxPeak;
    return Math.max(0.12, normalized * 0.94);
  });
}

function WaveformProgress({ audioUrl, progress, onSeek, ariaLabel, className }: WaveformProgressProps) {
  const [bars, setBars] = useState<number[] | null>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWaveform() {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new AudioContext();

        try {
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          if (cancelled) return;
          setBars(computeWaveformPeaks(audioBuffer.getChannelData(0)));
        } finally {
          void audioContext.close();
        }
      } catch {
        if (!cancelled) {
          setBars(Array.from({ length: WAVEFORM_SAMPLES }, () => 0.3));
        }
      }
    }

    setBars(null);
    void loadWaveform();

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  const waveformBars = bars ?? Array.from({ length: WAVEFORM_SAMPLES }, () => 0.24);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverRatio((e.clientX - rect.left) / rect.width);
  }

  return (
    <div
      className={`waveform-progress${className ? ` ${className}` : ''}`}
      onClick={onSeek}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverRatio(null)}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div className="waveform-progress__bars" aria-hidden="true">
        {waveformBars.map((height, index) => {
          const barRatio = (index + 1) / waveformBars.length;
          const isPlayed = barRatio <= progress;
          const isHovered = !isPlayed && hoverRatio !== null && barRatio <= hoverRatio;

          return (
            <span
              key={`${audioUrl}-${index}`}
              className={`waveform-progress__bar${isPlayed ? ' waveform-progress__bar--played' : isHovered ? ' waveform-progress__bar--hover' : ''}`}
              style={{ height: `${Math.round(height * 100)}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

interface SavedPlayerProps {
  recording: SongRecording;
  currentUserId: string;
  isBandContext: boolean;
  onDelete: (r: SongRecording) => void;
  onRename: (r: SongRecording, newName: string) => void;
}

function SavedPlayer({ recording, currentUserId, isBandContext, onDelete, onRename }: SavedPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      void audioRef.current.play();
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = ratio * (audioRef.current.duration || 0);
  }

  function openRename() {
    setRenameValue(recording.name);
    setRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  function confirmRename() {
    const nextName = renameValue.trim() || recording.name;
    onRename(recording, nextName);
    setRenaming(false);
  }

  function cancelRename() {
    setRenameValue(recording.name);
    setRenaming(false);
  }

  async function confirmDelete() {
    const confirmed = await showConfirmToast(`Delete recording "${recording.name}"? This cannot be undone.`, {
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    onDelete(recording);
  }

  const canRename = !isBandContext || recording.recorder?.userId === currentUserId;
  const canDelete = !isBandContext || recording.recorder?.userId === currentUserId;

  return (
    <li className="audio-player">
      <audio
        ref={audioRef}
        src={recording.downloadUrl}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setProgress(0); }}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (el && el.duration > 0) setProgress(el.currentTime / el.duration);
        }}
      />
      <button className="play-btn" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
      </button>

      <div className="player-info">
        {renaming ? (
          <input
            ref={renameInputRef}
            className="player-name-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={confirmRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename();
              if (e.key === 'Escape') cancelRename();
            }}
            aria-label="Rename recording"
          />
        ) : (
          <span className="player-name" title={recording.name}>{recording.name}</span>
        )}
        <span className="player-date">
          {new Date(recording.createdAt).toLocaleString()} · {formatFileSize(recording.sizeBytes)}
        </span>
      </div>

      <WaveformProgress
        audioUrl={recording.downloadUrl}
        progress={progress}
        onSeek={handleSeek}
        ariaLabel="Seek"
      />

      {isBandContext && recording.recorder && (
        <RecorderAvatar
          avatar={recording.recorder.avatar}
          name={recording.recorder.displayName}
        />
      )}

      {canRename && (
        renaming ? (
          <>
            <button
              className="icon-btn icon-btn--confirm"
              onClick={confirmRename}
              aria-label="Confirm rename"
              title="Confirm"
            >
              <Check size={14} />
            </button>
            <button
              className="icon-btn icon-btn--cancel"
              onClick={cancelRename}
              aria-label="Cancel rename"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <button
            className="icon-btn icon-btn--rename"
            onClick={openRename}
            aria-label={`Rename recording ${recording.name}`}
            title="Rename"
          >
            <Pencil size={14} />
          </button>
        )
      )}

      {canDelete && (
        <button
          className="icon-btn icon-btn--delete"
          onClick={() => {
            void confirmDelete();
          }}
          aria-label={`Delete recording ${recording.name}`}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );
}

export default function SongRecorder({ song, user, bandId }: Props) {
  const isBandContext = Boolean(bandId);

  const scope: RecordingsScope = bandId
    ? { type: 'band', bandId }
    : { type: 'user', ownerId: song.ownerId ?? user.id };

  const { recordings, loading, uploading, uploadError, uploadRecording, deleteRecording, renameRecording } = useSongRecordings({
    scope,
    songId: song.id,
  });

  const [recState, setRecState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [previewDurationMs, setPreviewDurationMs] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [error, setError] = useState<string | null>(uploadError);

  useEffect(() => {
    if (uploadError) {
      setError(uploadError);
    }
  }, [uploadError]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const elapsedStartRef = useRef<number>(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, [stopStream]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        },
      });

      const ctx = new AudioContext({ sampleRate: 48000 });
      const source = ctx.createMediaStreamSource(stream);

      const hpf = ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = 80;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.1;

      const dest = ctx.createMediaStreamDestination();
      source.connect(hpf);
      hpf.connect(limiter);
      limiter.connect(dest);

      streamRef.current = stream;
      audioCtxRef.current = ctx;

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(dest.stream, { mimeType: mime });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const durationMs = Date.now() - elapsedStartRef.current;
        const blob = new Blob(chunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewBlob(blob);
        setPreviewDurationMs(durationMs);
        setPreviewName(`${song.title} - ${formatDateTime(new Date())}`);
        setPreviewProgress(0);
        setIsPreviewPlaying(false);
        setRecState('preview');
        stopStream();
        if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
        setElapsed(0);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      elapsedStartRef.current = Date.now();
      elapsedTimerRef.current = setInterval(() => {
        setElapsed(Date.now() - elapsedStartRef.current);
      }, 500);

      setRecState('recording');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.toLowerCase().includes('denied') ? 'Microphone access denied' : `Mic error: ${msg}`);
    }
  }

  function stopRecording() {
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }

  function discardPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setIsPreviewPlaying(false);
    setPreviewProgress(0);
    setRecState('idle');
  }

  async function saveRecording() {
    if (!previewBlob) return;
    const displayName = user.fullName?.trim() || user.username?.trim() || user.email;
    setError(null);
    try {
      await uploadRecording(
        previewBlob,
        previewName.trim() || `${song.title} - ${formatDateTime(new Date())}`,
        previewDurationMs,
        { userId: user.id, displayName, avatar: user.avatar },
      );
      discardPreview();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save recording';
      setError(message);
    }
  }

  function togglePreviewPlay() {
    if (!previewAudioRef.current) return;
    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
    } else {
      void previewAudioRef.current.play();
    }
  }

  function handlePreviewSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!previewAudioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    previewAudioRef.current.currentTime = ratio * (previewAudioRef.current.duration || 0);
  }

  return (
    <div className="song-recorder">
      {/* ── Controls ─────────────────────────────────── */}
      <div className="recorder-controls">
        {recState === 'idle' && (
          <button className="rec-btn rec-btn--start" onClick={startRecording}>
            <Mic size={14} /> Start recording
          </button>
        )}

        {recState === 'recording' && (
          <div className="recorder-recording-row">
            <span className="recorder-indicator">● REC</span>
            <span className="recorder-elapsed">{formatTime(elapsed)}</span>
            <button className="rec-btn rec-btn--stop" onClick={stopRecording}>
              <MicOff size={14} /> Stop
            </button>
          </div>
        )}

        {recState === 'preview' && previewUrl && (
          <div className="recorder-preview-section">
            <audio
              ref={previewAudioRef}
              src={previewUrl}
              onPlay={() => setIsPreviewPlaying(true)}
              onPause={() => setIsPreviewPlaying(false)}
              onEnded={() => { setIsPreviewPlaying(false); setPreviewProgress(0); }}
              onTimeUpdate={() => {
                const el = previewAudioRef.current;
                if (el && el.duration > 0) setPreviewProgress(el.currentTime / el.duration);
              }}
            />
            <div className="recorder-preview-playback">
              <button
                className="play-btn"
                onClick={togglePreviewPlay}
                aria-label={isPreviewPlaying ? 'Pause preview' : 'Play preview'}
              >
                {isPreviewPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <WaveformProgress
                audioUrl={previewUrl}
                progress={previewProgress}
                onSeek={handlePreviewSeek}
                ariaLabel="Seek preview"
                className="recorder-preview-bar"
              />
            </div>
            <div className="recorder-save-form">
              <input
                className="recorder-name-input"
                value={previewName}
                onChange={(e) => setPreviewName(e.target.value)}
                placeholder="Recording name"
                aria-label="Recording name"
              />
              <div className="recorder-save-actions">
                <button className="rec-btn rec-btn--save" onClick={saveRecording} disabled={uploading}>
                  <Save size={14} /> {uploading ? 'Saving…' : 'Save'}
                </button>
                <button className="rec-btn rec-btn--reset" onClick={discardPreview}>
                  <X size={14} /> Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <p className="recorder-error">{error}</p>}
      </div>

      {/* ── Recordings list ───────────────────────────── */}
      <div className="recordings-section">
        <div className="recordings-header">
          <h2><span>Recordings</span></h2>
        </div>
        {loading ? (
          <p className="no-recordings">Loading…</p>
        ) : recordings.length === 0 ? (
          <p className="no-recordings">No recordings yet</p>
        ) : (
          <ul className="recordings-list">
            {recordings.map((rec) => (
              <SavedPlayer
                key={rec.id}
                recording={rec}
                currentUserId={user.id}
                isBandContext={isBandContext}
                onDelete={deleteRecording}
                onRename={renameRecording}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

