import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSongs } from '../context/SongsContext';
import SongView from '../components/SongView';

export default function SongPage() {
  const { id } = useParams<{ id: string }>();
  const { songs } = useSongs();
  const song = songs.find((s) => s.id === id);

  if (!song) {
    return (
      <div className="not-found">
        <p>Song not found.</p>
        <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to list</Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/" className="back-link"><ArrowLeft size={16} /> All songs</Link>
      <SongView song={song} />
    </div>
  );
}
