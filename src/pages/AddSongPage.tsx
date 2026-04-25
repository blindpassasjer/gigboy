import { useSongs } from '../context/SongsContext';
import AddSongForm from '../components/AddSongForm';
import type { Song } from '../types';

export default function AddSongPage() {
  const { addSong } = useSongs();

  function handleAdd(song: Song) {
    addSong(song);
  }

  return <AddSongForm onAdd={handleAdd} />;
}
