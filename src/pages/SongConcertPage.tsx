import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBands } from '../context/BandsContext';
import ConcertModeView from '../components/ConcertModeView';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useBandTransposePrefs } from '../hooks/useBandTransposePrefs';

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

  const { bandSongsByBandId } = useBands();

  const inferredBandId = id
    ? (Object.entries(bandSongsByBandId).find(([, bandSongs]) => bandSongs.some((s) => s.id === id))?.[0] ?? null)
    : null;
  const bandId = pageState?.bandId ?? bandIdFromQuery ?? inferredBandId ?? null;

  const bandSongs = bandId ? (bandSongsByBandId[bandId] ?? []) : [];
  const song = bandSongs.find((s) => s.id === id) ?? null;

  // Self-host has no plan gating — the metronome is always available.
  const canUseMetronome = true;

  const backRoute = pageState?.backTo ?? (id ? `/songs/${id}` : '/');

  const transposeBySongId = useBandTransposePrefs(bandId);

  useDocumentTitle(song ? `${song.title} — Concert Mode` : 'Concert Mode');

  if (!bandId) {
    return <Navigate to="/" replace />;
  }

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
      transposeBySongId={transposeBySongId}
    />
  );
}
