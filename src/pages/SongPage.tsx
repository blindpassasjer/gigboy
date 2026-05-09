import { useLocation, useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSongs } from '../context/SongsContext';
import { useBands } from '../context/BandsContext';
import SongView from '../components/SongView';

type SongPageState = {
  backTo?: string;
  backLabel?: string;
  bandId?: string;
};

export default function SongPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { songs } = useSongs();
  const { bandSongsByBandId } = useBands();
  const pageState = location.state as SongPageState | null;
  const searchParams = new URLSearchParams(location.search);
  const bandIdFromQuery = searchParams.get('bandId')?.trim() || null;
  const inferredBandId = id
    ? (Object.entries(bandSongsByBandId).find(([, bandSongs]) => bandSongs.some((song) => song.id === id))?.[0] ?? null)
    : null;
  const bandId = pageState?.bandId ?? bandIdFromQuery ?? inferredBandId ?? undefined;
  const backTo = pageState?.backTo ?? '/';
  const backLabel = pageState?.backLabel?.trim();
  const bandSongs = bandId ? (bandSongsByBandId[bandId] ?? []) : [];
  const song = (bandSongs.find((s) => s.id === id) ?? songs.find((s) => s.id === id));
  const backLinkText = backLabel ? `Return to ${backLabel}` : 'All songs';

  if (!song) {
    return (
      <div className="not-found">
        <p>Song not found.</p>
        <Link to={backTo} className="back-link"><ArrowLeft size={16} /> {backLinkText}</Link>
      </div>
    );
  }

  return (
    <div>
      <Link to={backTo} className="back-link"><ArrowLeft size={16} /> {backLinkText}</Link>
      <SongView song={song} bandId={bandId} />
    </div>
  );
}
