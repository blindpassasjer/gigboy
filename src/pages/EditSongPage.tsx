import { useLocation, useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import { useBands } from '../context/BandsContext';
import AddSongForm from '../components/AddSongForm';
import type { Song } from '../types';

type SongPageState = {
  backTo?: string;
  backLabel?: string;
  bandId?: string;
};

export default function EditSongPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { songs, updateSong } = useSongs();
  const { categories, songLists, activeSongListId, addSongToList, removeSongFromList } = useSongLists();
  const { bandSongsByBandId, bandSongListsByBandId, addSongToBandSongList, removeSongFromBandSongList, updateBandSong } = useBands();
  const pageState = location.state as SongPageState | null;
  const bandId = pageState?.bandId;
  const bandSongs = bandId ? (bandSongsByBandId[bandId] ?? []) : [];
  const song = bandSongs.find((s) => s.id === id) ?? songs.find((s) => s.id === id);

  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  const songListOptions = (bandId
    ? (bandSongListsByBandId[bandId] ?? []).map((list) => ({
      id: list.id,
      label: list.name,
    }))
    : songLists.map((list) => {
    const categoryName = list.folderId ? categoryNameById.get(list.folderId) : undefined;
    return {
      id: list.id,
      label: categoryName ? `${categoryName} / ${list.name}` : list.name,
    };
  }));

  const initialSongListId =
    (bandId
      ? (bandSongListsByBandId[bandId] ?? []).find((list) => (song ? list.songIds.includes(song.id) : false))?.id
      : (activeSongListId ?? songLists.find((list) => (song ? list.songIds.includes(song.id) : false))?.id)) ??
    '';

  async function handleSave(updatedSong: Song): Promise<string | null> {
    if (bandId) {
      return updateBandSong(bandId, updatedSong);
    }
    return updateSong(updatedSong);
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
          if (bandId) {
            if (previousSongListId && previousSongListId !== nextSongListId) {
              void removeSongFromBandSongList(bandId, previousSongListId, songId);
            }
            if (nextSongListId) {
              void addSongToBandSongList(bandId, nextSongListId, songId);
            }
            return;
          }
          if (previousSongListId && previousSongListId !== nextSongListId) {
            removeSongFromList(previousSongListId, songId);
          }
          if (nextSongListId) {
            addSongToList(nextSongListId, songId);
          }
        }}
        songPageState={pageState ?? undefined}
      />
    </div>
  );
}
