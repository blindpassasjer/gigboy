import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import AddSongForm from '../components/AddSongForm';
import type { Song } from '../types';

export default function AddSongPage() {
  const { addSong } = useSongs();
  const { folders, songLists, activeSongListId, addSongToList } = useSongLists();

  const folderNameById = new Map(folders.map((folder) => [folder.id, folder.name]));
  const songListOptions = songLists.map((list) => {
    const folderName = list.folderId ? folderNameById.get(list.folderId) : undefined;
    return {
      id: list.id,
      label: folderName ? `${folderName} / ${list.name}` : list.name,
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
