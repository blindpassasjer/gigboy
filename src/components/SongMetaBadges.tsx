import { Gauge, KeyRound, StickyNote, Paperclip, Mic } from 'lucide-react';
import type { Song } from '../types';
import type { SongBadgeCounts } from '../hooks/useSongListBadges';

interface Props {
  song: Song;
  counts?: SongBadgeCounts;
  pulseTempo?: boolean;
}

export default function SongMetaBadges({ song, counts, pulseTempo = false }: Props) {
  const hasAny =
    song.tempo || song.key || (counts && (counts.notes > 0 || counts.attachments > 0 || counts.recordings > 0));

  if (!hasAny) return null;

  return (
    <>
      {song.key && (
        <span className="song-meta-badge" title={`Key: ${song.key}`}>
          <KeyRound size={11} /> {song.key}
        </span>
      )}
      {song.tempo ? (
        <span
          className={`song-meta-badge${pulseTempo ? ' song-meta-badge--pulse' : ''}`}
          title={`Tempo: ${song.tempo} BPM`}
        >
          <Gauge size={11} /> {song.tempo}
          {pulseTempo && (
            <>
              <span
                className="tempo-pulse-ring"
                style={{ animationDuration: `${60000 / song.tempo}ms` }}
                aria-hidden="true"
              />
              <span
                className="tempo-pulse-dot"
                style={{ animationDuration: `${60000 / song.tempo}ms` }}
                aria-hidden="true"
              />
            </>
          )}
        </span>
      ) : null}
      {counts && counts.notes > 0 && (
        <span className="song-meta-badge" title={`${counts.notes} note${counts.notes === 1 ? '' : 's'}`}>
          <StickyNote size={11} /> {counts.notes}
        </span>
      )}
      {counts && counts.attachments > 0 && (
        <span className="song-meta-badge" title={`${counts.attachments} attachment${counts.attachments === 1 ? '' : 's'}`}>
          <Paperclip size={11} /> {counts.attachments}
        </span>
      )}
      {counts && counts.recordings > 0 && (
        <span className="song-meta-badge" title={`${counts.recordings} recording${counts.recordings === 1 ? '' : 's'}`}>
          <Mic size={11} /> {counts.recordings}
        </span>
      )}
    </>
  );
}
