import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface Props {
  className?: string;
}

const NOTE_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

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

function midiToFrequency(midi: number): number {
  return 440 * (2 ** ((midi - 69) / 12));
}

export default function VisualTuner({ className = '' }: Props) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedHz, setDetectedHz] = useState<number | null>(null);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [detectedOctave, setDetectedOctave] = useState<number | null>(null);
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
            const octave = Math.floor(midi / 12) - 1;
            const targetFrequency = midiToFrequency(midi);
            setDetectedHz(frequency);
            setDetectedNote(noteName);
            setDetectedOctave(octave);
            setCents(centsOff(frequency, targetFrequency));
          } else {
            setDetectedHz(null);
            setDetectedNote(null);
            setDetectedOctave(null);
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
  }, [isListening]);

  const centsValue = cents ?? 0;
  const clamped = Math.max(-50, Math.min(50, centsValue));
  const needleLeftPercent = ((clamped + 50) / 100) * 100;
  const hasSignal = detectedHz !== null;
  const inTune = hasSignal && Math.abs(centsValue) <= 5;
  const tuningCue = !hasSignal
    ? 'Play a note'
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
  const centsLabel = hasSignal ? `${centsValue > 0 ? '+' : ''}${centsValue} cents` : '-- cents';
  const detectedLabel = detectedNote ? `${detectedNote}${detectedOctave ?? ''}` : '--';

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
        <span className="visual-tuner-label" aria-hidden="true">Note</span>
        <span className={`visual-tuner-status${inTune ? ' is-in-tune' : ''}`} aria-live="polite">
          {detectedLabel}
        </span>
        <span className="visual-tuner-cents" aria-live="polite">
          {centsLabel}
        </span>
      </div>

      <div className="visual-tuner-cue-row" aria-live="polite">
        <span className="visual-tuner-side">Flat</span>
        <span className={`visual-tuner-cue ${tuningCueClass}`.trim()}>{tuningCue}</span>
        <span className="visual-tuner-side">Sharp</span>
      </div>

      <div className={`visual-tuner-gauge${inTune ? ' is-in-tune' : ''}`.trim()} aria-label="Tuning deviation in cents">
        <span className="visual-tuner-center" />
        <span className="visual-tuner-needle" style={{ left: `${needleLeftPercent}%` }} />
      </div>

      {detectedHz ? <div className="visual-tuner-hz">{detectedHz.toFixed(1)} Hz</div> : null}
      {error ? <div className="visual-tuner-error">{error}</div> : null}
    </div>
  );
}
