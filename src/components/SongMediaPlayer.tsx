import { useEffect, useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { parseSongMedia } from '../utils/songMedia';

interface Props {
  mediaUrl: string;
  autoPlay?: boolean;
  onAutoPlayHandled?: () => void;
}

export default function SongMediaPlayer({ mediaUrl, autoPlay = false, onAutoPlayHandled }: Props) {
  const media = useMemo(() => parseSongMedia(mediaUrl), [mediaUrl]);
  const youtubeEmbedUrl = useMemo(() => {
    if (!media || media.provider !== 'youtube') return null;

    const params = new URLSearchParams({
      rel: '0',
      playsinline: '1',
    });

    if (autoPlay) {
      params.set('autoplay', '1');
    }

    return `https://www.youtube.com/embed/${media.videoId}?${params.toString()}`;
  }, [media, autoPlay]);

  useEffect(() => {
    if (autoPlay) {
      onAutoPlayHandled?.();
    }
  }, [autoPlay, onAutoPlayHandled]);

  if (!media) {
    return null;
  }

  if (media.provider === 'spotify') {
    return (
      <div className="song-media-player song-media-player--spotify">
        <div className="song-media-embed-shell song-media-embed-shell--spotify">
          <iframe
            src={media.embedUrl}
            width="100%"
            height={media.embedHeight}
            title="Spotify player"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        </div>
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

  return (
    <div className="song-media-player song-media-player--youtube">
      <div className="song-media-embed-shell song-media-embed-shell--youtube">
        <iframe
          src={youtubeEmbedUrl ?? undefined}
          width="100%"
          title="YouTube player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          loading="lazy"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <a
        href={media.originalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="song-media-external-link"
      >
        Open in YouTube <ExternalLink size={12} />
      </a>
    </div>
  );
}
