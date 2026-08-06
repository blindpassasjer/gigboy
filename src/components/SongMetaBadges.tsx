import { Gauge, KeyRound, StickyNote, Paperclip, Mic } from 'lucide-react';
import type { Song } from '../types';
import type { SongBadgeCounts } from '../hooks/useSongListBadges';

interface Props {
  song: Song;
  counts?: SongBadgeCounts;
}

export default function SongMetaBadges({ song, counts }: Props) {
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
        <span className="song-meta-badge" title={`Tempo: ${song.tempo} BPM`}>
          <span
            className="song-meta-badge-pulse"
            style={{ animationDuration: `${60000 / song.tempo}ms` }}
          >
            <Gauge size={11} /> {song.tempo}
          </span>
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
