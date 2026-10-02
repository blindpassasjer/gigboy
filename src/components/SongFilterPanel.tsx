import { useMemo } from 'react';
import { languageName } from '../utils/languages';
import {
  BPM_BUCKETS,
  EMPTY_SONG_FILTERS,
  countActiveFilters,
  getFilterOptions,
} from '../utils/songFilters';
import type { Song } from '../types';
import type { SongFilters } from '../utils/songFilters';

interface Props {
  /** Songs the chips are derived from (only values present in these songs are offered). */
  songs: Song[];
  filters: SongFilters;
  onChange: (filters: SongFilters) => void;
  /** Number of songs currently matching, shown in the footer while filters are active. */
  resultCount: number;
  id?: string;
  className?: string;
}

export default function SongFilterPanel({ songs, filters, onChange, resultCount, id, className }: Props) {
  const options = useMemo(() => getFilterOptions(songs, languageName), [songs]);
  const activeCount = countActiveFilters(filters);

  function toggle(group: keyof SongFilters, value: string) {
    const current = filters[group];
    onChange({
      ...filters,
      [group]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    });
  }

  return (
    <div className={`song-filter-panel${className ? ` ${className}` : ''}`} id={id}>
      {options.languages.length > 1 && (
        <div className="song-filter-group">
          <span className="song-filter-label">Language</span>
          {options.languages.map((code) => (
            <button
              key={code}
              type="button"
              className="song-filter-chip"
              aria-pressed={filters.languages.includes(code)}
              onClick={() => toggle('languages', code)}
            >
              {languageName(code)}
            </button>
          ))}
        </div>
      )}
      {options.keys.length > 0 && (
        <div className="song-filter-group">
          <span className="song-filter-label">Key</span>
          {options.keys.map((key) => (
            <button
              key={key}
              type="button"
              className="song-filter-chip"
              aria-pressed={filters.keys.includes(key)}
              onClick={() => toggle('keys', key)}
            >
              {key}
            </button>
          ))}
        </div>
      )}
      {options.hasTempo && (
        <div className="song-filter-group">
          <span className="song-filter-label">BPM</span>
          {BPM_BUCKETS.map((bucket) => (
            <button
              key={bucket.id}
              type="button"
              className="song-filter-chip"
              aria-pressed={filters.bpm.includes(bucket.id)}
              onClick={() => toggle('bpm', bucket.id)}
            >
              {bucket.label}
            </button>
          ))}
        </div>
      )}
      {activeCount > 0 && (
        <div className="song-filter-footer">
          <span>
            {resultCount} of {songs.length} songs
            {filters.keys.length > 0 || filters.bpm.length > 0 ? ' · songs without key/BPM are hidden' : ''}
          </span>
          <button type="button" className="song-filter-clear" onClick={() => onChange(EMPTY_SONG_FILTERS)}>
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
