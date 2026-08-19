import { useCallback, useEffect, useState } from 'react';
import TrashView, { type TrashListItem } from '../components/TrashView';
import { dataClient } from '../lib/dataClient';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/**
 * Personal trash — reuses `TrashView.tsx` exactly as `BandDetailPage.tsx` does for band
 * trash, wired to `dataClient.trash` (self-host Express/Postgres backend). The server moves
 * songs/song-lists/setlists here automatically on delete (see `server/routes/crud.ts`); this
 * is the only UI for personal trash/restore — `SongsContext`/`SongListsContext`/
 * `SetlistsContext` no longer carry their own separate trash state.
 */
export default function TrashPage() {
  useDocumentTitle('Trash');
  const [items, setItems] = useState<TrashListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrash = useCallback(async () => {
    try {
      const nextItems = await dataClient.trash.list();
      setItems(nextItems);
    } catch (error) {
      console.error('Failed to load trash.', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrash();
  }, [loadTrash]);

  if (loading) {
    return <p className="bands-status">Loading trash…</p>;
  }

  return (
    <TrashView
      title="Trash"
      emptyMessage="Trash is empty."
      items={items}
      onRestore={async (trashId) => {
        const error = await dataClient.trash.restore(trashId);
        await loadTrash();
        return error;
      }}
      onDeletePermanently={async (trashId) => {
        const error = await dataClient.trash.remove(trashId);
        await loadTrash();
        return error;
      }}
      onEmptyTrash={async () => {
        const error = await dataClient.trash.empty();
        await loadTrash();
        return error;
      }}
    />
  );
}
