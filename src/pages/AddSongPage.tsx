import { useLocation, Navigate } from 'react-router-dom';
import { useBands } from '../context/BandsContext';
import AddSongForm from '../components/AddSongForm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Song } from '../types';

type AddSongScopeState = {
  addSongScope?: {
    kind?: 'band';
    bandId?: string;
  };
  initialSongListId?: string;
};

export default function AddSongPage() {
  useDocumentTitle('Add Song');
  const location = useLocation();
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

  if (!activeBandId) {
    return <Navigate to="/" replace />;
  }

  const bandId: string = activeBandId;

  const songListOptions = (bandSongListsByBandId[bandId] ?? []).map((list) => ({
    id: list.id,
    label: list.name,
  }));

  const initialSongListId = pageState?.initialSongListId ?? '';
  const songPageState = {
    backTo: `/bands/${bandId}/library`,
    backLabel: 'Band library',
    bandId,
  };

  async function handleAdd(song: Song): Promise<string | null> {
    return addSongToBandLibrary(bandId, song);
  }

  function handleSongListChange(songListId: string, _previousSongListId: string, songId: string) {
    void addSongToBandSongList(bandId, songListId, songId);
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
