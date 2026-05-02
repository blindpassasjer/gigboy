import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AudioLines,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  List,
  Metronome,
  Play,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useSetlists } from '../context/SetlistsContext';
import { useSongs } from '../context/SongsContext';
import type { Song } from '../types';
import LanguageBadge from '../components/LanguageBadge';
import ChordDisplay from '../components/ChordDisplay';
import ChordDiagram, { type DiagramInstrument } from '../components/ChordDiagram';
import SongMediaPlayer from '../components/SongMediaPlayer';
import VisualMetronome from '../components/VisualMetronome';
import VisualTuner from '../components/VisualTuner';
import type { ChordNotation } from '../utils/chordParser';
import { transposeChord } from '../utils/chordParser';
import { parseSongMedia } from '../utils/songMedia';

interface ActiveChord {
  chord: string;
  rect: DOMRect;
}

export default function SetlistConcertPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { setlists } = useSetlists();
  const { songs } = useSongs();

  const setlist = useMemo(() => setlists.find((entry) => entry.id === id) ?? null, [id, setlists]);
  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs]);
  const setlistSongs = useMemo(
    () => (setlist?.songIds ?? [])
      .map((songId) => songsById.get(songId))
      .filter((song): song is Song => Boolean(song)),
    [setlist?.songIds, songsById]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [transpose, setTranspose] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [chordInstrument, setChordInstrument] = useState<DiagramInstrument>('guitar');
  const [chordNotation, setChordNotation] = useState<ChordNotation>('anglo');
  const [activeChord, setActiveChord] = useState<ActiveChord | null>(null);
  const [showTopbar, setShowTopbar] = useState(false);
  const [showSongNavigator, setShowSongNavigator] = useState(true);
  const [showMetronome, setShowMetronome] = useState(false);
  const [showTuner, setShowTuner] = useState(false);
  const [showMediaPlayer, setShowMediaPlayer] = useState(false);
  const [autoPlayMediaOnOpen, setAutoPlayMediaOnOpen] = useState(false);
  const songScrollRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setCurrentIndex((current) => {
      if (setlistSongs.length === 0) return 0;
      return Math.min(Math.max(current, 0), setlistSongs.length - 1);
    });
  }, [setlistSongs.length]);

  useEffect(() => {
    setShowMediaPlayer(false);
    setAutoPlayMediaOnOpen(false);
    if (songScrollRef.current) {
      songScrollRef.current.scrollTop = 0;
    }
    setActiveChord(null);
  }, [currentIndex]);

  const handleStopConcert = useCallback(async () => {
    navigate('/');
  }, [navigate]);

  const goToSong = useCallback((index: number) => {
    setCurrentIndex(Math.min(Math.max(index, 0), setlistSongs.length - 1));
  }, [setlistSongs.length]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((current) => Math.max(current - 1, 0));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((current) => Math.min(current + 1, setlistSongs.length - 1));
  }, [setlistSongs.length]);

  const onSwipeStart = useCallback((e: React.PointerEvent) => {
    swipeRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onSwipeEnd = useCallback((e: React.PointerEvent) => {
    if (!swipeRef.current) return;
    const dx = e.clientX - swipeRef.current.x;
    const dy = e.clientY - swipeRef.current.y;
    swipeRef.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) goToNext();
    else goToPrevious();
  }, [goToNext, goToPrevious]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToNext();
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPrevious();
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setTranspose((value) => value + 1);
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setTranspose((value) => value - 1);
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setShowSongNavigator((value) => !value);
      }

    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToNext, goToPrevious]);

  if (!setlist) {
    return (
      <div className="not-found">
        <p>Setlist not found.</p>
        <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to songs</Link>
      </div>
    );
  }

  if (setlistSongs.length === 0) {
    return (
      <div className="not-found">
        <p>This setlist has no songs yet.</p>
        <button type="button" className="setlist-action-btn" onClick={() => navigate('/')}>Back to setlist</button>
      </div>
    );
  }

  const currentSong = setlistSongs[currentIndex] ?? setlistSongs[0];
  if (!currentSong) {
    return (
      <div className="not-found">
        <p>Could not load song for concert mode.</p>
        <button type="button" className="setlist-action-btn" onClick={() => navigate('/')}>Back to setlist</button>
      </div>
    );
  }

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < setlistSongs.length - 1;
  const media = currentSong.playbackUrl ? parseSongMedia(currentSong.playbackUrl) : null;

  return (
    <section className="concert-mode">
      <div className={`concert-topbar-toggle-row${showTopbar ? ' concert-topbar-toggle-row--with-topbar' : ''}`}>
        <button
          type="button"
          className="concert-chip-btn concert-topbar-toggle-btn"
          onClick={() => setShowTopbar((v) => !v)}
          aria-label={showTopbar ? 'Hide toolbar' : 'Show toolbar'}
        >
          <SlidersHorizontal size={14} />
          {showTopbar ? 'Hide toolbar' : 'Show toolbar'}
        </button>
        <button
          type="button"
          className="concert-chip-btn"
          onClick={() => setShowSongNavigator((value) => !value)}
          aria-label={showSongNavigator ? 'Hide song navigator' : 'Show song navigator'}
        >
          <List size={14} />
          {showSongNavigator ? 'Hide songs' : 'Show songs'}
        </button>
        <button
          type="button"
          className="concert-chip-btn concert-chip-btn--danger"
          onClick={() => { void handleStopConcert(); }}
          aria-label="Stop concert mode"
        >
          <X size={14} /> Stop Concert
        </button>
      </div>
      {showTopbar && (
      <header className="concert-topbar">
        <div className="concert-topbar-main">
          <Link to="/" className="back-link concert-back-link"><ArrowLeft size={15} /> Back</Link>
          <h1>{setlist.name}</h1>
          <p>
            Song {currentIndex + 1} of {setlistSongs.length}
            <span className="concert-shortcut-hint">Use left/right arrows for next song</span>
          </p>
        </div>

        <div className="song-view-toolbar concert-song-view-toolbar">
          <section className="song-toolbar-section song-toolbar-section--settings">
            <div className="song-toolbar-section-head">
              <h2 className="song-toolbar-section-title"><SlidersHorizontal size={14} /> Settings</h2>
            </div>

            <div className="song-toolbar-row song-toolbar-row--controls">
              <div className="transpose-control song-toolbar-controls-group">
                <button
                  onClick={() => setTranspose((value) => value - 1)}
                  aria-label="Transpose down"
                  className="transpose-btn song-toolbar-tool-btn song-toolbar-setting-btn"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="transpose-label song-toolbar-tool-btn song-toolbar-setting-label">
                  {currentSong.key
                    ? transpose === 0
                      ? `Key of ${currentSong.key}`
                      : `Key of ${transposeChord(currentSong.key, transpose)}`
                    : transpose === 0
                      ? 'Original key'
                      : `${transpose > 0 ? '+' : ''}${transpose} semitones`}
                </span>
                <button
                  onClick={() => setTranspose((value) => value + 1)}
                  aria-label="Transpose up"
                  className="transpose-btn song-toolbar-tool-btn song-toolbar-setting-btn"
                >
                  <ChevronRight size={16} />
                </button>
                {transpose !== 0 && (
                  <button
                    onClick={() => setTranspose(0)}
                    aria-label="Reset transpose"
                    className="transpose-btn transpose-btn--reset song-toolbar-tool-btn song-toolbar-setting-btn"
                    title="Reset to original key"
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
              </div>

              <button
                type="button"
                className={`song-toolbar-tool-btn${showChords ? ' song-toolbar-tool-btn--active' : ''}`}
                onClick={() => {
                  setShowChords((prev) => {
                    const next = !prev;
                    if (!next) setActiveChord(null);
                    return next;
                  });
                }}
                aria-label={showChords ? 'Hide chords' : 'Show chords'}
                title={showChords ? 'Hide chords' : 'Show chords'}
              >
                Chords
              </button>

              {showChords && (
                <>
                  <div className="instrument-toggle song-toolbar-controls-group">
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

                  <div className="instrument-toggle song-toolbar-controls-group">
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
                </>
              )}
            </div>
          </section>

          <section className="song-toolbar-section song-toolbar-section--tools">
            <div className="song-toolbar-section-head">
              <h2 className="song-toolbar-section-title"><List size={14} /> Tools</h2>
            </div>

            <div className="song-toolbar-row song-toolbar-row--tool-switches">
              <button
                type="button"
                className={`song-toolbar-tool-btn${showTuner ? ' song-toolbar-tool-btn--active' : ''}`}
                onClick={() => setShowTuner((value) => !value)}
                title={showTuner ? 'Hide tuner' : 'Show tuner'}
                aria-label={showTuner ? 'Hide tuner' : 'Show tuner'}
              >
                <AudioLines size={14} />
                Tuner
              </button>

              <button
                type="button"
                className={`song-toolbar-tool-btn${showMetronome ? ' song-toolbar-tool-btn--active' : ''}`}
                onClick={() => setShowMetronome((value) => !value)}
                title={showMetronome ? 'Hide metronome' : 'Show metronome'}
                aria-label={showMetronome ? 'Hide metronome' : 'Show metronome'}
              >
                <Metronome size={14} />
                Metronome
              </button>

              {media && (
                <button
                  type="button"
                  className={`song-toolbar-tool-btn${showMediaPlayer ? ' song-toolbar-tool-btn--active' : ''}`}
                  onClick={() => {
                    setShowMediaPlayer((value) => {
                      const next = !value;
                      if (next) setAutoPlayMediaOnOpen(true);
                      return next;
                    });
                  }}
                  title={showMediaPlayer ? 'Hide playback' : 'Open playback and play'}
                  aria-label={showMediaPlayer ? 'Hide playback' : 'Open playback and play'}
                >
                  <Play size={14} />
                  Playback
                </button>
              )}
            </div>

            {(showTuner || showMetronome || (media && showMediaPlayer && currentSong.playbackUrl)) && (
              <div className="song-toolbar-tools-grid concert-toolbar-tools-grid">
                {showTuner && (
                  <div className="song-toolbar-tool-card">
                    <span className="song-toolbar-tool-card-title">
                      <AudioLines size={13} />
                      Tuner
                    </span>
                    <VisualTuner className="song-view-tuner" />
                  </div>
                )}

                {showMetronome && (
                  <div className="song-toolbar-tool-card">
                    <span className="song-toolbar-tool-card-title">
                      <Metronome size={13} />
                      Metronome
                    </span>
                    <VisualMetronome
                      tempo={currentSong.tempo}
                      timeSignature={currentSong.timeSignature}
                      className="song-view-metronome"
                    />
                  </div>
                )}

                {media && showMediaPlayer && currentSong.playbackUrl && (
                  <div className="song-toolbar-tool-card song-toolbar-tool-card--media">
                    <span className="song-toolbar-tool-card-title">Playback</span>
                    <SongMediaPlayer
                      mediaUrl={currentSong.playbackUrl}
                      autoPlay={autoPlayMediaOnOpen}
                      onAutoPlayHandled={() => setAutoPlayMediaOnOpen(false)}
                    />
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </header>
      )}

      <div className={`concert-content-wrap${showSongNavigator ? '' : ' concert-content-wrap--full'}`}>
        <article
          className="concert-song-surface"
          onPointerDown={onSwipeStart}
          onPointerUp={onSwipeEnd}
        >
          <div className="concert-song-header">
            <h2>{currentSong.title}</h2>
            {currentSong.artist && <p className="concert-song-artist">{currentSong.artist}</p>}
            <div className="concert-song-meta">
              <LanguageBadge code={currentSong.language} />
              {currentSong.secondaryLanguages?.map((code) => <LanguageBadge key={code} code={code} />)}
              {currentSong.capo !== undefined && currentSong.capo > 0 && (
                <span className="capo-badge">Capo {currentSong.capo}</span>
              )}
              {currentSong.timeSignature && <span className="meta-pill">{currentSong.timeSignature}</span>}
            </div>
          </div>

          <div className="concert-scroll-region" ref={songScrollRef}>
            <ChordDisplay
              chordpro={currentSong.chordpro}
              transpose={transpose}
              showChords={showChords}
              notation={chordNotation}
              timeSignature={currentSong.timeSignature}
              instrument={chordInstrument}
              onChordClick={showChords
                ? (chord, rect) => {
                  setActiveChord((previous) =>
                    previous?.chord === chord && previous.rect.top === rect.top
                      ? null
                      : { chord, rect }
                  );
                }
                : undefined}
            />
          </div>
        </article>

        {showSongNavigator && (
          <aside className="concert-song-navigator" aria-label="Setlist songs navigator">
            <div className="concert-song-navigator-header">
              <h3>Setlist Songs</h3>
              <button
                type="button"
                className="concert-song-nav-close"
                onClick={() => setShowSongNavigator(false)}
                aria-label="Hide song navigator"
              >
                <ChevronsUpDown size={14} />
              </button>
            </div>
            <ol>
              {setlistSongs.map((song, index) => (
                <li key={song.id}>
                  <button
                    type="button"
                    className={`concert-song-jump${index === currentIndex ? ' active' : ''}${index < currentIndex ? ' played' : ''}`}
                    onClick={() => goToSong(index)}
                  >
                    <span className="concert-song-jump-number">{index + 1}</span>
                    <span className="concert-song-jump-main">
                      <strong>{song.title}</strong>
                      {song.artist && <small>{song.artist}</small>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

      <footer className="concert-nav-footer">
        <button
          type="button"
          className="concert-nav-btn"
          onClick={goToPrevious}
          disabled={!canGoPrevious}
          aria-label="Previous song"
        >
          <ChevronLeft size={18} /> Previous
        </button>
        <button
          type="button"
          className="concert-nav-btn concert-nav-btn--primary"
          onClick={goToNext}
          disabled={!canGoNext}
          aria-label="Next song"
        >
          Next <ChevronRight size={18} />
        </button>
      </footer>

      {activeChord && (
        <ChordDiagram
          chord={activeChord.chord}
          instrument={chordInstrument}
          anchorRect={activeChord.rect}
          onClose={() => setActiveChord(null)}
        />
      )}
    </section>
  );
}
