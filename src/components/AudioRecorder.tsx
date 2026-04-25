import { useState } from 'react';
import { Mic, Square, Save, RotateCcw } from 'lucide-react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import type { Recording } from '../types';

interface Props {
  onSave: (recording: Recording) => void;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AudioRecorder({ onSave }: Props) {
  const { state, elapsedSeconds, audioBlob, mimeType, start, stop, reset, error } =
    useAudioRecorder();
  const [name, setName] = useState('');

  function handleSave() {
    if (!audioBlob) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      const recording: Recording = {
        id: crypto.randomUUID(),
        name: name.trim() || `Recording ${new Date().toLocaleString()}`,
        createdAt: new Date().toISOString(),
        data: base64,
        mimeType,
        durationSeconds: elapsedSeconds,
      };
      onSave(recording);
      reset();
      setName('');
    };
    reader.readAsDataURL(audioBlob);
  }

  return (
    <div className="audio-recorder">
      <h3 className="recorder-title">Record Audio</h3>

      {error && <p className="recorder-error">{error}</p>}

      <div className="recorder-controls">
        {(state === 'idle' || state === 'error') && (
          <button className="rec-btn rec-btn--start" onClick={start}>
            <Mic size={16} /> Start Recording
          </button>
        )}

        {state === 'requesting' && (
          <span className="recorder-status">Requesting microphone…</span>
        )}

        {state === 'recording' && (
          <>
            <span className="recorder-indicator">● REC {formatTime(elapsedSeconds)}</span>
            <button className="rec-btn rec-btn--stop" onClick={stop}>
              <Square size={16} /> Stop
            </button>
          </>
        )}

        {state === 'stopped' && audioBlob && (
          <div className="recorder-save-form">
            <audio
              controls
              src={URL.createObjectURL(audioBlob)}
              className="recorder-preview"
            />
            <input
              type="text"
              placeholder="Recording name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="recorder-name-input"
            />
            <div className="recorder-save-actions">
              <button className="rec-btn rec-btn--save" onClick={handleSave}>
                <Save size={16} /> Save
              </button>
              <button className="rec-btn rec-btn--reset" onClick={() => { reset(); setName(''); }}>
                <RotateCcw size={16} /> Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
