import { useCallback, useEffect, useState } from 'react';
import TrashView, { type TrashListItem } from '../components/TrashView';
import { dataClient } from '../lib/dataClient';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/**
 * Personal trash — reuses `TrashView.tsx` exactly as `BandDetailPage.tsx` does for band
 * trash, but wired to `dataClient.trash` so it works identically against both the hosted
 * Firebase SaaS and the self-host Express/Postgres backend. This is the first UI for
 * personal trash/restore; the underlying Firestore logic (`restoreSongFromTrash`, etc. in
 * `SongsContext`/`SongListsContext`/`SetlistsContext`) already existed but was never wired
 * up to any page.
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
