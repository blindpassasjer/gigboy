import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, RotateCcw, ListPlus, Check, Plus } from 'lucide-react';
import type { Song } from '../types';
import ChordDisplay from './ChordDisplay';
import ChordDiagram, { type DiagramInstrument } from './ChordDiagram';
import LanguageBadge from './LanguageBadge';
import { transposeChord } from '../utils/chordParser';
import { useSongLists } from '../context/SongListsContext';

interface Props {
  song: Song;
}

interface ActiveChord {
  chord: string;
  rect: DOMRect;
}

export default function SongView({ song }: Props) {
  const [transpose, setTranspose] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [chordInstrument, setChordInstrument] = useState<DiagramInstrument>('guitar');
  const [activeChord, setActiveChord] = useState<ActiveChord | null>(null);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { songLists, addSongToList, removeSongFromList } = useSongLists();

  useEffect(() => {
    if (!listMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setListMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [listMenuOpen]);

  // Close chord diagram when song changes
  useEffect(() => { setActiveChord(null); }, [song.id]);

  const handleChordClick = useCallback((chord: string, rect: DOMRect) => {
    setActiveChord(prev =>
      prev?.chord === chord && prev.rect.top === rect.top ? null : { chord, rect }
    );
  }, []);

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
              {song.key
                ? transpose === 0
                  ? `Key of ${song.key}`
                  : `Key of ${transposeChord(song.key, transpose)}`
                : transpose === 0
                  ? 'Original key'
                  : `${transpose > 0 ? '+' : ''}${transpose} semitones`}
            </span>
            <button
              onClick={() => setTranspose((t) => t + 1)}
              aria-label="Transpose up"
              className="transpose-btn"
            >
              <ChevronUp size={16} />
            </button>
            {transpose !== 0 && (
              <button
                onClick={() => setTranspose(0)}
                aria-label="Reset transpose"
                className="transpose-btn transpose-btn--reset"
                title="Reset to original key"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>

          <label className="toggle-label">
            <input
              type="checkbox"
              checked={showChords}
              onChange={(e) => {
                setShowChords(e.target.checked);
                if (!e.target.checked) setActiveChord(null);
              }}
            />
            Show chords
          </label>

          {showChords && (
            <div className="instrument-toggle">
              <button
                className={`instrument-toggle-btn${chordInstrument === 'guitar' ? ' instrument-toggle-btn--active' : ''}`}
                onClick={() => { setChordInstrument('guitar'); setActiveChord(null); }}
              >
                Guitar
              </button>
              <button
                className={`instrument-toggle-btn${chordInstrument === 'piano' ? ' instrument-toggle-btn--active' : ''}`}
                onClick={() => { setChordInstrument('piano'); setActiveChord(null); }}
              >
                Piano
              </button>
            </div>
          )}

          {song.capo !== undefined && song.capo > 0 && (
            <span className="capo-badge">Capo {song.capo}</span>
          )}
          {song.tempo && <span className="meta-pill">♩ {song.tempo} bpm</span>}
          {song.timeSignature && <span className="meta-pill">{song.timeSignature}</span>}

          <div className="add-to-list-wrap" ref={menuRef}>
            <button
              className="rec-btn rec-btn--toggle"
              onClick={() => setListMenuOpen((v) => !v)}
              title="Add to song list"
            >
              <ListPlus size={15} /> Lists
            </button>
            {listMenuOpen && (
              <div className="list-dropdown">
                {songLists.length === 0 ? (
                  <p className="list-dropdown-empty">No lists yet — create one in the sidebar</p>
                ) : (
                  songLists.map((list) => {
                    const inList = list.songIds.includes(song.id);
                    return (
                      <button
                        key={list.id}
                        className={`list-dropdown-item${inList ? ' in-list' : ''}`}
                        onClick={() => {
                          inList
                            ? removeSongFromList(list.id, song.id)
                            : addSongToList(list.id, song.id);
                        }}
                      >
                        {inList ? <Check size={13} /> : <Plus size={13} />}
                        {list.name}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="song-view-body">
        <ChordDisplay
          chordpro={song.chordpro}
          transpose={transpose}
          showChords={showChords}
          instrument={chordInstrument}
          onChordClick={showChords ? handleChordClick : undefined}
        />
      </div>

      {activeChord && (
        <ChordDiagram
          chord={activeChord.chord}
          instrument={chordInstrument}
          anchorRect={activeChord.rect}
          onClose={() => setActiveChord(null)}
        />
      )}
    </div>
  );
}
