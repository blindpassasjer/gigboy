import { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSongs } from '../context/SongsContext';
import { useBands } from '../context/BandsContext';
import { usePlan, useBandPlan } from '../hooks/usePlan';
import type { Song } from '../types';
import ConcertModeView from '../components/ConcertModeView';

type SongPageState = {
  backTo?: string;
  bandId?: string;
};

export default function SongConcertPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const pageState = location.state as SongPageState | null;
  const searchParams = new URLSearchParams(location.search);
  const bandIdFromQuery = searchParams.get('bandId')?.trim() || null;

  const { songs } = useSongs();
  const { bandSongsByBandId, bands, updateBandSong } = useBands();
  const { updateSong } = useSongs();

  const inferredBandId = id
    ? (Object.entries(bandSongsByBandId).find(([, bandSongs]) => bandSongs.some((s) => s.id === id))?.[0] ?? null)
    : null;
  const bandId = pageState?.bandId ?? bandIdFromQuery ?? inferredBandId ?? undefined;

  const bandSongs = bandId ? (bandSongsByBandId[bandId] ?? []) : [];
  const song = bandSongs.find((s) => s.id === id) ?? songs.find((s) => s.id === id) ?? null;

  const band = useMemo(() => (bandId ? (bands.find((b) => b.id === bandId) ?? null) : null), [bandId, bands]);
  const userPlanState = usePlan();
  const bandPlanState = useBandPlan(band);
  const canUseMetronome = (bandId && band ? bandPlanState : userPlanState).canUse('metronome');

  const backRoute = pageState?.backTo ?? (id ? `/songs/${id}` : '/');

  const handlePinTranspose = async (s: Song, transpose: number) => {
    const nextSong: Song = {
      ...s,
      preferredTranspose: transpose,
      updatedAt: new Date().toISOString(),
    };
    if (bandId) {
      const error = await updateBandSong(bandId, nextSong);
      if (error) window.alert(`Could not save pinned transpose: ${error}`);
    } else {
      await updateSong(nextSong);
    }
  };

  if (!song) {
    return (
      <div className="not-found">
        <p>Song not found.</p>
        <Link to={backRoute} className="back-link"><ArrowLeft size={16} /> Back</Link>
      </div>
    );
  }

  return (
    <ConcertModeView
      songs={[song]}
      title=""
      backRoute={backRoute}
      bandId={bandId}
      canUseMetronome={canUseMetronome}
      onPinTranspose={handlePinTranspose}
    />
  );
}
