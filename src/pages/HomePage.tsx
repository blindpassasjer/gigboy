import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import { useSetlists } from '../context/SetlistsContext';
import SongList from '../components/SongList';
import SetlistsView from '../components/SetlistsView';
import type { Song } from '../types';
import { showConfirmToast } from '../utils/toastDialogs';

const INTERNAL_SONGLISTS_CATEGORY_ID = 'songlists-default';

export default function HomePage() {
  const { songs, deleteSong, moveSong } = useSongs();
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

  async function handleDeleteSong(song: Song) {
    const confirmed = await showConfirmToast(`Delete "${song.title}"? This cannot be undone.`, {
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    await deleteSong(song.id);
  }

  return (
    <SongList
      songs={displayedSongs}
      listName={activeList?.name ?? activeCategory?.name ?? 'All Songs'}
      allSongs={activeList ? songs : undefined}
      onAddSong={activeList ? (songId) => addSongToList(activeList.id, songId) : undefined}
      onMoveSong={handleMoveSong}
      onDeleteSong={handleDeleteSong}
      listIcon={activeList?.icon}
      onUpdateListAppearance={
        activeList
          ? (appearance) => updateSongListAppearance(activeList.id, appearance)
          : undefined
      }
      onRemoveSong={activeList ? (song) => removeSongFromList(activeList.id, song.id) : undefined}
      shareConfig={
        activeList
          ? {
              resourceId: activeList.id,
              resourceName: activeList.name,
            }
          : undefined
      }
    />
  );
}
