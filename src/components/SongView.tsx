import { useState, useRef, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronUp,
  ChevronDown,
  RotateCcw,
  ListPlus,
  Check,
  Plus,
  Printer,
  SquarePen,
  PenLine,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { Song } from '../types';
import ChordDisplay from './ChordDisplay';
import ChordDiagram, { type DiagramInstrument } from './ChordDiagram';
import LanguageBadge from './LanguageBadge';
import VisualMetronome from './VisualMetronome';
import VisualTuner from './VisualTuner';
import { transposeChord } from '../utils/chordParser';
import type { ChordNotation } from '../utils/chordParser';
import { useSongLists } from '../context/SongListsContext';
import { useSongs } from '../context/SongsContext';
import { buildSongSurfaceStyle } from '../utils/songColorStyles';
import { showConfirmToast, showPromptToast } from '../utils/toastDialogs';
import ShareMenu from './ShareMenu';

interface Props {
  song: Song;
  accentColor?: string;
}

interface ActiveChord {
  chord: string;
  rect: DOMRect;
}

export default function SongView({ song, accentColor }: Props) {
  const navigate = useNavigate();
  const [transpose, setTranspose] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [chordInstrument, setChordInstrument] = useState<DiagramInstrument>('guitar');
  const [chordNotation, setChordNotation] = useState<ChordNotation>('anglo');
  const [activeChord, setActiveChord] = useState<ActiveChord | null>(null);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { updateSong, deleteSong } = useSongs();
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

  async function handleRename() {
    const nextTitle = await showPromptToast('Rename song', {
      initialValue: song.title,
      confirmLabel: 'Rename',
    });
    if (nextTitle === null) return;
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === song.title) return;
    const err = await updateSong({
      ...song,
      title: trimmed,
      updatedAt: new Date().toISOString(),
    });
    if (err) {
      toast.error(`Could not rename song: ${err}`);
    }
  }

  async function handleDelete() {
    const confirmed = await showConfirmToast(`Delete "${song.title}"? This cannot be undone.`, {
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    await deleteSong(song.id);
    navigate('/');
  }

  const headerStyle = accentColor
    ? ({
      ...buildSongSurfaceStyle(accentColor),
      '--song-header-accent': accentColor,
    } as CSSProperties)
    : undefined;

  return (
    <div className="song-view">
      <div className="song-view-header" style={headerStyle}>
        <div className="song-view-title-block">
          <div className="song-view-title-row">
            <h1 className="song-view-title">{song.title}</h1>
            <button
              className="song-action-btn song-action-btn--rename"
              onClick={handleRename}
              title={`Rename ${song.title}`}
              aria-label={`Rename ${song.title}`}
            >
              <PenLine size={14} />
            </button>
          </div>
          {song.artist && <p className="song-view-artist">{song.artist}</p>}
          <div className="song-view-badges">
            <LanguageBadge code={song.language} />
            {song.secondaryLanguages?.map((l) => <LanguageBadge key={l} code={l} />)}
            {song.tags?.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
        </div>

        <div className="song-view-toolbar">
          <div className="song-toolbar-row song-toolbar-row--controls">
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

            <div className="instrument-toggle">
              <button
                className={`instrument-toggle-btn${chordNotation === 'anglo' ? ' instrument-toggle-btn--active' : ''}`}
                onClick={() => setChordNotation('anglo')}
              >
                C D E
              </button>
              <button
                className={`instrument-toggle-btn${chordNotation === 'spanish' ? ' instrument-toggle-btn--active' : ''}`}
                onClick={() => setChordNotation('spanish')}
              >
                Do Re Mi
              </button>
            </div>
          </div>

          <div className="song-toolbar-row song-toolbar-row--meta">
            {song.capo !== undefined && song.capo > 0 && (
              <span className="capo-badge">Capo {song.capo}</span>
            )}
            <VisualMetronome
              tempo={song.tempo}
              timeSignature={song.timeSignature}
              className="song-view-metronome"
            />
            <VisualTuner
              targetKey={song.key ? (transpose === 0 ? song.key : transposeChord(song.key, transpose)) : undefined}
              className="song-view-tuner"
            />
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
                            if (inList) {
                              removeSongFromList(list.id, song.id);
                            } else {
                              addSongToList(list.id, song.id);
                            }
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

          <div className="song-toolbar-row song-toolbar-row--actions">
            <div className="song-actions">
              <button
                className="song-action-btn song-action-btn--edit"
                onClick={() => navigate(`/songs/${song.id}/edit`)}
                title={`Edit ${song.title}`}
                aria-label={`Edit ${song.title}`}
              >
                <SquarePen size={14} />
              </button>
              <button
                className="song-action-btn song-action-btn--print"
                onClick={() => window.print()}
                title="Print / Save as PDF"
                aria-label="Print or save as PDF"
              >
                <Printer size={14} />
              </button>
              <ShareMenu
                resourceType="song"
                resourceId={song.id}
                resourceName={song.title}
                songsForPdf={[song]}
                buttonClassName="song-action-btn song-action-btn--print"
                buttonTitle={`Share ${song.title}`}
                iconOnly
              />
              <button
                className="song-action-btn song-action-btn--delete"
                onClick={handleDelete}
                title={`Delete ${song.title}`}
                aria-label={`Delete ${song.title}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="song-view-body">
        <ChordDisplay
          chordpro={song.chordpro}
          transpose={transpose}
          showChords={showChords}
          notation={chordNotation}
          timeSignature={song.timeSignature}
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
