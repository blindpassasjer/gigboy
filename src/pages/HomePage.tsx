import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import SongList from '../components/SongList';

export default function HomePage() {
  const { songs } = useSongs();
  const { activeSongListId, songLists } = useSongLists();

  const activeList = songLists.find((l) => l.id === activeSongListId) ?? null;
  const displayedSongs = activeList
    ? songs.filter((s) => activeList.songIds.includes(s.id))
    : songs;

  return <SongList songs={displayedSongs} listName={activeList?.name} />;
}
