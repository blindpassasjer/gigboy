export type PressKitMediaProvider = 'youtube' | 'vimeo' | 'spotify' | 'vevo';

export interface PressKitMedia {
  provider: PressKitMediaProvider;
  originalUrl: string;
  embedUrl: string;
  embedHeight?: number;
}

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

function parseYoutube(url: URL): PressKitMedia | null {
  const host = url.hostname?.toLowerCase();
  if (!host) return null;
  let videoId = '';

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? '';
  } else if (host.endsWith('youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('youtube-nocookie.com')) {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v') ?? '';
    } else {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
        videoId = parts[1] ?? '';
      }
    }
  } else if (host.endsWith('vevo.com')) {
    const path = url.pathname.split('/').filter(Boolean);
    const maybeId = url.searchParams.get('video') ?? path[path.length - 1] ?? '';
    if (maybeId) {
      return {
        provider: 'vevo',
        originalUrl: url.toString(),
        embedUrl: `https://www.youtube.com/embed/${maybeId}?rel=0&playsinline=1`,
      };
    }
  }

  const cleanVideoId = videoId.trim();
  if (!cleanVideoId) return null;

  return {
    provider: 'youtube',
    originalUrl: url.toString(),
    embedUrl: `https://www.youtube.com/embed/${cleanVideoId}?rel=0&playsinline=1`,
  };
}

function parseVimeo(url: URL): PressKitMedia | null {
  const host = url.hostname?.toLowerCase();
  if (!host || (host !== 'vimeo.com' && host !== 'www.vimeo.com' && host !== 'player.vimeo.com')) return null;

  const parts = url.pathname.split('/').filter(Boolean);
  let videoId = '';

  if (host === 'player.vimeo.com' && parts[0] === 'video') {
    videoId = parts[1] ?? '';
  } else {
    videoId = parts[0] ?? '';
  }

  const cleanVideoId = videoId.trim();
  if (!cleanVideoId || !/^\d+$/.test(cleanVideoId)) return null;

  return {
    provider: 'vimeo',
    originalUrl: url.toString(),
    embedUrl: `https://player.vimeo.com/video/${cleanVideoId}`,
  };
}

function parseSpotify(url: URL): PressKitMedia | null {
  const host = url.hostname?.toLowerCase();
  if (!host || (host !== 'open.spotify.com' && host !== 'spotify.com' && host !== 'www.spotify.com')) {
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

export function parsePressKitMedia(rawUrl: string): PressKitMedia | null {
  const url = normalizeUrl(rawUrl);
  if (!url) return null;

  return parseYoutube(url) ?? parseVimeo(url) ?? parseSpotify(url);
}
