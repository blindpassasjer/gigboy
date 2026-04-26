import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Loader, AlertCircle } from 'lucide-react';
import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import SongSearchResults from '../components/SongSearchResults';
import type { Song } from '../types';

interface SearchResult {
  title: string;
  artist: string;
  url: string;
  source: 'ultimate-guitar' | 'chordie' | 'chordify';
  chordpro?: string;
}

export default function SongImportPage() {
  const navigate = useNavigate();
  const { addSong } = useSongs();
  const { activeSongListId, addSongToList } = useSongLists();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError('');
    setResults([]);
    setSelectedResult(null);

    try {
      const response = await fetch('/api/songs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });

      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setResults(data.results || []);
      
      if (data.results?.length === 0) {
        setError('No songs found. Try a different search.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(result: SearchResult) {
    try {
      setLoading(true);
      
      let chordpro = result.chordpro ?? '';
      
      // If chordpro not already provided, fetch from URL
      if (!chordpro) {
        const response = await fetch('/api/songs/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: result.url, source: result.source }),
        });

        if (!response.ok) throw new Error('Failed to fetch song');
        const data = await response.json();
        chordpro = typeof data.chordpro === 'string' ? data.chordpro : '';
      }

      if (!chordpro.trim()) {
        throw new Error('Could not extract chords for this song source.');
      }

      // Create song object
      const song: Song = {
        id: crypto.randomUUID(),
        title: result.title.trim(),
        artist: result.artist?.trim() || undefined,
        language: 'en',
        chordpro: chordpro,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Add song
      const songId = await addSong(song);
      
      // Add to active list if exists
      if (songId && activeSongListId) {
        addSongToList(activeSongListId, songId);
      }

      navigate(`/songs/${songId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  if (selectedResult && !loading) {
    return (
      <div className="import-page">
        <button
          onClick={() => setSelectedResult(null)}
          className="back-button"
          aria-label="Back to search"
        >
          <ArrowLeft size={20} />
          Back to Search
        </button>
        
        <SongSearchResults
          result={selectedResult}
          onImport={handleImport}
          onCancel={() => setSelectedResult(null)}
          error={error}
        />
      </div>
    );
  }

  return (
    <div className="import-page">
      <div className="import-header">
        <h1>Import Song</h1>
        <p>Search online for songs and import them with chords</p>
      </div>

      <form onSubmit={handleSearch} className="search-form">
        <div className="search-input-wrapper">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Search by song title or artist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? <Loader size={20} className="spin" /> : 'Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="error-message">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="search-results">
          <h2>{results.length} results found</h2>
          <div className="results-list">
            {results.map((result, idx) => (
              <div
                key={idx}
                className="result-item"
                onClick={() => setSelectedResult(result)}
              >
                <div className="result-info">
                  <h3>{result.title}</h3>
                  <p className="artist">{result.artist || 'Unknown Artist'}</p>
                  <p className="source">From {result.source}</p>
                </div>
                <button className="import-button">
                  Import
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && !error && searchQuery && (
        <div className="no-results">
          <p>Start searching to find songs to import</p>
        </div>
      )}
    </div>
  );
}
