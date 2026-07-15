/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import type { Setlist, TrashedSetlist } from '../types';
import { loadAcceptedSharedResources } from '../lib/collaboration';
import { db } from '../lib/firebase';
import {
  compareTrashByDeletedAtDesc,
  createTrashPayload,
  createTrashTimestamps,
  isTrashExpired,
  parseSetlistTrashRecord,
  TRASH_COLLECTION,
} from '../lib/trash';
import { useAuth } from './AuthContext';
import type { PublicSongEntry } from '../types';
import { moveIdBefore } from '../utils/arrayUtils';

const KEY_SETLISTS = 'gigboy-setlists';
const KEY_ACTIVE_SETLIST = 'gigboy-active-setlist';
const SETLISTS_COLLECTION = 'setlists';

function isPermissionDeniedError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === 'permission-denied';
}

function logSetlistsPermissionHelp(error: unknown) {
  console.warn(
    'Firestore denied access to users/{uid}/setlists. Setlists will stay local until Firestore rules allow this path.',
    error
  );
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function compareSetlists(a: Setlist, b: Setlist) {
  const aSortOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bSortOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;

  if (aSortOrder !== bSortOrder) {
    return aSortOrder - bSortOrder;
  }

  return a.name.localeCompare(b.name);
}

function normalizeSetlists(setlists: Setlist[]) {
  return [...setlists]
    .sort(compareSetlists)
    .map((setlist, index) => ({ ...setlist, sortOrder: index }));
}

async function writeSetlist(setlist: Setlist, userId: string | null) {
  if (!db || !userId) return;

  const targetOwnerId = setlist.ownerId ?? userId;

  const { id, ...rest } = setlist;
  const firestoreData = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
  await setDoc(doc(db, 'users', targetOwnerId, SETLISTS_COLLECTION, id), firestoreData);
}

function getRole(setlist: Setlist, userId: string | null): Setlist['accessRole'] {
  if (!userId) return undefined;
  const ownerId = setlist.ownerId;
  if (ownerId && ownerId === userId) return 'owner';
  const permission = setlist.collaborationPermissions?.[userId];
  if (permission === 'editor' || permission === 'viewer') return permission;
  return undefined;
}

function canEditSetlist(setlist: Setlist, userId: string | null) {
  const role = getRole(setlist, userId);
  return role === 'owner' || role === 'editor';
}

function isSetlistOwner(setlist: Setlist, userId: string | null) {
  const ownerId = setlist.ownerId ?? userId;
  return Boolean(userId && ownerId === userId);
}

function setlistFromDoc(id: string, data: Record<string, unknown>, ownerId: string, userId: string): Setlist {
  const setlist = { id, ownerId, ...(data as Omit<Setlist, 'id'>) } as Setlist;
  return { ...setlist, accessRole: getRole(setlist, userId) };
}

interface SetlistsContextValue {
  setlists: Setlist[];
  trashedSetlists: TrashedSetlist[];
  activeSetlistId: string | null;
  addSetlist: (name: string) => void;
  deleteSetlist: (id: string) => void;
  restoreSetlistFromTrash: (trashId: string) => Promise<string | null>;
  deleteSetlistPermanently: (trashId: string) => Promise<string | null>;
  renameSetlist: (id: string, name: string) => void;
  updateSetlistIcon: (id: string, icon?: string) => void;
  setSetlistPublicShare: (id: string, enabled: boolean, publicSongs?: PublicSongEntry[]) => Promise<string | null>;
  addSongToSetlist: (setlistId: string, songId: string) => void;
  removeSongFromSetlist: (setlistId: string, songId: string) => void;
  moveSongInSetlist: (setlistId: string, songId: string, beforeSongId: string | null) => void;
  updateSongNoteInSetlist: (setlistId: string, songId: string, note: string) => void;
  setActiveSetlistId: (id: string | null) => void;
  clearActiveSelection: () => void;
}

const SetlistsContext = createContext<SetlistsContextValue | null>(null);

export function SetlistsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [setlists, setSetlists] = useState<Setlist[]>(() =>
    normalizeSetlists(readLocal(KEY_SETLISTS, []))
  );
  const [trashedSetlists, setTrashedSetlists] = useState<TrashedSetlist[]>([]);
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(() =>
    readLocal(KEY_ACTIVE_SETLIST, null)
  );

  useEffect(() => {
    if (!db || !userId) {
      setTrashedSetlists([]);
      return;
    }

    const firestore = db;

    Promise.allSettled([
      getDocs(collection(firestore, 'users', userId, SETLISTS_COLLECTION)),
      loadAcceptedSharedResources({
        db: firestore,
        userId,
        resourceType: 'setlist',
        mapResource: (invite, id, data) => setlistFromDoc(id, data, invite.ownerId, userId),
      }),
      getDocs(collection(firestore, 'users', userId, TRASH_COLLECTION)),
    ])
      .then(([ownedResult, sharedResult, trashResult]) => {
        const ownedSnapshot = ownedResult.status === 'fulfilled' ? ownedResult.value : null;
        const sharedSetlists = sharedResult.status === 'fulfilled' ? sharedResult.value : [];
        const trashDocs = trashResult.status === 'fulfilled' ? trashResult.value.docs : [];

        const now = Date.now();
        const parsedTrash = trashDocs
          .map((entry) => parseSetlistTrashRecord(entry.id, entry.data() as Record<string, unknown>))
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

        const expiredTrash = parsedTrash.filter((entry) => isTrashExpired(entry.purgeAt, now));
        const activeTrash = parsedTrash.filter((entry) => !isTrashExpired(entry.purgeAt, now));

        if (expiredTrash.length > 0) {
          void Promise.all(
            expiredTrash.map((entry) => deleteDoc(doc(firestore, 'users', userId, TRASH_COLLECTION, entry.id)))
          ).catch((error) => {
            console.warn('Failed to purge expired setlist trash items.', error);
          });
        }

        setTrashedSetlists(
          activeTrash
            .map((entry) => ({
              trashId: entry.id,
              itemType: 'setlist' as const,
              deletedAt: entry.deletedAt,
              purgeAt: entry.purgeAt,
              setlist: entry.data,
            }))
            .sort(compareTrashByDeletedAtDesc)
        );

        if (!ownedSnapshot) {
          if (ownedResult.status === 'rejected') {
            if (isPermissionDeniedError(ownedResult.reason)) {
              logSetlistsPermissionHelp(ownedResult.reason);
            } else {
              console.error('Failed to load setlists from Firestore. Falling back to local data.', ownedResult.reason);
            }
          }
          return;
        }

        const ownedSetlists = ownedSnapshot.docs.map((entry) =>
          setlistFromDoc(entry.id, entry.data() as Record<string, unknown>, userId, userId)
        );

        setSetlists(normalizeSetlists([...ownedSetlists, ...sharedSetlists]));
      })
      .catch((error) => {
        if (isPermissionDeniedError(error)) {
          logSetlistsPermissionHelp(error);
          return;
        }

        console.error('Failed to load setlists from Firestore. Falling back to local data.', error);
      });
  }, [userId]);

  useEffect(() => {
    writeLocal(KEY_SETLISTS, setlists);
  }, [setlists]);

  useEffect(() => {
    writeLocal(KEY_ACTIVE_SETLIST, activeSetlistId);
  }, [activeSetlistId]);

  const addSetlist = useCallback((name: string) => {
    const id = crypto.randomUUID();
    const nextSetlist: Setlist = {
      id,
      name,
      songIds: [],
      ownerId: userId ?? undefined,
      collaboratorIds: [],
      collaborationPermissions: {},
      accessRole: 'owner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSetlists((prev) => {
      const nextSetlists = normalizeSetlists([...prev, nextSetlist]);
      if (db && userId) {
        const changed = nextSetlists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return !p || p.sortOrder !== list.sortOrder;
        });
        Promise.all(changed.map((list) => writeSetlist(list, userId))).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to save setlists to Firestore.', error);
          }
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
  }, [userId]);

  const deleteSetlist = useCallback((id: string) => {
    let trashedEntry: TrashedSetlist | null = null;

    setSetlists((prev) => {
      const deleting = prev.find((list) => list.id === id);
      if (!deleting || !isSetlistOwner(deleting, userId)) {
        return prev;
      }

      const { deletedAt, purgeAt } = createTrashTimestamps();
      const trashId = crypto.randomUUID();
      trashedEntry = {
        trashId,
        itemType: 'setlist',
        deletedAt,
        purgeAt,
        setlist: deleting,
      };
      setTrashedSetlists((prevTrash) => [trashedEntry as TrashedSetlist, ...prevTrash].sort(compareTrashByDeletedAtDesc));

      const nextSetlists = normalizeSetlists(prev.filter((list) => list.id !== id));
      if (db && userId) {
        const changed = nextSetlists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return p && p.sortOrder !== list.sortOrder;
        });

        Promise.all([
          setDoc(
            doc(db, 'users', userId, TRASH_COLLECTION, trashId),
            createTrashPayload('setlist', deletedAt, purgeAt, deleting)
          ),
          deleteDoc(doc(db, 'users', userId, SETLISTS_COLLECTION, id)),
          ...changed.map((list) => writeSetlist(list, userId)),
        ]).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to move setlist to trash in Firestore.', error);
          }
          setSetlists(prev);
          if (trashedEntry) {
            setTrashedSetlists((prevTrash) => prevTrash.filter((entry) => entry.trashId !== trashedEntry?.trashId));
          }
        });
      }
      return nextSetlists;
    });
    setActiveSetlistId((prev) => (prev === id ? null : prev));
  }, [userId]);

  const restoreSetlistFromTrash = useCallback(async (trashId: string): Promise<string | null> => {
    const trashed = trashedSetlists.find((entry) => entry.trashId === trashId);
    if (!trashed) {
      return 'Setlist was not found in trash.';
    }

    const restoredSetlist: Setlist = {
      ...trashed.setlist,
      ownerId: userId ?? trashed.setlist.ownerId,
      accessRole: 'owner',
    };

    setTrashedSetlists((prev) => prev.filter((entry) => entry.trashId !== trashId));
    setSetlists((prev) => normalizeSetlists([restoredSetlist, ...prev.filter((entry) => entry.id !== restoredSetlist.id)]));

    if (!db || !userId) {
      return null;
    }

    try {
      await Promise.all([
        writeSetlist(restoredSetlist, userId),
        deleteDoc(doc(db, 'users', userId, TRASH_COLLECTION, trashId)),
      ]);
      return null;
    } catch (error) {
      setSetlists((prev) => prev.filter((entry) => entry.id !== restoredSetlist.id));
      setTrashedSetlists((prev) => [trashed, ...prev].sort(compareTrashByDeletedAtDesc));
      return error instanceof Error ? error.message : 'Failed to restore setlist.';
    }
  }, [trashedSetlists, userId]);

  const deleteSetlistPermanently = useCallback(async (trashId: string): Promise<string | null> => {
    const previousTrash = trashedSetlists;
    setTrashedSetlists((prev) => prev.filter((entry) => entry.trashId !== trashId));

    if (!db || !userId) {
      return null;
    }

    try {
      await deleteDoc(doc(db, 'users', userId, TRASH_COLLECTION, trashId));
      return null;
    } catch (error) {
      setTrashedSetlists(previousTrash);
      return error instanceof Error ? error.message : 'Failed to permanently delete setlist.';
    }
  }, [trashedSetlists, userId]);

  const renameSetlist = useCallback((id: string, name: string) => {
    setSetlists((prev) => {
      const setlist = prev.find((l) => l.id === id);
      if (!setlist) return prev;
      if (!canEditSetlist(setlist, userId)) return prev;

      const nextSetlist = { ...setlist, name, updatedAt: new Date().toISOString() };
      const nextSetlists = prev.map((l) => (l.id === id ? nextSetlist : l));

      if (db && userId) {
        void writeSetlist(nextSetlist, userId).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to rename setlist in Firestore.', error);
          }
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
  }, [userId]);

  const updateSetlistIcon = useCallback((id: string, icon?: string) => {
    setSetlists((prev) => {
      const setlist = prev.find((l) => l.id === id);
      if (!setlist) return prev;
      if (!canEditSetlist(setlist, userId)) return prev;

      const nextSetlist = { ...setlist, icon, updatedAt: new Date().toISOString() };
      const nextSetlists = prev.map((l) => (l.id === id ? nextSetlist : l));

      if (db && userId) {
        void writeSetlist(nextSetlist, userId).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to update setlist icon in Firestore.', error);
          }
          setSetlists(prev);
        });
      }

      return nextSetlists;
    });
  }, [userId]);

  const setSetlistPublicShare = useCallback(async (id: string, enabled: boolean, publicSongs?: PublicSongEntry[]) => {
    if (!db || !userId) {
      return 'Setlists require cloud sync.';
    }

    const setlist = setlists.find((entry) => entry.id === id);
    if (!setlist) return 'Setlist not found.';
    if (!isSetlistOwner(setlist, userId)) return 'Only the owner can share setlists publicly.';

    const nextSetlist = {
      ...setlist,
      publicShareEnabled: enabled || undefined,
      publicSongs: enabled ? (publicSongs ?? setlist.publicSongs ?? []) : undefined,
      publicSongNotes: enabled ? (setlist.songNotes ?? {}) : undefined,
      updatedAt: new Date().toISOString(),
    };
    const previousSetlists = setlists;
    const nextSetlists = setlists.map((entry) => (entry.id === id ? nextSetlist : entry));

    setSetlists(nextSetlists);

    try {
      await writeSetlist(nextSetlist, userId);
      return null;
    } catch (error) {
      setSetlists(previousSetlists);
      if (isPermissionDeniedError(error)) {
        logSetlistsPermissionHelp(error);
      } else {
        console.error('Failed to update setlist sharing in Firestore.', error);
      }
      return error instanceof Error ? error.message : 'Failed to update setlist sharing.';
    }
  }, [setlists, userId]);

  const addSongToSetlist = useCallback((setlistId: string, songId: string) => {
    setSetlists((prev) => {
      const setlist = prev.find((l) => l.id === setlistId);
      if (!setlist || setlist.songIds.includes(songId)) return prev;
      if (!canEditSetlist(setlist, userId)) return prev;

      const nextSetlist = {
        ...setlist,
        songIds: [...setlist.songIds, songId],
        updatedAt: new Date().toISOString(),
      };
      const nextSetlists = prev.map((l) => (l.id === setlistId ? nextSetlist : l));

      if (db && userId) {
        void writeSetlist(nextSetlist, userId).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to add song to setlist in Firestore.', error);
          }
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
  }, [userId]);

  const removeSongFromSetlist = useCallback((setlistId: string, songId: string) => {
    setSetlists((prev) => {
      const setlist = prev.find((l) => l.id === setlistId);
      if (!setlist) return prev;
      if (!canEditSetlist(setlist, userId)) return prev;

      const nextSongNotes = { ...(setlist.songNotes ?? {}) };
      delete nextSongNotes[songId];

      const nextSetlist = {
        ...setlist,
        songIds: setlist.songIds.filter((id) => id !== songId),
        songNotes: Object.keys(nextSongNotes).length > 0 ? nextSongNotes : undefined,
        updatedAt: new Date().toISOString(),
      };
      const nextSetlists = prev.map((l) => (l.id === setlistId ? nextSetlist : l));

      if (db && userId) {
        void writeSetlist(nextSetlist, userId).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to remove song from setlist in Firestore.', error);
          }
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
  }, [userId]);

  const moveSongInSetlist = useCallback((setlistId: string, songId: string, beforeSongId: string | null) => {
    setSetlists((prev) => {
      const setlist = prev.find((l) => l.id === setlistId);
      if (!setlist) return prev;
      if (!canEditSetlist(setlist, userId)) return prev;

      const nextSongIds = moveIdBefore(setlist.songIds, songId, beforeSongId);
      if (nextSongIds === setlist.songIds) return prev;

      const nextSetlist = { ...setlist, songIds: nextSongIds, updatedAt: new Date().toISOString() };
      const nextSetlists = prev.map((l) => (l.id === setlistId ? nextSetlist : l));

      if (db && userId) {
        void writeSetlist(nextSetlist, userId).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to reorder setlist songs in Firestore.', error);
          }
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
  }, [userId]);

  const updateSongNoteInSetlist = useCallback((setlistId: string, songId: string, note: string) => {
    setSetlists((prev) => {
      const setlist = prev.find((entry) => entry.id === setlistId);
      if (!setlist) return prev;
      if (!canEditSetlist(setlist, userId)) return prev;
      if (!setlist.songIds.includes(songId)) return prev;

      const normalizedNote = note.trim();
      const previousNote = setlist.songNotes?.[songId] ?? '';
      if (normalizedNote === previousNote) return prev;

      const nextSongNotes = { ...(setlist.songNotes ?? {}) };
      if (normalizedNote) {
        nextSongNotes[songId] = normalizedNote;
      } else {
        delete nextSongNotes[songId];
      }

      const nextSetlist: Setlist = {
        ...setlist,
        songNotes: Object.keys(nextSongNotes).length > 0 ? nextSongNotes : undefined,
        publicSongNotes: setlist.publicShareEnabled
          ? (Object.keys(nextSongNotes).length > 0 ? nextSongNotes : undefined)
          : setlist.publicSongNotes,
        updatedAt: new Date().toISOString(),
      };
      const nextSetlists = prev.map((entry) => (entry.id === setlistId ? nextSetlist : entry));

      if (db && userId) {
        void writeSetlist(nextSetlist, userId).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to update setlist song note in Firestore.', error);
          }
          setSetlists(prev);
        });
      }

      return nextSetlists;
    });
  }, [userId]);

  const clearActiveSelection = useCallback(() => {
    setActiveSetlistId(null);
  }, []);

  return (
    <SetlistsContext.Provider
      value={{
        setlists,
        trashedSetlists,
        activeSetlistId,
        addSetlist,
        deleteSetlist,
        restoreSetlistFromTrash,
        deleteSetlistPermanently,
        renameSetlist,
        updateSetlistIcon,
        setSetlistPublicShare,
        addSongToSetlist,
        removeSongFromSetlist,
        moveSongInSetlist,
        updateSongNoteInSetlist,
        setActiveSetlistId,
        clearActiveSelection,
      }}
    >
      {children}
    </SetlistsContext.Provider>
  );
}

export function useSetlists() {
  const context = useContext(SetlistsContext);
  if (!context) {
    throw new Error('useSetlists must be used within SetlistsProvider');
  }
  return context;
}
