import { useLocation } from 'react-router-dom';
import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import { useBands } from '../context/BandsContext';
import AddSongForm from '../components/AddSongForm';
import type { Song } from '../types';

type AddSongScopeState = {
  addSongScope?: {
    kind?: 'band';
    bandId?: string;
  };
  initialSongListId?: string;
};

export default function AddSongPage() {
  const location = useLocation();
  const { addSong } = useSongs();
  const { categories, songLists, activeSongListId, addSongToList } = useSongLists();
  const {
    bands,
    bandSongListsByBandId,
    addSongToBandLibrary,
    addSongToBandSongList,
  } = useBands();

  const pageState = location.state as AddSongScopeState | null;
  const requestedScope = pageState?.addSongScope;
  const hasScopedBand = requestedScope?.kind === 'band'
    && typeof requestedScope.bandId === 'string'
    && bands.some((band) => band.id === requestedScope.bandId);
  const activeBandId = hasScopedBand ? requestedScope?.bandId ?? null : null;

  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  const songListOptions = activeBandId
    ? (bandSongListsByBandId[activeBandId] ?? []).map((list) => ({
      id: list.id,
      label: list.name,
    }))
    : songLists.map((list) => {
      const categoryName = list.folderId ? categoryNameById.get(list.folderId) : undefined;
      return {
        id: list.id,
        label: categoryName ? `${categoryName} / ${list.name}` : list.name,
      };
    });

  const initialSongListId = activeBandId
    ? (pageState?.initialSongListId ?? '')
    : (activeSongListId ?? '');
  const songPageState = activeBandId
    ? {
      backTo: `/bands/${activeBandId}/library`,
      backLabel: 'Band library',
      bandId: activeBandId,
    }
    : undefined;

  async function handleAdd(song: Song): Promise<string | null> {
    if (activeBandId) {
      return addSongToBandLibrary(activeBandId, song);
    }

    return addSong(song);
  }

  function handleSongListChange(songListId: string, _previousSongListId: string, songId: string) {
    if (activeBandId) {
      void addSongToBandSongList(activeBandId, songListId, songId);
      return;
    }
    addSongToList(songListId, songId);
  }

  return (
    <AddSongForm
      onSave={handleAdd}
      songListOptions={songListOptions}
      initialSongListId={initialSongListId}
      onSongListChange={handleSongListChange}
      songPageState={songPageState}
    />
  );
}
