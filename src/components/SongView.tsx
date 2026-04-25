import { useState } from 'react';
import { ChevronUp, ChevronDown, Mic, Music } from 'lucide-react';
import type { Song, Recording } from '../types';
import ChordDisplay from './ChordDisplay';
import AudioPlayer from './AudioPlayer';
import AudioRecorder from './AudioRecorder';
import LanguageBadge from './LanguageBadge';
import { saveRecording, deleteRecording, getRecordings } from '../utils/storage';

interface Props {
  song: Song;
}

export default function SongView({ song }: Props) {
  const [transpose, setTranspose] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [showRecorder, setShowRecorder] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>(() => [
    ...getRecordings(song.id),
    ...(song.recordings ?? []),
  ]);

  function handleSaveRecording(rec: Recording) {
    saveRecording(song.id, rec);
    setRecordings([rec, ...recordings]);
    setShowRecorder(false);
  }

  function handleDeleteRecording(id: string) {
    deleteRecording(song.id, id);
    setRecordings(recordings.filter((r) => r.id !== id));
  }

  return (
    <div className="song-view">
      <div className="song-view-header">
        <div className="song-view-title-block">
          <h1 className="song-view-title">{song.title}</h1>
          {song.artist && <p className="song-view-artist">{song.artist}</p>}
          <div className="song-view-badges">
            <LanguageBadge code={song.language} />
            {song.secondaryLanguages?.map((l) => <LanguageBadge key={l} code={l} />)}
            {song.tags?.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
        </div>

        <div className="song-view-toolbar">
          <div className="transpose-control">
            <button
              onClick={() => setTranspose((t) => t - 1)}
              aria-label="Transpose down"
              className="transpose-btn"
            >
              <ChevronDown size={16} />
            </button>
            <span className="transpose-label">
              {transpose === 0 ? 'Original key' : `${transpose > 0 ? '+' : ''}${transpose}`}
              {song.key ? ` (${song.key})` : ''}
            </span>
            <button
              onClick={() => setTranspose((t) => t + 1)}
              aria-label="Transpose up"
              className="transpose-btn"
            >
              <ChevronUp size={16} />
            </button>
          </div>

          <label className="toggle-label">
            <input
              type="checkbox"
              checked={showChords}
              onChange={(e) => setShowChords(e.target.checked)}
            />
            Show chords
          </label>

          {song.capo !== undefined && song.capo > 0 && (
            <span className="capo-badge">Capo {song.capo}</span>
          )}
          {song.tempo && <span className="meta-pill">♩ {song.tempo} bpm</span>}
          {song.timeSignature && <span className="meta-pill">{song.timeSignature}</span>}
        </div>
      </div>

      <div className="song-view-body">
        <ChordDisplay chordpro={song.chordpro} transpose={transpose} showChords={showChords} />
      </div>

      <section className="recordings-section">
        <div className="recordings-header">
          <h2><Music size={18} /> Recordings</h2>
          <button
            className="rec-btn rec-btn--toggle"
            onClick={() => setShowRecorder((v) => !v)}
          >
            <Mic size={15} /> {showRecorder ? 'Cancel' : 'Record'}
          </button>
        </div>

        {showRecorder && (
          <AudioRecorder onSave={handleSaveRecording} />
        )}

        {recordings.length === 0 && !showRecorder ? (
          <p className="no-recordings">No recordings yet. Press Record to add one.</p>
        ) : (
          <ul className="recordings-list">
            {recordings.map((rec) => (
              <li key={rec.id}>
                <AudioPlayer
                  recording={rec}
                  onDelete={() => handleDeleteRecording(rec.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
