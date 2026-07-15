export type SongMediaProvider = 'spotify' | 'youtube';

export interface BaseSongMedia {
  provider: SongMediaProvider;
  originalUrl: string;
}

export interface SpotifySongMedia extends BaseSongMedia {
  provider: 'spotify';
  embedUrl: string;
  embedHeight: number;
}

export interface YoutubeSongMedia extends BaseSongMedia {
  provider: 'youtube';
  videoId: string;
}

export type SongMedia = SpotifySongMedia | YoutubeSongMedia;

function normalizeUrl(rawUrl: string): URL | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function parseSpotify(url: URL): SpotifySongMedia | null {
  const host = url.hostname.toLowerCase();
  if (host !== 'open.spotify.com' && host !== 'spotify.com' && host !== 'www.spotify.com') {
    return null;
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const [first, second, third] = parts;

  let type = first;
  let id = second;

  if (first === 'embed') {
    type = second;
    id = third;
  }

  if (!type || !id) return null;

  const supported = new Set(['track', 'episode', 'album', 'playlist']);
  if (!supported.has(type)) return null;

  const cleanId = id.split('?')[0].trim();
  if (!cleanId) return null;

  return {
    provider: 'spotify',
    originalUrl: url.toString(),
    embedUrl: `https://open.spotify.com/embed/${type}/${cleanId}?utm_source=generator`,
    embedHeight: type === 'track' || type === 'episode' ? 152 : 352,
  };
}

function parseYoutube(url: URL): YoutubeSongMedia | null {
  const host = url.hostname.toLowerCase();
  let videoId = '';

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? '';
  } else if (host.endsWith('youtube.com')) {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v') ?? '';
    } else {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
        videoId = parts[1] ?? '';
      }
    }
  }

  const cleanVideoId = videoId.trim();
  if (!cleanVideoId) return null;

  return {
    provider: 'youtube',
    originalUrl: url.toString(),
    videoId: cleanVideoId,
  };
}

export function parseSongMedia(rawUrl: string): SongMedia | null {
  const url = normalizeUrl(rawUrl);
  if (!url) return null;

  return parseSpotify(url) ?? parseYoutube(url);
}
