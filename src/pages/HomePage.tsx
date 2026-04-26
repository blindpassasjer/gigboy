import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import SongList from '../components/SongList';
import type { Song } from '../types';

export default function HomePage() {
  const { songs, updateSong, deleteSong, moveSong } = useSongs();
  const { activeCategoryId, activeSongListId, categories, songLists, moveSongInList } = useSongLists();

  const activeList = songLists.find((l) => l.id === activeSongListId) ?? null;
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? null;
  const songsById = new Map(songs.map((song) => [song.id, song]));
  const activeCategorySongIds = activeCategory
    ? new Set(
        songLists
          .filter((list) => list.folderId === activeCategory.id)
          .flatMap((list) => list.songIds)
      )
    : null;
  const displayedSongs = activeList
    ? activeList.songIds
        .map((songId) => songsById.get(songId))
        .filter((song): song is Song => Boolean(song))
    : activeCategorySongIds
      ? songs.filter((song) => activeCategorySongIds.has(song.id))
      : songs;

  function handleMoveSong(songId: string, beforeSongId: string | null) {
    if (activeList) {
      moveSongInList(activeList.id, songId, beforeSongId);
      return;
    }

    moveSong(songId, beforeSongId);
  }

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
      listName={activeList?.name ?? activeCategory?.name}
      onMoveSong={handleMoveSong}
      onRenameSong={handleRenameSong}
      onDeleteSong={handleDeleteSong}
    />
  );
}
