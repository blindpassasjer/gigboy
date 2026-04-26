import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import AddSongForm from '../components/AddSongForm';
import type { Song } from '../types';

export default function AddSongPage() {
  const { addSong } = useSongs();
  const { categories, songLists, activeSongListId, addSongToList } = useSongLists();

  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  const songListOptions = songLists.map((list) => {
    const categoryName = list.folderId ? categoryNameById.get(list.folderId) : undefined;
    return {
      id: list.id,
      label: categoryName ? `${categoryName} / ${list.name}` : list.name,
    };
  });

  async function handleAdd(song: Song): Promise<string | null> {
    return addSong(song);
  }

  return (
    <AddSongForm
      onSave={handleAdd}
      songListOptions={songListOptions}
      initialSongListId={activeSongListId ?? ''}
      onSongListChange={(songListId, songId) => addSongToList(songListId, songId)}
    />
  );
}
