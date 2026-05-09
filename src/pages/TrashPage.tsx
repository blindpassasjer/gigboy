import { useMemo } from 'react';
import TrashView from '../components/TrashView';
import { useSongLists } from '../context/SongListsContext';
import { useSongs } from '../context/SongsContext';
import { useSetlists } from '../context/SetlistsContext';

export default function TrashPage() {
  const { trashedSongs, restoreSongFromTrash, deleteSongPermanently } = useSongs();
  const { trashedSongLists, restoreSongListFromTrash, deleteSongListPermanently } = useSongLists();
  const { trashedSetlists, restoreSetlistFromTrash, deleteSetlistPermanently } = useSetlists();

  const items = useMemo(() => [
    ...trashedSongs.map((entry) => ({
      trashId: entry.trashId,
      itemType: 'song' as const,
      name: entry.song.title,
      deletedAt: entry.deletedAt,
      purgeAt: entry.purgeAt,
    })),
    ...trashedSongLists.map((entry) => ({
      trashId: entry.trashId,
      itemType: 'songlist' as const,
      name: entry.songList.name,
      deletedAt: entry.deletedAt,
      purgeAt: entry.purgeAt,
    })),
    ...trashedSetlists.map((entry) => ({
      trashId: entry.trashId,
      itemType: 'setlist' as const,
      name: entry.setlist.name,
      deletedAt: entry.deletedAt,
      purgeAt: entry.purgeAt,
    })),
  ], [trashedSetlists, trashedSongLists, trashedSongs]);

  const itemTypeByTrashId = useMemo(() => {
    const map = new Map<string, 'song' | 'songlist' | 'setlist'>();
    trashedSongs.forEach((entry) => map.set(entry.trashId, 'song'));
    trashedSongLists.forEach((entry) => map.set(entry.trashId, 'songlist'));
    trashedSetlists.forEach((entry) => map.set(entry.trashId, 'setlist'));
    return map;
  }, [trashedSetlists, trashedSongLists, trashedSongs]);

  const handleRestore = async (trashId: string) => {
    const type = itemTypeByTrashId.get(trashId);
    if (!type) return 'Trash item not found.';
    if (type === 'song') return restoreSongFromTrash(trashId);
    if (type === 'songlist') return restoreSongListFromTrash(trashId);
    return restoreSetlistFromTrash(trashId);
  };

  const handleDeletePermanently = async (trashId: string) => {
    const type = itemTypeByTrashId.get(trashId);
    if (!type) return 'Trash item not found.';
    if (type === 'song') return deleteSongPermanently(trashId);
    if (type === 'songlist') return deleteSongListPermanently(trashId);
    return deleteSetlistPermanently(trashId);
  };

  const handleEmptyTrash = async () => {
    const results = await Promise.allSettled(
      items.map((item) => handleDeletePermanently(item.trashId))
    );

    const failedCount = results.reduce((count, result) => {
      if (result.status === 'rejected') return count + 1;
      if (result.value) return count + 1;
      return count;
    }, 0);

    if (failedCount === 0) return null;
    if (failedCount === items.length) return 'Failed to empty trash.';
    return `Deleted ${items.length - failedCount} item${items.length - failedCount === 1 ? '' : 's'}, but ${failedCount} item${failedCount === 1 ? '' : 's'} could not be deleted.`;
  };

  return (
    <TrashView
      title="Solo Trash"
      emptyMessage="Trash is empty."
      items={items}
      onRestore={handleRestore}
      onDeletePermanently={handleDeletePermanently}
      onEmptyTrash={handleEmptyTrash}
    />
  );
}
