import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  List,
  Maximize2,
  Minimize2,
  Pause,
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
import VisualMetronome from '../components/VisualMetronome';
import VisualTuner from '../components/VisualTuner';
import type { ChordNotation } from '../utils/chordParser';
import { transposeChord } from '../utils/chordParser';
import { buildSongSurfaceStyle } from '../utils/songColorStyles';

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
  const [teleprompterActive, setTeleprompterActive] = useState(false);
  const [teleprompterSpeed, setTeleprompterSpeed] = useState(28);
  const [isFullscreen, setIsFullscreen] = useState(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(document.fullscreenElement);
  });
  const songScrollRef = useRef<HTMLDivElement>(null);
  const teleprompterFrameRef = useRef<number | null>(null);
  const teleprompterLastTickRef = useRef<number | null>(null);

  useEffect(() => {
    setCurrentIndex((current) => {
      if (setlistSongs.length === 0) return 0;
      return Math.min(Math.max(current, 0), setlistSongs.length - 1);
    });
  }, [setlistSongs.length]);

  useEffect(() => {
    setTeleprompterActive(false);
    teleprompterLastTickRef.current = null;
    if (songScrollRef.current) {
      songScrollRef.current.scrollTop = 0;
    }
    setActiveChord(null);
  }, [currentIndex]);

  useEffect(() => {
    if (!teleprompterActive) {
      teleprompterLastTickRef.current = null;
      if (teleprompterFrameRef.current !== null) {
        window.cancelAnimationFrame(teleprompterFrameRef.current);
        teleprompterFrameRef.current = null;
      }
      return;
    }

    const tick = (timestamp: number) => {
      const scrollElement = songScrollRef.current;
      if (!scrollElement) {
        setTeleprompterActive(false);
        return;
      }

      if (teleprompterLastTickRef.current === null) {
        teleprompterLastTickRef.current = timestamp;
      }

      const deltaSeconds = (timestamp - teleprompterLastTickRef.current) / 1000;
      teleprompterLastTickRef.current = timestamp;
      scrollElement.scrollTop += teleprompterSpeed * deltaSeconds;

      const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
      if (scrollElement.scrollTop >= maxScrollTop - 1) {
        setTeleprompterActive(false);
        return;
      }

      teleprompterFrameRef.current = window.requestAnimationFrame(tick);
    };

    teleprompterFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (teleprompterFrameRef.current !== null) {
        window.cancelAnimationFrame(teleprompterFrameRef.current);
        teleprompterFrameRef.current = null;
      }
    };
  }, [teleprompterActive, teleprompterSpeed, currentIndex]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();

    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore failures when fullscreen is unavailable.
    }
  }, []);

  const handleStopConcert = useCallback(async () => {
    setTeleprompterActive(false);
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore failures when fullscreen is unavailable.
      }
    }
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

      if (event.code === 'Space') {
        event.preventDefault();
        setTeleprompterActive((value) => !value);
      }

      if (event.key === '[') {
        event.preventDefault();
        setTeleprompterSpeed((value) => Math.max(6, value - 4));
      }

      if (event.key === ']') {
        event.preventDefault();
        setTeleprompterSpeed((value) => Math.min(120, value + 4));
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

  const accentColor = currentSong.color;
  const headerStyle = accentColor
    ? ({
      ...buildSongSurfaceStyle(accentColor),
      '--song-header-accent': accentColor,
    } as CSSProperties)
    : undefined;

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < setlistSongs.length - 1;

  return (
    <section className="concert-mode">
      <div className="concert-topbar-toggle-row">
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
          className="concert-chip-btn concert-chip-btn--danger"
          onClick={() => { void handleStopConcert(); }}
          aria-label="Stop concert mode"
        >
          <X size={14} /> Stop Concert
        </button>
      </div>
      {showTopbar && (
      <header className="concert-topbar" style={headerStyle}>
        <div className="concert-topbar-main">
          <Link to="/" className="back-link concert-back-link"><ArrowLeft size={15} /> Back</Link>
          <h1>{setlist.name}</h1>
          <p>
            Song {currentIndex + 1} of {setlistSongs.length}
            <span className="concert-shortcut-hint">Use left/right arrows for next song</span>
          </p>
        </div>

        <div className="concert-tool-row">
          <div className="transpose-control">
            <button
              onClick={() => setTranspose((value) => value - 1)}
              aria-label="Transpose down"
              className="transpose-btn"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="transpose-label">
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
              className="transpose-btn"
            >
              <ChevronRight size={16} />
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
              onChange={(event) => {
                setShowChords(event.target.checked);
                if (!event.target.checked) setActiveChord(null);
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

          <button
            type="button"
            className="concert-chip-btn"
            onClick={() => setShowSongNavigator((value) => !value)}
          >
            <List size={14} /> Songs
          </button>

          <button type="button" className="concert-chip-btn" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {isFullscreen ? 'Exit full' : 'Full screen'}
          </button>

          <div className="concert-teleprompter" aria-label="Auto scroll controls">
            <button
              type="button"
              className="concert-chip-btn concert-chip-btn--compact"
              onClick={() => setTeleprompterSpeed((value) => Math.max(6, value - 4))}
              aria-label="Reduce scroll speed"
            >
              -
            </button>
            <button
              type="button"
              className="concert-chip-btn"
              onClick={() => setTeleprompterActive((value) => !value)}
              aria-label={teleprompterActive ? 'Pause auto scroll' : 'Start auto scroll'}
            >
              {teleprompterActive ? <Pause size={14} /> : <Play size={14} />}
              {teleprompterActive ? 'Pause scroll' : 'Start scroll'}
            </button>
            <button
              type="button"
              className="concert-chip-btn concert-chip-btn--compact"
              onClick={() => setTeleprompterSpeed((value) => Math.min(120, value + 4))}
              aria-label="Increase scroll speed"
            >
              +
            </button>
            <button
              type="button"
              className="concert-chip-btn"
              onClick={() => {
                setTeleprompterActive(false);
                if (songScrollRef.current) songScrollRef.current.scrollTop = 0;
              }}
              aria-label="Reset scroll"
            >
              <RotateCcw size={14} /> Reset scroll
            </button>
            <span className="concert-teleprompter-speed">{teleprompterSpeed}px/s</span>
          </div>
        </div>
      </header>
      )}

      <div className={`concert-content-wrap${showSongNavigator ? '' : ' concert-content-wrap--full'}`}>
        <article className="concert-song-surface">
          <div className="concert-song-header">
            <h2>{currentSong.title}</h2>
            <div className="concert-song-meta">
              {currentSong.artist && <span className="meta-pill">{currentSong.artist}</span>}
              <LanguageBadge code={currentSong.language} />
              {currentSong.secondaryLanguages?.map((code) => <LanguageBadge key={code} code={code} />)}
              {currentSong.capo !== undefined && currentSong.capo > 0 && (
                <span className="capo-badge">Capo {currentSong.capo}</span>
              )}
              {currentSong.tempo && (
                <VisualMetronome
                  tempo={currentSong.tempo}
                  timeSignature={currentSong.timeSignature}
                  className="concert-metronome"
                />
              )}
              {currentSong.key && (
                <VisualTuner
                  targetKey={transpose === 0 ? currentSong.key : transposeChord(currentSong.key, transpose)}
                  className="concert-tuner"
                />
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
