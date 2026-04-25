import { useSongs } from '../context/SongsContext';
import SongList from '../components/SongList';

export default function HomePage() {
  const { songs } = useSongs();
  return <SongList songs={songs} />;
}
