import { useState, useRef, useCallback } from 'react';

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'stopped' | 'error';

export interface UseAudioRecorderReturn {
  state: RecorderState;
  elapsedSeconds: number;
  audioBlob: Blob | null;
  mimeType: string;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  error: string | null;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState('audio/webm');
  const [error, setError] = useState<string | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stream = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    try {
      setState('requesting');
      setError(null);
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = ms;

      const preferredType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(
        (t) => MediaRecorder.isTypeSupported(t)
      ) ?? '';
      setMimeType(preferredType || 'audio/webm');

      const mr = new MediaRecorder(ms, preferredType ? { mimeType: preferredType } : undefined);
      mediaRecorder.current = mr;
      chunks.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: preferredType || 'audio/webm' });
        setAudioBlob(blob);
        stream.current?.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setState('stopped');
      };

      mr.start(250);
      setState('recording');
      setElapsedSeconds(0);
      timer.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied');
      setState('error');
    }
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setAudioBlob(null);
    setElapsedSeconds(0);
    setError(null);
    setState('idle');
  }, [stop]);

  return { state, elapsedSeconds, audioBlob, mimeType, start, stop, reset, error };
}
