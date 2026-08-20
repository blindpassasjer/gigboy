import { useLocation, useParams, Link, Navigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBands } from '../context/BandsContext';
import AddSongForm from '../components/AddSongForm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Song } from '../types';

type SongPageState = {
  backTo?: string;
  backLabel?: string;
  bandId?: string;
};

export default function EditSongPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { bandSongsByBandId, bandSongListsByBandId, addSongToBandSongList, removeSongFromBandSongList, updateBandSong } = useBands();
  const pageState = location.state as SongPageState | null;
  const scopedBandId = pageState?.bandId ?? null;
  const bandSongs = scopedBandId ? (bandSongsByBandId[scopedBandId] ?? []) : [];
  const song = bandSongs.find((s) => s.id === id);

  useDocumentTitle(song ? `Edit ${song.title}` : 'Edit Song');

  if (!scopedBandId) {
    return <Navigate to="/" replace />;
  }

  const bandId: string = scopedBandId;

  const songListOptions = (bandSongListsByBandId[bandId] ?? []).map((list) => ({
    id: list.id,
    label: list.name,
  }));

  const initialSongListId =
    (bandSongListsByBandId[bandId] ?? []).find((list) => (song ? list.songIds.includes(song.id) : false))?.id ?? '';

  async function handleSave(updatedSong: Song): Promise<string | null> {
    return updateBandSong(bandId, updatedSong);
  }

  if (!song) {
    return (
      <div className="not-found">
        <p>Song not found.</p>
        <Link to={pageState?.backTo ?? '/'} className="back-link"><ArrowLeft size={16} /> Back to list</Link>
      </div>
    );
  }

  return (
    <div>
      <Link to={`/songs/${song.id}`} state={pageState ?? undefined} className="back-link"><ArrowLeft size={16} /> Back to song</Link>
      <AddSongForm
        mode="edit"
        initialSong={song}
        onSave={handleSave}
        songListOptions={songListOptions}
        initialSongListId={initialSongListId}
        onSongListChange={(nextSongListId, previousSongListId, songId) => {
          if (previousSongListId && previousSongListId !== nextSongListId) {
            void removeSongFromBandSongList(bandId, previousSongListId, songId);
          }
          if (nextSongListId) {
            void addSongToBandSongList(bandId, nextSongListId, songId);
          }
        }}
        songPageState={pageState ?? undefined}
      />
    </div>
  );
}
