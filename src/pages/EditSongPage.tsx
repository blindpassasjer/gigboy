import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import AddSongForm from '../components/AddSongForm';
import type { Song } from '../types';

export default function EditSongPage() {
  const { id } = useParams<{ id: string }>();
  const { songs, updateSong } = useSongs();
  const { categories, songLists, activeSongListId, addSongToList } = useSongLists();
  const song = songs.find((s) => s.id === id);

  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  const songListOptions = songLists.map((list) => {
    const categoryName = list.folderId ? categoryNameById.get(list.folderId) : undefined;
    return {
      id: list.id,
      label: categoryName ? `${categoryName} / ${list.name}` : list.name,
    };
  });

  const initialSongListId =
    activeSongListId ??
    songLists.find((list) => (song ? list.songIds.includes(song.id) : false))?.id ??
    '';

  async function handleSave(updatedSong: Song): Promise<string | null> {
    return updateSong(updatedSong);
  }

  if (!song) {
    return (
      <div className="not-found">
        <p>Song not found.</p>
        <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to list</Link>
      </div>
    );
  }

  return (
    <div>
      <Link to={`/songs/${song.id}`} className="back-link"><ArrowLeft size={16} /> Back to song</Link>
      <AddSongForm
        mode="edit"
        initialSong={song}
        onSave={handleSave}
        songListOptions={songListOptions}
        initialSongListId={initialSongListId}
        onSongListChange={(songListId, songId) => addSongToList(songListId, songId)}
      />
    </div>
  );
}
