import { useCallback, useEffect, useState } from 'react';
import { db, storage } from '../lib/firebase';
import {
  deleteSongAttachmentPermanently,
  loadTrashedSongAttachments,
  restoreSongAttachmentFromTrash,
  type AttachmentsScope,
  type TrashedSongAttachment,
} from '../lib/songAttachments';

export function useAttachmentsTrash(scope: AttachmentsScope | null) {
  const [trashedAttachments, setTrashedAttachments] = useState<TrashedSongAttachment[]>([]);

  const scopeKey = scope ? (scope.type === 'band' ? `band:${scope.bandId}` : `user:${scope.ownerId}`) : null;

  const refresh = useCallback(async () => {
    if (!db || !scope) {
      setTrashedAttachments([]);
      return;
    }
    try {
      const items = await loadTrashedSongAttachments(db, storage, scope);
      setTrashedAttachments(items);
    } catch (err) {
      console.error('Failed to load trashed attachments', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const restoreAttachmentFromTrash = useCallback(async (trashId: string): Promise<string | null> => {
    if (!db || !scope) return 'Attachments require cloud sync.';
    const target = trashedAttachments.find((entry) => entry.trashId === trashId);
    if (!target) return 'Trash item not found.';

    setTrashedAttachments((prev) => prev.filter((entry) => entry.trashId !== trashId));

    try {
      await restoreSongAttachmentFromTrash(db, scope, target);
      return null;
    } catch (err) {
      setTrashedAttachments((prev) => [target, ...prev]);
      return err instanceof Error ? err.message : 'Failed to restore attachment.';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, trashedAttachments]);

  const deleteAttachmentPermanently = useCallback(async (trashId: string): Promise<string | null> => {
    if (!db || !storage || !scope) return 'Attachments require cloud sync.';
    const target = trashedAttachments.find((entry) => entry.trashId === trashId);
    if (!target) return 'Trash item not found.';

    setTrashedAttachments((prev) => prev.filter((entry) => entry.trashId !== trashId));

    try {
      await deleteSongAttachmentPermanently(db, storage, scope, target);
      return null;
    } catch (err) {
      setTrashedAttachments((prev) => [target, ...prev]);
      return err instanceof Error ? err.message : 'Failed to permanently delete attachment.';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, trashedAttachments]);

  return { trashedAttachments, restoreAttachmentFromTrash, deleteAttachmentPermanently };
}
