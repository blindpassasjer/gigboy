import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AudioLines,
  Bluetooth,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  List,
  Metronome,
  PenLine,
  Play,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import { usePlan, useBandPlan } from '../hooks/usePlan';
import type { HandNoteStroke, Song } from '../types';
import LanguageBadge from '../components/LanguageBadge';
import ChordDisplay from '../components/ChordDisplay';
import ChordDiagram, { type DiagramInstrument } from '../components/ChordDiagram';
import SongHandNotesOverlay from '../components/SongHandNotesOverlay';
import SongMediaPlayer from '../components/SongMediaPlayer';
import VisualMetronome from '../components/VisualMetronome';
import VisualTuner from '../components/VisualTuner';
import { useSongHandNotes } from '../hooks/useSongHandNotes';
import type { ChordNotation } from '../utils/chordParser';
import { transposeChord } from '../utils/chordParser';
import { parseSongMedia } from '../utils/songMedia';
import { getUserNoteColor } from '../lib/userColors';

interface ActiveChord {
  chord: string;
  rect: DOMRect;
}

type PedalMappingTarget = 'previous' | 'next' | null;
type PedalControlMode = 'song' | 'scroll';

type BluetoothGattCharacteristicLike = {
  properties?: { notify?: boolean; indicate?: boolean };
  startNotifications: () => Promise<unknown>;
  stopNotifications?: () => Promise<unknown>;
  addEventListener: (type: 'characteristicvaluechanged', listener: (event: Event) => void) => void;
  removeEventListener: (type: 'characteristicvaluechanged', listener: (event: Event) => void) => void;
};

type BluetoothGattServiceLike = {
  getCharacteristics?: () => Promise<BluetoothGattCharacteristicLike[]>;
};

type BluetoothGattLike = {
  connect?: () => Promise<unknown>;
  getPrimaryServices?: () => Promise<BluetoothGattServiceLike[]>;
};

type BluetoothDeviceLike = {
  name?: string;
  gatt?: BluetoothGattLike;
  addEventListener?: (type: 'gattserverdisconnected', listener: (event: Event) => void) => void;
  removeEventListener?: (type: 'gattserverdisconnected', listener: (event: Event) => void) => void;
};

export default function BandSetlistConcertPage() {
  const navigate = useNavigate();
  const { bandId, setlistId } = useParams<{ bandId: string; setlistId: string }>();
  const { user } = useAuth();
  const { canUse: canUseUser } = usePlan();
  const {
    bandSetlistsByBandId,
    bandSongsByBandId,
    refreshBandSetlists,
    refreshBandSongs,
    updateBandSong,
    bands,
  } = useBands();

  const band = bands.find((b) => b.id === bandId) ?? null;
  const { canUse } = useBandPlan(band);
  void canUseUser;

  const bandSetlists = useMemo(() => (bandId ? (bandSetlistsByBandId[bandId] ?? []) : []), [bandId, bandSetlistsByBandId]);
  const bandSongs = useMemo(() => (bandId ? (bandSongsByBandId[bandId] ?? []) : []), [bandId, bandSongsByBandId]);

  const setlist = useMemo(
    () => bandSetlists.find((entry) => entry.id === setlistId) ?? null,
    [bandSetlists, setlistId],
  );
  const songsById = useMemo(() => new Map(bandSongs.map((song) => [song.id, song])), [bandSongs]);
  const setlistSongs = useMemo(
    () => (setlist?.songIds ?? [])
      .map((songId) => songsById.get(songId))
      .filter((song): song is Song => Boolean(song)),
    [setlist?.songIds, songsById],
  );

  // Ensure band data is loaded when navigating directly to this URL.
  useEffect(() => {
    if (!bandId) return;
    if (bandSetlists.length === 0) {
      void refreshBandSetlists(bandId).catch(() => {});
    }
    if (bandSongs.length === 0) {
      void refreshBandSongs(bandId).catch(() => {});
    }
  }, [bandId, bandSetlists.length, bandSongs.length, refreshBandSetlists, refreshBandSongs]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [transpose, setTranspose] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [chordInstrument, setChordInstrument] = useState<DiagramInstrument>('guitar');
  const [chordNotation, setChordNotation] = useState<ChordNotation>('anglo');
  const [activeChord, setActiveChord] = useState<ActiveChord | null>(null);
  const [showTopbar, setShowTopbar] = useState(false);
  const [showSongNavigator, setShowSongNavigator] = useState(false);
  const [showMetronome, setShowMetronome] = useState(false);
  const [showTuner, setShowTuner] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [drawEnabled, setDrawEnabled] = useState(false);
  const [undoStack, setUndoStack] = useState<HandNoteStroke[][]>([]);
  const [showMediaPlayer, setShowMediaPlayer] = useState(false);
  const [autoPlayMediaOnOpen, setAutoPlayMediaOnOpen] = useState(false);
  const [isPedalConnected, setIsPedalConnected] = useState(false);
  const [isPedalConnecting, setIsPedalConnecting] = useState(false);
  const [pedalDeviceName, setPedalDeviceName] = useState('Pedal');
  const [showPedalMapper, setShowPedalMapper] = useState(false);
  const [pedalMappingTarget, setPedalMappingTarget] = useState<PedalMappingTarget>(null);
  const [mappedPreviousCode, setMappedPreviousCode] = useState<number | null>(null);
  const [mappedNextCode, setMappedNextCode] = useState<number | null>(null);
  const [lastPedalSignalCode, setLastPedalSignalCode] = useState<number | null>(null);
  const [pedalControlMode, setPedalControlMode] = useState<PedalControlMode>('song');
  const songScrollRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const pedalDeviceRef = useRef<BluetoothDeviceLike | null>(null);
  const pedalDisconnectHandlerRef = useRef<((event: Event) => void) | null>(null);
  const pedalNotificationCleanupRef = useRef<(() => void) | null>(null);
  const lastPedalTriggerAtRef = useRef(0);
  const pedalMappingTargetRef = useRef<PedalMappingTarget>(null);
  const mappedPreviousCodeRef = useRef<number | null>(null);
  const mappedNextCodeRef = useRef<number | null>(null);
  const pedalControlModeRef = useRef<PedalControlMode>('song');

  const activeSong = setlistSongs[currentIndex] ?? null;
  const handNotes = useSongHandNotes({
    ownerId: activeSong?.ownerId ?? user?.id ?? null,
    bandId: bandId ?? null,
    songId: activeSong?.id ?? '',
    user,
    enabled: showNotes,
  });

  const backRoute = bandId && setlistId
    ? `/bands/${bandId}/setlists/${setlistId}`
    : `/bands`;

  useEffect(() => {
    setCurrentIndex((current) => {
      if (setlistSongs.length === 0) return 0;
      return Math.min(Math.max(current, 0), setlistSongs.length - 1);
    });
  }, [setlistSongs.length]);

  useEffect(() => {
    setShowMediaPlayer(false);
    setAutoPlayMediaOnOpen(false);
    setDrawEnabled(false);
    setUndoStack([]);
    if (songScrollRef.current) {
      songScrollRef.current.scrollTop = 0;
    }
    setActiveChord(null);
  }, [currentIndex]);

  useEffect(() => {
    setTranspose(activeSong?.preferredTranspose ?? 0);
  }, [activeSong?.id, activeSong?.preferredTranspose]);

  const handleStrokesChange = useCallback((strokes: HandNoteStroke[], viewport: { width: number; height: number }) => {
    setUndoStack((prev) => [...prev, handNotes.myStrokes]);
    handNotes.saveMyNotes(strokes, viewport);
  }, [handNotes]);

  const handleUndoStroke = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const before = prev[prev.length - 1];
      const next = prev.slice(0, prev.length - 1);
      const canvas = document.querySelector('.song-hand-notes-overlay') as HTMLDivElement | null;
      const rect = canvas?.getBoundingClientRect();
      handNotes.saveMyNotes(before ?? [], {
        width: rect?.width ?? window.innerWidth,
        height: rect?.height ?? window.innerHeight,
      });
      return next;
    });
  }, [handNotes]);

  const handleClearNotes = useCallback(async () => {
    setUndoStack([]);
    await handNotes.clearMyNotes();
  }, [handNotes]);

  const handleToggleNotes = useCallback((next: boolean) => {
    setShowNotes(next);
    if (!next) {
      setDrawEnabled(false);
    }
  }, []);

  const handleToggleDraw = useCallback((next: boolean) => {
    setDrawEnabled(next);
    if (next && !showNotes) {
      setShowNotes(true);
    }
  }, [showNotes]);

  useEffect(() => {
    pedalMappingTargetRef.current = pedalMappingTarget;
  }, [pedalMappingTarget]);

  useEffect(() => {
    mappedPreviousCodeRef.current = mappedPreviousCode;
  }, [mappedPreviousCode]);

  useEffect(() => {
    mappedNextCodeRef.current = mappedNextCode;
  }, [mappedNextCode]);

  useEffect(() => {
    pedalControlModeRef.current = pedalControlMode;
  }, [pedalControlMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('concertPedalMapping');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { previous?: number | null; next?: number | null };
      if (typeof parsed.previous === 'number') {
        setMappedPreviousCode(parsed.previous);
      }
      if (typeof parsed.next === 'number') {
        setMappedNextCode(parsed.next);
      }
    } catch {
      // Ignore invalid mapping payloads from previous versions.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = JSON.stringify({ previous: mappedPreviousCode, next: mappedNextCode });
    window.localStorage.setItem('concertPedalMapping', payload);
  }, [mappedNextCode, mappedPreviousCode]);

  const handleStopConcert = useCallback(async () => {
    navigate(backRoute);
  }, [navigate, backRoute]);

  const handlePinTranspose = useCallback(async () => {
    if (!bandId || !activeSong) return;
    const nextSong: Song = {
      ...activeSong,
      preferredTranspose: transpose,
      updatedAt: new Date().toISOString(),
    };
    const error = await updateBandSong(bandId, nextSong);
    if (error) {
      window.alert(`Could not save pinned transpose: ${error}`);
      return;
    }
  }, [activeSong, bandId, transpose, updateBandSong]);

  const formatPedalSignalCode = useCallback((value: number | null) => {
    if (value === null) return 'Not set';
    return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
  }, []);

  const scrollByPedalStep = useCallback((direction: 'previous' | 'next') => {
    const scrollRegion = songScrollRef.current;
    if (!scrollRegion) return;
    const step = Math.max(120, Math.round(scrollRegion.clientHeight * 0.22));
    scrollRegion.scrollBy({
      top: direction === 'previous' ? -step : step,
      behavior: 'smooth',
    });
  }, []);

  const goToSong = useCallback((index: number) => {
    setCurrentIndex(Math.min(Math.max(index, 0), setlistSongs.length - 1));
  }, [setlistSongs.length]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((current) => Math.max(current - 1, 0));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((current) => Math.min(current + 1, setlistSongs.length - 1));
  }, [setlistSongs.length]);

  const triggerPedalAction = useCallback((direction: 'previous' | 'next') => {
    if (pedalControlModeRef.current === 'scroll') {
      scrollByPedalStep(direction);
      return;
    }
    if (direction === 'previous') {
      goToPrevious();
      return;
    }
    goToNext();
  }, [goToNext, goToPrevious, scrollByPedalStep]);

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

  useEffect(() => () => {
    if (pedalNotificationCleanupRef.current) {
      pedalNotificationCleanupRef.current();
      pedalNotificationCleanupRef.current = null;
    }
    const currentDevice = pedalDeviceRef.current;
    const disconnectHandler = pedalDisconnectHandlerRef.current;
    if (currentDevice && disconnectHandler && typeof currentDevice.removeEventListener === 'function') {
      currentDevice.removeEventListener('gattserverdisconnected', disconnectHandler);
    }
  }, []);

  const attachBluetoothPedalListeners = useCallback(async (device: BluetoothDeviceLike) => {
    if (pedalNotificationCleanupRef.current) {
      pedalNotificationCleanupRef.current();
      pedalNotificationCleanupRef.current = null;
    }

    const gatt = device?.gatt;
    if (!gatt || typeof gatt.getPrimaryServices !== 'function') return;

    const cleanupCallbacks: Array<() => void> = [];
    let foundNotificationCharacteristic = false;

    const handleReport = (event: Event) => {
      const target = event.target as { value?: DataView } | null;
      const value = target?.value;
      if (!value || value.byteLength === 0) return;

      let hasPress = false;
      for (let i = 0; i < value.byteLength; i += 1) {
        if (value.getUint8(i) !== 0) {
          hasPress = true;
          break;
        }
      }
      if (!hasPress) return;

      const firstByte = value.getUint8(0);
      setLastPedalSignalCode(firstByte);

      const activeMappingTarget = pedalMappingTargetRef.current;
      if (activeMappingTarget === 'previous') {
        setMappedPreviousCode(firstByte);
        setPedalMappingTarget(null);
        return;
      }
      if (activeMappingTarget === 'next') {
        setMappedNextCode(firstByte);
        setPedalMappingTarget(null);
        return;
      }

      const now = Date.now();
      if (now - lastPedalTriggerAtRef.current < 180) return;
      lastPedalTriggerAtRef.current = now;

      const mappedPrevious = mappedPreviousCodeRef.current;
      const mappedNext = mappedNextCodeRef.current;
      if (mappedPrevious !== null || mappedNext !== null) {
        if (mappedPrevious !== null && firstByte === mappedPrevious) {
          triggerPedalAction('previous');
          return;
        }
        if (mappedNext !== null && firstByte === mappedNext) {
          triggerPedalAction('next');
        }
        return;
      }

      const shouldGoPrevious = firstByte === 2 || firstByte === 0x10 || (firstByte & 0x02) === 0x02;
      if (shouldGoPrevious) {
        triggerPedalAction('previous');
        return;
      }
      triggerPedalAction('next');
    };

    try {
      const services = await gatt.getPrimaryServices();
      for (const service of services) {
        if (typeof service.getCharacteristics !== 'function') continue;
        const characteristics = await service.getCharacteristics();
        for (const characteristic of characteristics) {
          const properties = characteristic?.properties;
          const canNotify = Boolean(properties?.notify || properties?.indicate);
          if (!canNotify) continue;

          await characteristic.startNotifications();
          characteristic.addEventListener('characteristicvaluechanged', handleReport);
          cleanupCallbacks.push(() => {
            characteristic.removeEventListener('characteristicvaluechanged', handleReport);
            if (typeof characteristic.stopNotifications === 'function') {
              void characteristic.stopNotifications().catch(() => {});
            }
          });
          foundNotificationCharacteristic = true;
        }
      }
    } catch {
      cleanupCallbacks.forEach((fn) => fn());
      return;
    }

    if (!foundNotificationCharacteristic) {
      cleanupCallbacks.forEach((fn) => fn());
      return;
    }

    pedalNotificationCleanupRef.current = () => {
      cleanupCallbacks.forEach((fn) => fn());
    };
  }, [triggerPedalAction]);

  const handleSelectBluetoothPedal = useCallback(async () => {
    if (!(navigator as Navigator & { bluetooth?: unknown }).bluetooth) {
      setIsPedalConnected(false);
      window.alert('Bluetooth is not available in this browser.');
      return;
    }

    setIsPedalConnecting(true);
    try {
      const bluetoothNavigator = navigator as Navigator & {
        bluetooth: {
          requestDevice: (options: unknown) => Promise<BluetoothDeviceLike>;
        };
      };

      const selectedDevice = await bluetoothNavigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'human_interface_device'],
      });

      const previousDevice = pedalDeviceRef.current;
      const previousDisconnectHandler = pedalDisconnectHandlerRef.current;
      if (previousDevice && previousDisconnectHandler && typeof previousDevice.removeEventListener === 'function') {
        previousDevice.removeEventListener('gattserverdisconnected', previousDisconnectHandler);
      }

      pedalDeviceRef.current = selectedDevice;
      setPedalDeviceName(selectedDevice.name || 'Pedal');

      const onDisconnect = () => {
        setIsPedalConnected(false);
        setShowPedalMapper(false);
        setPedalMappingTarget(null);
      };
      pedalDisconnectHandlerRef.current = onDisconnect;
      if (typeof selectedDevice.addEventListener === 'function') {
        selectedDevice.addEventListener('gattserverdisconnected', onDisconnect);
      }

      if (selectedDevice.gatt && typeof selectedDevice.gatt.connect === 'function') {
        await selectedDevice.gatt.connect();
      }
      await attachBluetoothPedalListeners(selectedDevice);
      setIsPedalConnected(true);
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'NotFoundError';
      if (!isAbort) {
        setIsPedalConnected(false);
        window.alert('Could not connect to Bluetooth pedal.');
      }
    } finally {
      setIsPedalConnecting(false);
    }
  }, [attachBluetoothPedalListeners]);

  const handlePedalButtonClick = useCallback(() => {
    if (!canUse('bluetoothPedal')) {
      window.alert('The Bluetooth pedal feature requires a Pro or Crew plan for this band. Upgrade at gigboy.app/pricing.');
      return;
    }
    if (isPedalConnected) {
      setShowPedalMapper((value) => !value);
      setPedalMappingTarget(null);
      return;
    }
    void handleSelectBluetoothPedal();
  }, [canUse, handleSelectBluetoothPedal, isPedalConnected]);

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

      if (event.key === 'PageDown' || event.key === 'MediaTrackNext') {
        event.preventDefault();
        if (pedalControlMode === 'scroll') {
          scrollByPedalStep('next');
        } else {
          goToNext();
        }
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPrevious();
      }

      if (event.key === 'PageUp' || event.key === 'MediaTrackPrevious') {
        event.preventDefault();
        if (pedalControlMode === 'scroll') {
          scrollByPedalStep('previous');
        } else {
          goToPrevious();
        }
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
  }, [goToNext, goToPrevious, pedalControlMode, scrollByPedalStep]);

  if (!setlist) {
    return (
      <div className="not-found">
        <p>Setlist not found.</p>
        <Link to={backRoute} className="back-link"><ArrowLeft size={16} /> Back to setlist</Link>
      </div>
    );
  }

  if (setlistSongs.length === 0) {
    return (
      <div className="not-found">
        <p>This setlist has no songs yet.</p>
        <button type="button" className="setlist-action-btn" onClick={() => navigate(backRoute)}>Back to setlist</button>
      </div>
    );
  }

  const currentSong = setlistSongs[currentIndex] ?? setlistSongs[0];
  if (!currentSong) {
    return (
      <div className="not-found">
        <p>Could not load song for concert mode.</p>
        <button type="button" className="setlist-action-btn" onClick={() => navigate(backRoute)}>Back to setlist</button>
      </div>
    );
  }

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < setlistSongs.length - 1;
  const media = currentSong.playbackUrl ? parseSongMedia(currentSong.playbackUrl) : null;
  const isTransposePinned = currentSong.preferredTranspose === transpose;

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
          <Link to={backRoute} className="back-link concert-back-link"><ArrowLeft size={15} /> Back</Link>
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
                <button
                  onClick={() => { void handlePinTranspose(); }}
                  aria-label="Pin current transpose"
                  className={`transpose-btn transpose-btn--pin song-toolbar-tool-btn song-toolbar-setting-btn${isTransposePinned ? ' transpose-btn--pin-active' : ''}`}
                  title={isTransposePinned ? 'This transposition is already pinned' : 'Pin this transposition for this song'}
                >
                  {isTransposePinned ? 'Pinned' : 'Pin'}
                </button>
              </div>

              <div className="instrument-toggle song-toolbar-controls-group">
                <button
                  type="button"
                  className={`instrument-toggle-btn${showChords ? ' instrument-toggle-btn--active' : ''}`}
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
              </div>

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

              {user && (
                <button
                  type="button"
                  className={`song-toolbar-tool-btn${showNotes ? ' song-toolbar-tool-btn--active' : ''}`}
                  onClick={() => handleToggleNotes(!showNotes)}
                  title={showNotes ? 'Hide handwritten notes' : 'Show handwritten notes'}
                  aria-label={showNotes ? 'Hide handwritten notes' : 'Show handwritten notes'}
                >
                  <PenLine size={14} />
                  Notes
                </button>
              )}

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

            {(showTuner || showMetronome || (user && showNotes) || (media && showMediaPlayer && currentSong.playbackUrl)) && (
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

                {user && showNotes && (
                  <div className="song-toolbar-tool-card song-toolbar-tool-card--notes">
                    <span className="song-toolbar-tool-card-title">Handwritten notes</span>
                    <div className="song-notes-panel">
                      <label
                        className={`toggle-label toggle-label--draw song-notes-draw-toggle${drawEnabled ? ' toggle-label--draw-active' : ''}`}
                        title="Enable touch drawing"
                      >
                        <input
                          type="checkbox"
                          checked={drawEnabled}
                          onChange={(e) => handleToggleDraw(e.target.checked)}
                        />
                        Draw
                      </label>

                      {drawEnabled && (
                        <>
                          <button
                            className="notes-toolbar-btn"
                            onClick={handleUndoStroke}
                            disabled={undoStack.length === 0}
                            title="Undo last stroke"
                          >
                            Undo
                          </button>
                          <button
                            className="notes-toolbar-btn notes-toolbar-btn--danger"
                            onClick={() => { void handleClearNotes(); }}
                            disabled={handNotes.myStrokes.length === 0}
                            title="Clear my notes"
                          >
                            Clear
                          </button>
                        </>
                      )}

                      {handNotes.saveState === 'saving' && (
                        <span className="notes-save-status notes-save-status--saving">Saving...</span>
                      )}
                      {handNotes.saveState === 'saved' && (
                        <span className="notes-save-status notes-save-status--saved">Saved</span>
                      )}
                      {handNotes.saveState === 'error' && (
                        <span className="notes-save-status notes-save-status--error">Failed to save</span>
                      )}

                      {handNotes.authors.length > 0 && (
                        <div className="notes-author-filters">
                          {handNotes.authors.length > 1 && (
                            <button
                              className={`notes-author-chip${handNotes.visibleAuthorIds.length === handNotes.authors.length ? ' notes-author-chip--active' : ''}`}
                              onClick={handNotes.showAll}
                              title="Show all users' notes"
                            >
                              All
                            </button>
                          )}
                          {handNotes.authors.map((author) => (
                            <button
                              key={author.uid}
                              className={`notes-author-chip${handNotes.visibleAuthorIds.includes(author.uid) ? ' notes-author-chip--on' : ''}`}
                              onClick={() => handNotes.toggleVisibleAuthor(author.uid)}
                              title={`Toggle notes by ${author.name}`}
                            >
                              {author.avatar ? (
                                <span className="notes-author-chip-avatar">{author.avatar}</span>
                              ) : (
                                <span className="notes-author-chip-initials">
                                  {author.name.slice(0, 1).toUpperCase()}
                                </span>
                              )}
                              {author.uid === user.id ? 'Me' : author.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
            <div className="song-notes-stage">
              <ChordDisplay
                chordpro={currentSong.chordpro}
                transpose={transpose}
                showChords={showChords}
                notation={chordNotation}
                timeSignature={currentSong.timeSignature}
                instrument={chordInstrument}
                onChordClick={showChords && !drawEnabled
                  ? (chord, rect) => {
                    setActiveChord((previous) =>
                      previous?.chord === chord && previous.rect.top === rect.top
                        ? null
                        : { chord, rect }
                    );
                  }
                  : undefined}
              />
              <SongHandNotesOverlay
                visible={showNotes}
                drawEnabled={drawEnabled}
                notes={handNotes.visibleNotes}
                myStrokes={handNotes.myStrokes}
                strokeColor={getUserNoteColor(user?.id ?? null)}
                onMyStrokesChange={handleStrokesChange}
              />
            </div>
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
          className={`concert-nav-btn concert-nav-btn--pedal${isPedalConnected ? ' concert-nav-btn--pedal-connected' : ''}`}
          onClick={handlePedalButtonClick}
          aria-label={isPedalConnected ? 'Open pedal mapping' : 'Select and connect Bluetooth pedal'}
          title={isPedalConnected ? `Connected: ${pedalDeviceName}. Click to map controls.` : 'Select Bluetooth pedal'}
          disabled={isPedalConnecting}
        >
          <Bluetooth size={16} />
          <span className={`concert-pedal-status${isPedalConnected ? ' concert-pedal-status--connected' : ''}`} aria-hidden="true" />
          {isPedalConnecting ? 'Connecting...' : 'Pedal'}
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

      {showPedalMapper && (
        <section className="concert-pedal-mapper" aria-label="Bluetooth pedal mapping">
          <div className="concert-pedal-mapper-head">
            <h3>Pedal Mapping</h3>
            <p>{pedalDeviceName}</p>
          </div>
          <div className="concert-pedal-mode-toggle" role="group" aria-label="Pedal action mode">
            <button
              type="button"
              className={`concert-pedal-map-btn${pedalControlMode === 'song' ? ' concert-pedal-map-btn--active' : ''}`}
              onClick={() => setPedalControlMode('song')}
            >
              Song Mode
            </button>
            <button
              type="button"
              className={`concert-pedal-map-btn${pedalControlMode === 'scroll' ? ' concert-pedal-map-btn--active' : ''}`}
              onClick={() => setPedalControlMode('scroll')}
            >
              Scroll Mode
            </button>
          </div>
          <div className="concert-pedal-mapper-actions">
            <button
              type="button"
              className={`concert-pedal-map-btn${pedalMappingTarget === 'previous' ? ' concert-pedal-map-btn--active' : ''}`}
              onClick={() => setPedalMappingTarget((value) => (value === 'previous' ? null : 'previous'))}
            >
              {pedalMappingTarget === 'previous' ? 'Press pedal now...' : pedalControlMode === 'scroll' ? 'Learn Scroll Up' : 'Learn Previous'}
            </button>
            <button
              type="button"
              className={`concert-pedal-map-btn${pedalMappingTarget === 'next' ? ' concert-pedal-map-btn--active' : ''}`}
              onClick={() => setPedalMappingTarget((value) => (value === 'next' ? null : 'next'))}
            >
              {pedalMappingTarget === 'next' ? 'Press pedal now...' : pedalControlMode === 'scroll' ? 'Learn Scroll Down' : 'Learn Next'}
            </button>
            <button
              type="button"
              className="concert-pedal-map-btn"
              onClick={() => { void handleSelectBluetoothPedal(); }}
              disabled={isPedalConnecting}
            >
              {isPedalConnecting ? 'Connecting...' : 'Change Pedal'}
            </button>
            <button
              type="button"
              className="concert-pedal-map-btn"
              onClick={() => {
                setMappedPreviousCode(null);
                setMappedNextCode(null);
                setPedalMappingTarget(null);
              }}
            >
              Clear Mapping
            </button>
          </div>
          <div className="concert-pedal-mapper-meta">
            <span>{pedalControlMode === 'scroll' ? 'Scroll up' : 'Previous'}: {formatPedalSignalCode(mappedPreviousCode)}</span>
            <span>{pedalControlMode === 'scroll' ? 'Scroll down' : 'Next'}: {formatPedalSignalCode(mappedNextCode)}</span>
            <span>Last signal: {formatPedalSignalCode(lastPedalSignalCode)}</span>
          </div>
        </section>
      )}

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
