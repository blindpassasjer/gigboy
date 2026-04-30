import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface Props {
  className?: string;
}

const NOTE_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const GUITAR_STRINGS = [
  { key: 'E2', label: 'Low E', frequency: 82.41 },
  { key: 'A2', label: 'A', frequency: 110.0 },
  { key: 'D3', label: 'D', frequency: 146.83 },
  { key: 'G3', label: 'G', frequency: 196.0 },
  { key: 'B3', label: 'B', frequency: 246.94 },
  { key: 'E4', label: 'High E', frequency: 329.63 },
] as const;

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

function centsOff(frequency: number, referenceFrequency: number): number {
  return Math.round(1200 * Math.log2(frequency / referenceFrequency));
}

export default function VisualTuner({ className = '' }: Props) {
  const [isListening, setIsListening] = useState(false);
  const [selectedStringIndex, setSelectedStringIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detectedHz, setDetectedHz] = useState<number | null>(null);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [cents, setCents] = useState<number | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isListening) return;

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
            const targetFrequency = GUITAR_STRINGS[selectedStringIndex].frequency;
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
  }, [isListening, selectedStringIndex]);

  const selectedString = GUITAR_STRINGS[selectedStringIndex];
  const centsValue = cents ?? 0;
  const clamped = Math.max(-50, Math.min(50, centsValue));
  const needleLeftPercent = ((clamped + 50) / 100) * 100;
  const hasSignal = detectedHz !== null;
  const inTune = hasSignal && Math.abs(centsValue) <= 5;
  const closeToTune = hasSignal && Math.abs(centsValue) > 5 && Math.abs(centsValue) <= 12;
  const gaugeClass = inTune ? 'is-in-tune' : closeToTune ? 'is-close' : '';
  const tuningCue = !hasSignal
    ? 'Pluck the selected string'
    : inTune
      ? 'In tune'
      : centsValue < 0
        ? 'Pitch up'
        : 'Pitch down';
  const tuningCueClass = !hasSignal
    ? ''
    : inTune
      ? 'is-in-tune'
      : centsValue < 0
        ? 'is-up'
        : 'is-down';
  const centsLabel = hasSignal ? `${centsValue > 0 ? '+' : ''}${centsValue}c` : '--';

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

      <div className="visual-tuner-strings" role="tablist" aria-label="Guitar strings">
        {GUITAR_STRINGS.map((stringInfo, index) => {
          const selected = index === selectedStringIndex;
          return (
            <button
              key={stringInfo.key}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`visual-tuner-string-btn${selected ? ' is-active' : ''}`}
              onClick={() => setSelectedStringIndex(index)}
            >
              {stringInfo.label}
            </button>
          );
        })}
      </div>

      <div className="visual-tuner-readout">
        <span className={`visual-tuner-status${inTune ? ' is-in-tune' : ''}${closeToTune ? ' is-close' : ''}`} aria-live="polite">
          {selectedString.key}
        </span>
        <span className="visual-tuner-detected" aria-live="polite">
          {detectedNote || '--'}
        </span>
      </div>

      <div className="visual-tuner-cue-row" aria-live="polite">
        <span className="visual-tuner-side visual-tuner-side--left">Flat</span>
        <span className={`visual-tuner-cue ${tuningCueClass}`.trim()}>{tuningCue}</span>
        <span className="visual-tuner-side visual-tuner-side--right">Sharp</span>
      </div>

      <div className={`visual-tuner-gauge ${gaugeClass}`.trim()} aria-label="Tuning deviation in cents">
        <span className="visual-tuner-center" />
        <span className="visual-tuner-needle" style={{ left: `${needleLeftPercent}%` }} />
      </div>

      <div className="visual-tuner-footer">
        <span className="visual-tuner-cents">{centsLabel}</span>
        <span className="visual-tuner-target">Target {selectedString.frequency.toFixed(2)} Hz</span>
        {detectedHz ? <span className="visual-tuner-hz">Input {detectedHz.toFixed(2)} Hz</span> : null}
        {error ? <span className="visual-tuner-error">{error}</span> : null}
      </div>

      <div className="visual-tuner-direction-help" aria-hidden="true">
        <span>Flat - tighten (pitch up)</span>
        <span>Sharp - loosen (pitch down)</span>
      </div>
    </div>
  );
}
