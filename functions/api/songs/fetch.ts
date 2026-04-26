/// <reference types="@cloudflare/workers-types" />

interface FetchRequest {
  url: string;
  source: 'ultimate-guitar' | 'chordie' | 'chordify';
}

interface FetchResponse {
  chordpro: string;
  title?: string;
  artist?: string;
}

/**
 * Fetch full song content with chords from a URL
 */
export const onRequestPost: PagesFunction<never, never, {}> = async (ctx) => {
  const body = await ctx.request.json<FetchRequest>();
  const { url, source } = body;

  if (!url) {
    return Response.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    let result: FetchResponse | null = null;

    switch (source) {
      case 'ultimate-guitar':
        result = await fetchUltimateGuitar(url);
        break;
      case 'chordify':
        result = await fetchChordify(url);
        break;
      case 'chordie':
        result = await fetchChordies(url);
        break;
      default:
        return Response.json({ error: 'Unknown source' }, { status: 400 });
    }

    if (!result) {
      return Response.json(
        { error: 'Failed to fetch song content' },
        { status: 400 }
      );
    }

    return Response.json(result);
  } catch (error) {
    console.error('Fetch error:', error);
    return Response.json(
      { error: 'Failed to fetch song' },
      { status: 500 }
    );
  }
};

/**
 * Fetch from Ultimate Guitar
 */
async function fetchUltimateGuitar(url: string): Promise<FetchResponse | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Extract JSON-LD data from Ultimate Guitar
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      const jsonLd = JSON.parse(jsonLdMatch[1]);
      const content = jsonLd.articleBody || jsonLd.text || '';

      return {
        chordpro: parseUGTabs(html, content),
        title: jsonLd.headline,
        artist: jsonLd.author?.name,
      };
    }

    // Fallback: extract from HTML
    const chordpro = parseUGTabs(html, '');
    return chordpro ? { chordpro } : null;
  } catch {
    return null;
  }
}

/**
 * Parse Ultimate Guitar tabs from HTML
 */
function parseUGTabs(html: string, jsonContent: string): string {
  const content = jsonContent || html;

  // Look for pre tag with tab content
  const preMatch = content.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  if (preMatch) {
    return decodeHtmlEntities(preMatch[1]);
  }

  // Look for divs with chord/lyric data
  const lines: string[] = [];
  const lineMatches = content.matchAll(/[A-G][#b♯♭]?\s+[A-Za-z\s\-',.!?]/g);
  for (const match of lineMatches) {
    lines.push(match[0]);
  }

  return lines.join('\n') || '';
}

/**
 * Fetch from Chordify
 */
async function fetchChordify(url: string): Promise<FetchResponse | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const html = await response.text();

    // Extract chord display data from Chordify
    // This varies based on their HTML structure
    const titleMatch = html.match(/<title>([^<]+)</);
    const chordData = extractChordData(html);

    return {
      chordpro: chordData || 'Chords for this song',
      title: titleMatch ? titleMatch[1] : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch from Chordies
 */
async function fetchChordies(url: string): Promise<FetchResponse | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const html = await response.text();

    // Extract content from Chordies
    const titleMatch = html.match(/<h1[^>]*>([^<]+)</);
    const artistMatch = html.match(/Artist:[^<]*<[^>]*>([^<]+)/);

    // Extract chord sections
    let chordpro = '';
    const sectionMatches = html.matchAll(/<div[^>]*class="chord-section"[^>]*>([\s\S]*?)<\/div>/g);
    for (const match of sectionMatches) {
      const section = cleanHtmlContent(match[1]);
      if (section) chordpro += section + '\n\n';
    }

    return {
      chordpro: chordpro || extractChordData(html),
      title: titleMatch ? titleMatch[1].trim() : undefined,
      artist: artistMatch ? artistMatch[1].trim() : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Extract chord data from generic HTML
 */
function extractChordData(html: string): string {
  const lines: string[] = [];

  // Find all elements that contain chords and lyrics
  const spans = html.match(/<span[^>]*class="[^"]*chord[^"]*"[^>]*>([^<]+)<\/span>/g) || [];

  spans.forEach((span) => {
    const chordMatch = span.match(/>([^<]+)</);
    if (chordMatch) {
      lines.push(`[${chordMatch[1].trim()}]`);
    }
  });

  return lines.join(' ') || '';
}

/**
 * Clean HTML and extract text/chord content
 */
function cleanHtmlContent(html: string): string {
  let content = html;

  // Replace br with newlines
  content = content.replace(/<br\s*\/?>/gi, '\n');

  // Extract chord spans
  content = content.replace(/<span[^>]*class="[^"]*chord[^"]*"[^>]*>([^<]+)<\/span>/g, '[$1]');

  // Remove remaining HTML tags
  content = content.replace(/<[^>]+>/g, '');

  // Decode entities
  content = decodeHtmlEntities(content);

  // Clean up whitespace
  content = content.replace(/\n\s*\n/g, '\n\n').trim();

  return content;
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const map: { [key: string]: string } = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  };

  return text.replace(/&[^;]+;/g, (entity) => map[entity] || entity);
}
