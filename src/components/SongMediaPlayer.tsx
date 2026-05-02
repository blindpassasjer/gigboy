import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Pause, Play } from 'lucide-react';
import { parseSongMedia } from '../utils/songMedia';

interface Props {
  mediaUrl: string;
  autoPlay?: boolean;
  onAutoPlayHandled?: () => void;
}

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  getDuration: () => number;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      width?: string;
      height?: string;
      videoId: string;
      playerVars?: Record<string, number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: {
    PLAYING: number;
    PAUSED: number;
    ENDED: number;
  };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytPromise: Promise<YTNamespace> | null = null;

function loadYoutubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (ytPromise) {
    return ytPromise;
  }

  ytPromise = new Promise<YTNamespace>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-youtube-iframe-api="true"]');
    const previousReadyHandler = window.onYouTubeIframeAPIReady;

    const finish = () => {
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error('YouTube API did not initialize.'));
      }
    };

    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      finish();
    };

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.youtubeIframeApi = 'true';
      script.onerror = () => reject(new Error('Failed to load YouTube API.'));
      document.head.appendChild(script);
    }

    window.setTimeout(() => {
      if (window.YT?.Player) {
        finish();
      }
    }, 8000);
  });

  return ytPromise;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const wholeSeconds = Math.floor(seconds);
  const mins = Math.floor(wholeSeconds / 60);
  const secs = wholeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function SongMediaPlayer({ mediaUrl, autoPlay = false, onAutoPlayHandled }: Props) {
  const media = useMemo(() => parseSongMedia(mediaUrl), [mediaUrl]);
  const hiddenPlayerHostRef = useRef<HTMLDivElement | null>(null);
  const [player, setPlayer] = useState<YTPlayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!media || media.provider !== 'youtube' || !hiddenPlayerHostRef.current) {
      setPlayer(null);
      setIsReady(false);
      return;
    }

    let cancelled = false;
    let localPlayer: YTPlayer | null = null;

    loadYoutubeApi()
      .then((YT) => {
        if (cancelled || !hiddenPlayerHostRef.current) return;

        localPlayer = new YT.Player(hiddenPlayerHostRef.current, {
          width: '1',
          height: '1',
          videoId: media.videoId,
          playerVars: {
            autoplay: autoPlay ? 1 : 0,
            controls: 0,
            disablekb: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              if (cancelled || !localPlayer) return;
              setIsReady(true);
              setDuration(localPlayer.getDuration() || 0);
              if (autoPlay) {
                localPlayer.playVideo();
                onAutoPlayHandled?.();
              }
            },
            onStateChange: (event) => {
              if (cancelled) return;
              setIsPlaying(event.data === YT.PlayerState.PLAYING);
              if (event.data === YT.PlayerState.ENDED) {
                setPosition(0);
              }
            },
          },
        });

        setPlayer(localPlayer);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load player.');
      });

    return () => {
      cancelled = true;
      setIsReady(false);
      setIsPlaying(false);
      setPosition(0);
      setDuration(0);
      setLoadError(null);
      if (localPlayer) {
        localPlayer.destroy();
      }
      setPlayer(null);
    };
  }, [media, autoPlay, onAutoPlayHandled]);

  useEffect(() => {
    if (!autoPlay || !player || !isReady) return;
    player.playVideo();
    onAutoPlayHandled?.();
  }, [autoPlay, player, isReady, onAutoPlayHandled]);

  useEffect(() => {
    if (!player || !isReady) return;

    const interval = window.setInterval(() => {
      const nextDuration = player.getDuration();
      const nextPosition = player.getCurrentTime();

      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        setDuration(nextDuration);
      }

      if (Number.isFinite(nextPosition) && nextPosition >= 0) {
        setPosition(nextPosition);
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [player, isReady]);

  if (!media) {
    return null;
  }

  if (media.provider === 'spotify') {
    return (
      <div className="song-media-player song-media-player--spotify">
        <iframe
          src={media.embedUrl}
          width="100%"
          height={media.embedHeight}
          title="Spotify player"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
        <a
          href={media.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="song-media-external-link"
        >
          Open in Spotify <ExternalLink size={12} />
        </a>
      </div>
    );
  }

  const safeDuration = duration > 0 ? duration : 1;

  return (
    <div className="song-media-player song-media-player--youtube">
      <div ref={hiddenPlayerHostRef} className="song-media-hidden-host" aria-hidden="true" />

      <button
        type="button"
        className="song-media-play-btn"
        disabled={!isReady}
        onClick={() => {
          if (!player || !isReady) return;
          if (isPlaying) {
            player.pauseVideo();
          } else {
            player.playVideo();
          }
        }}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
      </button>

      <div className="song-media-progress-wrap">
        <input
          type="range"
          min={0}
          max={safeDuration}
          step={0.1}
          value={Math.min(position, safeDuration)}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!player || !isReady || !Number.isFinite(next)) return;
            player.seekTo(next, true);
            setPosition(next);
          }}
          className="song-media-progress"
          aria-label="Playback progress"
        />
        <span className="song-media-time">
          {formatDuration(position)} / {formatDuration(duration)}
        </span>
      </div>

      <a
        href={media.originalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="song-media-external-icon"
        title="Open in YouTube"
        aria-label="Open in YouTube"
      >
        <ExternalLink size={13} />
      </a>

      {loadError && <span className="song-media-error">{loadError}</span>}
    </div>
  );
}
