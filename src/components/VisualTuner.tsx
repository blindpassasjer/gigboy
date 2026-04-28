import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface Props {
  targetKey?: string;
  className?: string;
}

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

const NOTE_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function extractRootNote(key?: string): string | null {
  if (!key) return null;

  const trimmed = key.trim();
  const match = trimmed.match(/^([A-Ga-g])([#b]?)/);
  if (!match) return null;

  const normalized = `${match[1].toUpperCase()}${match[2] || ''}`;
  return NOTE_INDEX[normalized] !== undefined ? normalized : null;
}

function autocorrelate(buffer: Float32Array, sampleRate: number): number | null {
  const size = buffer.length;
  let rms = 0;
  for (let i = 0; i < size; i += 1) {
    const value = buffer[i];
    rms += value * value;
  }
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return null;

  let start = 0;
  let end = size - 1;
  const threshold = 0.2;
  for (let i = 0; i < size / 2; i += 1) {
    if (Math.abs(buffer[i]) < threshold) {
      start = i;
      break;
    }
  }

  for (let i = 1; i < size / 2; i += 1) {
    if (Math.abs(buffer[size - i]) < threshold) {
      end = size - i;
      break;
    }
  }

  const clipped = buffer.slice(start, end);
  const clippedSize = clipped.length;
  if (clippedSize < 2) return null;

  const correlations = new Array(clippedSize).fill(0);
  for (let offset = 0; offset < clippedSize; offset += 1) {
    let correlation = 0;
    for (let i = 0; i + offset < clippedSize; i += 1) {
      correlation += clipped[i] * clipped[i + offset];
    }
    correlations[offset] = correlation;
  }

  let dip = 0;
  while (dip + 1 < clippedSize && correlations[dip] > correlations[dip + 1]) {
    dip += 1;
  }

  let peak = dip;
  for (let i = dip; i < clippedSize; i += 1) {
    if (correlations[i] > correlations[peak]) {
      peak = i;
    }
  }

  if (peak <= 0) return null;

  const prev = correlations[peak - 1] ?? correlations[peak];
  const center = correlations[peak] ?? 0;
  const next = correlations[peak + 1] ?? correlations[peak];
  const denominator = 2 * (2 * center - prev - next);
  const shift = denominator !== 0 ? (next - prev) / denominator : 0;
  const period = peak + shift;
  if (period <= 0) return null;

  return sampleRate / period;
}

function frequencyToMidi(frequency: number): number {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

function midiToFrequency(midi: number): number {
  return 440 * (2 ** ((midi - 69) / 12));
}

function centsOff(frequency: number, referenceFrequency: number): number {
  return Math.round(1200 * Math.log2(frequency / referenceFrequency));
}

function closestTargetFrequency(targetNoteIndex: number, frequency: number): number {
  const detectedMidi = frequencyToMidi(frequency);
  let bestFrequency = midiToFrequency(targetNoteIndex + 12 * 4);
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let octave = 0; octave <= 8; octave += 1) {
    const midi = targetNoteIndex + 12 * octave;
    const freq = midiToFrequency(midi);
    const distance = Math.abs(freq - frequency);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestFrequency = freq;
    }
  }

  const candidateMidi = targetNoteIndex + 12 * Math.round(detectedMidi / 12);
  const candidateFrequency = midiToFrequency(candidateMidi);
  if (Math.abs(candidateFrequency - frequency) < Math.abs(bestFrequency - frequency)) {
    return candidateFrequency;
  }

  return bestFrequency;
}

export default function VisualTuner({ targetKey, className = '' }: Props) {
  const rootNote = useMemo(() => extractRootNote(targetKey), [targetKey]);
  const targetNoteIndex = useMemo(() => (rootNote ? NOTE_INDEX[rootNote] : undefined), [rootNote]);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedHz, setDetectedHz] = useState<number | null>(null);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [cents, setCents] = useState<number | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (targetNoteIndex === undefined) {
      setIsListening(false);
      setDetectedHz(null);
      setDetectedNote(null);
      setCents(null);
    }
  }, [targetNoteIndex]);

  useEffect(() => {
    if (!isListening || targetNoteIndex === undefined) return;

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        streamRef.current = stream;
        audioContextRef.current = context;
        analyserRef.current = analyser;
        setError(null);

        const data = new Float32Array(analyser.fftSize);
        const update = () => {
          const activeAnalyser = analyserRef.current;
          const activeContext = audioContextRef.current;
          if (!activeAnalyser || !activeContext) return;

          activeAnalyser.getFloatTimeDomainData(data);
          const frequency = autocorrelate(data, activeContext.sampleRate);

          if (frequency && Number.isFinite(frequency)) {
            const midi = frequencyToMidi(frequency);
            const noteName = NOTE_LABELS[((midi % 12) + 12) % 12];
            const targetFrequency = closestTargetFrequency(targetNoteIndex, frequency);
            setDetectedHz(frequency);
            setDetectedNote(noteName);
            setCents(centsOff(frequency, targetFrequency));
          } else {
            setDetectedHz(null);
            setDetectedNote(null);
            setCents(null);
          }

          rafRef.current = window.requestAnimationFrame(update);
        };

        rafRef.current = window.requestAnimationFrame(update);
      } catch {
        setError('Microphone access denied');
        setIsListening(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [isListening, targetNoteIndex]);

  if (targetNoteIndex === undefined || !rootNote) return null;

  const centsValue = cents ?? 0;
  const clamped = Math.max(-50, Math.min(50, centsValue));
  const needleLeftPercent = ((clamped + 50) / 100) * 100;
  const inTune = Math.abs(centsValue) <= 5;

  return (
    <div className={`visual-tuner ${className}`.trim()}>
      <button
        type="button"
        className="visual-tuner-toggle"
        onClick={() => setIsListening((value) => !value)}
        aria-label={isListening ? 'Stop tuner microphone' : 'Start tuner microphone'}
      >
        {isListening ? <MicOff size={14} /> : <Mic size={14} />}
        {isListening ? 'Stop tuner' : 'Start tuner'}
      </button>

      <div className="visual-tuner-readout">
        <span className="visual-tuner-target">Target {rootNote}</span>
        <span className={`visual-tuner-status${inTune && detectedHz ? ' is-in-tune' : ''}`}>
          {detectedNote ? `${detectedNote} ${centsValue > 0 ? '+' : ''}${centsValue}c` : 'Listening...'}
        </span>
      </div>

      <div className="visual-tuner-gauge" aria-hidden="true">
        <span className="visual-tuner-center" />
        <span className="visual-tuner-needle" style={{ left: `${needleLeftPercent}%` }} />
      </div>

      <div className="visual-tuner-footer">
        <span>{detectedHz ? `${Math.round(detectedHz)}Hz` : '--'}</span>
        {error ? <span className="visual-tuner-error">{error}</span> : <span>{targetKey}</span>}
      </div>
    </div>
  );
}
