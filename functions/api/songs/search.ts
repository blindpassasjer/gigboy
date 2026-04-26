/// <reference types="@cloudflare/workers-types" />

interface Env { DB: D1Database }
interface Data { userId: string }

type SearchResult = {
  title: string;
  artist: string;
  url: string;
  source: 'ultimate-guitar' | 'chordie' | 'chordify';
  chordpro?: string;
};

type SearchQuery = {
  query: string;
};

/**
 * Search for songs from multiple online sources
 * Returns basic info about found songs
 */
export const onRequestPost: PagesFunction<Env, never, Data> = async (ctx) => {
  const body = await ctx.request.json<SearchQuery>();
  const query = body.query?.trim();

  if (!query) {
    return Response.json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    // Search from multiple sources in parallel
    const results = await Promise.all([
      searchUltimateGuitar(query),
      searchChordify(query),
      searchChordies(query),
    ]);

    const allResults = results.flat().slice(0, 15); // Limit to 15 results

    return Response.json({ results: allResults });
  } catch (error) {
    console.error('Search error:', error);
    return Response.json(
      { error: 'Failed to search for songs' },
      { status: 500 }
    );
  }
};

/**
 * Search Ultimate Guitar (requires CORS workaround)
 */
async function searchUltimateGuitar(query: string): Promise<SearchResult[]> {
  try {
    // Note: Ultimate Guitar has CORS restrictions
    // This would need a backend proxy or JSONP approach
    // For now, returning empty - implement with backend proxy if needed
    const encoded = encodeURIComponent(query);
    const response = await fetch(
      `https://api.ultimate-guitar.com/v1/api/v1/search?q=${encoded}&type=Chords`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SongbookImport/1.0)',
        },
      }
    );

    if (!response.ok) return [];

    const data = (await response.json()) as any;
    if (!data.results) return [];

    return data.results
      .slice(0, 5)
      .map((result: any) => ({
        title: result.song_name,
        artist: result.artist_name,
        url: result.tab_url,
        source: 'ultimate-guitar' as const,
      }));
  } catch {
    return [];
  }
}

/**
 * Search Chordify API
 */
async function searchChordify(query: string): Promise<SearchResult[]> {
  try {
    const encoded = encodeURIComponent(query);
    const response = await fetch(
      `https://www.chordify.net/search.php?q=${encoded}&fmt=json`
    );

    if (!response.ok) return [];

    const data = (await response.json()) as any;
    if (!data.videos) return [];

    return data.videos
      .slice(0, 5)
      .map((video: any) => ({
        title: video.title,
        artist: video.artist || 'Unknown',
        url: `https://www.chordify.net/chordify/${video.video_id}`,
        source: 'chordify' as const,
      }));
  } catch {
    return [];
  }
}

/**
 * Search Chordies (formerly Chordify)
 */
async function searchChordies(query: string): Promise<SearchResult[]> {
  try {
    const encoded = encodeURIComponent(query);
    const response = await fetch(
      `https://www.chordies.com/api/search?q=${encoded}&limit=5`
    );

    if (!response.ok) return [];

    const data = (await response.json()) as any;
    if (!data.songs) return [];

    return data.songs
      .slice(0, 5)
      .map((song: any) => ({
        title: song.title,
        artist: song.artist || 'Unknown',
        url: song.url,
        source: 'chordie' as const,
      }));
  } catch {
    return [];
  }
}
