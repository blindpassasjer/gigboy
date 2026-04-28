import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import { useSetlists } from '../context/SetlistsContext';
import SongList from '../components/SongList';
import SetlistsView from '../components/SetlistsView';
import type { Song } from '../types';

const INTERNAL_SONGLISTS_CATEGORY_ID = 'songlists-default';

export default function HomePage() {
  const { songs, updateSong, deleteSong, moveSong } = useSongs();
  const {
    activeCategoryId,
    activeSongListId,
    categories,
    songLists,
    addSongToList,
    moveSongInList,
    removeSongFromList,
    updateSongListAppearance,
  } = useSongLists();
  const {
    setlists,
    activeSetlistId,
    addSongToSetlist,
    removeSongFromSetlist,
    moveSongInSetlist,
  } = useSetlists();

  const activeList = songLists.find((l) => l.id === activeSongListId) ?? null;
  const activeSetlist = setlists.find((s) => s.id === activeSetlistId) ?? null;
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? null;
  const songsById = new Map(songs.map((song) => [song.id, song]));
  
  // If viewing a setlist, show SetlistsView
  if (activeSetlist) {
    const setlistSongs = activeSetlist.songIds
      .map((songId) => songsById.get(songId))
      .filter((song): song is Song => Boolean(song));

    return (
      <SetlistsView
        setlistId={activeSetlist.id}
        setlistName={activeSetlist.name}
        songs={setlistSongs}
        allSongs={songs}
        onAddSong={(songId) => addSongToSetlist(activeSetlist.id, songId)}
        onMoveSong={(songId, beforeSongId) => moveSongInSetlist(activeSetlist.id, songId, beforeSongId)}
        onRemoveSong={(songId) => removeSongFromSetlist(activeSetlist.id, songId)}
      />
    );
  }

  const shouldFilterByCategory = Boolean(
    activeCategory && activeCategory.id !== INTERNAL_SONGLISTS_CATEGORY_ID
  );

  const activeCategoryFilterId = shouldFilterByCategory
    ? activeCategory?.id ?? null
    : null;

  const activeCategorySongIds = activeCategoryFilterId
    ? new Set(
        songLists
          .filter((list) => list.folderId === activeCategoryFilterId)
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

  async function handleSetSongColor(song: Song, color: string | undefined) {
    const err = await updateSong({
      ...song,
      color,
      updatedAt: new Date().toISOString(),
    });
    if (err) {
      window.alert(`Could not update song color: ${err}`);
    }
  }

  return (
    <SongList
      songs={displayedSongs}
      listName={activeList?.name ?? activeCategory?.name ?? 'All Songs'}
      allSongs={activeList ? songs : undefined}
      onAddSong={activeList ? (songId) => addSongToList(activeList.id, songId) : undefined}
      onMoveSong={handleMoveSong}
      onRenameSong={handleRenameSong}
      onDeleteSong={handleDeleteSong}
      listColor={activeList?.color}
      listIcon={activeList?.icon}
      onUpdateListAppearance={
        activeList
          ? (appearance) => updateSongListAppearance(activeList.id, appearance)
          : undefined
      }
      onSetSongColor={handleSetSongColor}
      onRemoveSong={activeList ? (song) => removeSongFromList(activeList.id, song.id) : undefined}
    />
  );
}
