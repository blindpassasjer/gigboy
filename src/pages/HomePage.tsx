import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import SongList from '../components/SongList';
import type { Song } from '../types';

export default function HomePage() {
  const { songs, updateSong, deleteSong } = useSongs();
  const { activeFolderId, activeSongListId, folders, songLists } = useSongLists();

  const activeList = songLists.find((l) => l.id === activeSongListId) ?? null;
  const activeFolder = folders.find((folder) => folder.id === activeFolderId) ?? null;
  const activeFolderSongIds = activeFolder
    ? new Set(
        songLists
          .filter((list) => list.folderId === activeFolder.id)
          .flatMap((list) => list.songIds)
      )
    : null;
  const displayedSongs = activeList
    ? songs.filter((song) => activeList.songIds.includes(song.id))
    : activeFolderSongIds
      ? songs.filter((song) => activeFolderSongIds.has(song.id))
      : songs;

  async function handleRenameSong(song: Song) {
    const nextTitle = window.prompt('Rename song', song.title);
    if (nextTitle === null) return;
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === song.title) return;
    const err = await updateSong({
      ...song,
      title: trimmed,
      updatedAt: new Date().toISOString(),
    });
    if (err) {
      window.alert(`Could not rename song: ${err}`);
    }
  }

  async function handleDeleteSong(song: Song) {
    const confirmed = window.confirm(`Delete "${song.title}"? This cannot be undone.`);
    if (!confirmed) return;
    await deleteSong(song.id);
  }

  return (
    <SongList
      songs={displayedSongs}
      listName={activeList?.name ?? activeFolder?.name}
      onRenameSong={handleRenameSong}
      onDeleteSong={handleDeleteSong}
    />
  );
}
