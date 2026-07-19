import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { suggestChordNames } from '../utils/chordNames';

interface Props {
  keyChords: string[];
  keyLabel: string;
  recentChords: string[];
  onSelect: (chordName: string) => void;
  onRequestFinder: () => void;
  onEscape: () => void;
}

/**
 * The chord search + quick-pick UI shared by every chord-insertion entry
 * point (caret popover, toolbar button): a search box with typeahead, the
 * song's diatonic key chords, recently-used chords, and a shortcut into the
 * fretboard/ukulele/piano finder. Owns its own query state so it resets
 * cleanly each time it's mounted.
 */
export default function ChordSearchPanel({ keyChords, keyLabel, recentChords, onSelect, onRequestFinder, onEscape }: Props) {
  const [query, setQuery] = useState('');
  const suggestions = useMemo(() => suggestChordNames(query), [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[0]) onSelect(suggestions[0]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // Stop the native event too — AddSongForm has its own window-level Escape
      // handler that navigates away from the edit page, and this Escape should
      // only close the popover, not exit editing.
      e.nativeEvent.stopPropagation();
      onEscape();
    }
  }

  const chipRow = (label: string, chords: string[]) =>
    chords.length > 0 && (
      <div className="chord-caret-popover-row">
        <span className="chord-caret-popover-row-label">{label}</span>
        <div className="chord-caret-popover-chips">
          {chords.map((chord) => (
            <button
              key={chord}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(chord)}
            >
              {chord}
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div className="chord-search-panel">
      <div className="chord-caret-popover-search">
        <span className="toolbar-chord-bracket">[</span>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search chords"
          aria-label="Search chords"
          autoComplete="off"
        />
        <span className="toolbar-chord-bracket">]</span>
        <button
          type="button"
          className="chord-caret-popover-finder-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onRequestFinder}
          title="Find a chord by fretboard, ukulele, or piano"
          aria-label="Find a chord"
        >
          <Search size={13} />
        </button>
      </div>
      <div className="chord-caret-popover-body">
        {query.trim() ? (
          suggestions.length > 0 ? (
            <ul className="chord-caret-popover-list">
              {suggestions.map((name) => (
                <li key={name}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onSelect(name)}>
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="chord-caret-popover-empty">No matches</p>
          )
        ) : (
          <>
            {chipRow(keyLabel, keyChords)}
            {chipRow('Recent', recentChords)}
            {keyChords.length === 0 && recentChords.length === 0 && (
              <p className="chord-caret-popover-empty">Type to search, e.g. &ldquo;Am&rdquo;</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
