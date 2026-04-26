import { useState } from 'react';
import { AlertCircle, Loader } from 'lucide-react';
import ChordDisplay from './ChordDisplay';

interface SearchResult {
  title: string;
  artist: string;
  url: string;
  source: 'ultimate-guitar' | 'chordie' | 'chordify';
  chordpro?: string;
}

interface Props {
  result: SearchResult;
  onImport: (result: SearchResult) => Promise<void>;
  onCancel: () => void;
  error?: string;
}

export default function SongSearchResults({
  result,
  onImport,
  onCancel,
  error = '',
}: Props) {
  const [isImporting, setIsImporting] = useState(false);

  async function handleImportClick() {
    setIsImporting(true);
    try {
      await onImport(result);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="search-result-detail">
      <div className="result-header">
        <div className="result-meta">
          <h2>{result.title}</h2>
          {result.artist && <p className="artist">{result.artist}</p>}
          <div className="source-info">
            <span className="source-badge">{result.source}</span>
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="source-link">
              View original
            </a>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {result.chordpro && (
        <div className="preview-section">
          <h3>Preview</h3>
          <ChordDisplay chordpro={result.chordpro} />
        </div>
      )}

      {!result.chordpro && (
        <div className="info-message">
          <p>Full chords will be fetched when you import this song.</p>
        </div>
      )}

      <div className="action-buttons">
        <button onClick={onCancel} disabled={isImporting} className="cancel-button">
          Cancel
        </button>
        <button onClick={handleImportClick} disabled={isImporting} className="import-button primary">
          {isImporting ? (
            <>
              <Loader size={18} className="spin" />
              Importing...
            </>
          ) : (
            'Import Song'
          )}
        </button>
      </div>
    </div>
  );
}
