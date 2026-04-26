import { useSongs } from '../context/SongsContext';
import AddSongForm from '../components/AddSongForm';
import type { Song } from '../types';

export default function AddSongPage() {
  const { addSong } = useSongs();

  async function handleAdd(song: Song): Promise<string | null> {
    return addSong(song);
  }

  return <AddSongForm onAdd={handleAdd} />;
}
