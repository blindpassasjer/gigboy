import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import { useSetlists } from '../context/SetlistsContext';
import SongList from '../components/SongList';
import SetlistsView from '../components/SetlistsView';
import type { Song } from '../types';
import { showConfirmToast } from '../utils/toastDialogs';

const INTERNAL_SONGLISTS_CATEGORY_ID = 'songlists-default';
const ALL_SONGS_ICON_KEY = 'folio-all-songs-icon';

export default function HomePage() {
  const navigate = useNavigate();
  const { songs, deleteSong, moveSong } = useSongs();
  const {
    activeCategoryId,
    activeSongListId,
    categories,
    songLists,
    addSongToList,
    moveSongInList,
    removeSongFromList,
    deleteSongList,
    renameSongList,
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
  const [allSongsIcon, setAllSongsIcon] = useState<string | undefined>(() => {
    const stored = window.localStorage.getItem(ALL_SONGS_ICON_KEY)?.trim();
    return stored ? stored : undefined;
  });
  
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
  const isAllSongsView = !activeList && !activeCategorySongIds;

  function handleUpdateAllSongsAppearance(appearance: { icon?: string }) {
    const icon = appearance.icon?.trim();
    if (!icon) {
      window.localStorage.removeItem(ALL_SONGS_ICON_KEY);
      setAllSongsIcon(undefined);
      return;
    }

    window.localStorage.setItem(ALL_SONGS_ICON_KEY, icon);
    setAllSongsIcon(icon);
  }

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

  async function handleDeleteActiveSongList() {
    if (!activeList) return;

    const confirmed = await showConfirmToast(`Delete songlist "${activeList.name}"? This cannot be undone.`, {
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    deleteSongList(activeList.id);
  }

  return (
    <SongList
      songs={displayedSongs}
      listName={activeList?.name ?? activeCategory?.name ?? 'All Songs'}
      listIcon={activeList?.icon ?? (isAllSongsView ? allSongsIcon : undefined)}
      allSongs={activeList ? songs : undefined}
      onAddSong={activeList ? (songId) => addSongToList(activeList.id, songId) : undefined}
      onAddSongsClick={isAllSongsView ? () => navigate('/add') : undefined}
      onMoveSong={handleMoveSong}
      onDeleteSong={handleDeleteSong}
      onRenameList={
        activeList
          ? (name) => renameSongList(activeList.id, name)
          : undefined
      }
      onDeleteList={activeList ? handleDeleteActiveSongList : undefined}
      deleteListLabel={activeList ? `Delete songlist ${activeList.name}` : undefined}
      onUpdateListAppearance={
        activeList
          ? (appearance) => updateSongListAppearance(activeList.id, appearance)
          : isAllSongsView
            ? handleUpdateAllSongsAppearance
            : undefined
      }
      onRemoveSong={activeList ? (song) => removeSongFromList(activeList.id, song.id) : undefined}
      shareConfig={
        activeList
          ? {
              resourceId: activeList.id,
              resourceName: activeList.name,
            }
          : isAllSongsView
            ? {
                resourceId: '',
                resourceName: 'All Songs',
                disabled: true,
              }
            : undefined
      }
    />
  );
}
