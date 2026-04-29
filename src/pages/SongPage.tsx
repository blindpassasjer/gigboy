import { useLocation, useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSongs } from '../context/SongsContext';
import SongView from '../components/SongView';

type SongPageState = {
  backTo?: string;
  backLabel?: string;
};

export default function SongPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { songs } = useSongs();
  const song = songs.find((s) => s.id === id);
  const pageState = location.state as SongPageState | null;
  const backTo = pageState?.backTo ?? '/';
  const backLabel = pageState?.backLabel?.trim();
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
      <SongView song={song} />
    </div>
  );
}
