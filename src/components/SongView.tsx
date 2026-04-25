import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { Song } from '../types';
import ChordDisplay from './ChordDisplay';
import LanguageBadge from './LanguageBadge';

interface Props {
  song: Song;
}

export default function SongView({ song }: Props) {
  const [transpose, setTranspose] = useState(0);
  const [showChords, setShowChords] = useState(true);

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
    </div>
  );
}
