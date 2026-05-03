/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { SongHandNoteDocument, Stageplot, StageplotItem } from '../types';
import { useAuth } from './AuthContext';

const KEY_STAGEPLOTS = 'songbook-stageplots';
const KEY_ACTIVE_STAGEPLOT = 'songbook-active-stageplot';
const STAGEPLOTS_COLLECTION = 'stageplots';

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

function normalizeStageplotItem(raw: unknown): StageplotItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.id !== 'string') return null;

  return {
    id: data.id,
    kind: typeof data.kind === 'string' ? data.kind : 'custom',
    label: typeof data.label === 'string' ? data.label : 'Item',
    x: typeof data.x === 'number' && Number.isFinite(data.x) ? data.x : 0.5,
    y: typeof data.y === 'number' && Number.isFinite(data.y) ? data.y : 0.5,
    color: typeof data.color === 'string' ? data.color : undefined,
  };
}

function normalizeStageplotLayer(raw: unknown): SongHandNoteDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.authorUid !== 'string') return null;

  const viewportRaw = data.viewport && typeof data.viewport === 'object'
    ? (data.viewport as Record<string, unknown>)
    : {};

  return {
    authorUid: data.authorUid,
    authorName: typeof data.authorName === 'string' ? data.authorName : null,
    authorAvatar: typeof data.authorAvatar === 'string' ? data.authorAvatar : null,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    viewport: {
      width: typeof viewportRaw.width === 'number' && viewportRaw.width > 0 ? viewportRaw.width : 1,
      height: typeof viewportRaw.height === 'number' && viewportRaw.height > 0 ? viewportRaw.height : 1,
    },
    strokes: Array.isArray(data.strokes) ? (data.strokes as SongHandNoteDocument['strokes']) : [],
  };
}

function normalizeStageplot(id: string, data: Record<string, unknown>, userId: string): Stageplot {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : 'Untitled stageplot',
    icon: typeof data.icon === 'string' ? data.icon : undefined,
    items: Array.isArray(data.items)
      ? data.items.map(normalizeStageplotItem).filter((entry): entry is StageplotItem => Boolean(entry))
      : [],
    drawingLayers: Array.isArray(data.drawingLayers)
      ? data.drawingLayers.map(normalizeStageplotLayer).filter((entry): entry is SongHandNoteDocument => Boolean(entry))
      : [],
    publicShareEnabled: data.publicShareEnabled === true ? true : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : userId,
    accessRole: 'owner',
  };
}

function sortStageplots(stageplots: Stageplot[]) {
  return [...stageplots].sort((a, b) => {
    const aSortOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const bSortOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
    return a.name.localeCompare(b.name);
  });
}

function withSequentialStageplotSortOrder(stageplots: Stageplot[]) {
  return stageplots.map((stageplot, index) => ({ ...stageplot, sortOrder: index }));
}

function toFirestoreDocument(stageplot: Stageplot, userId: string) {
  return {
    name: stageplot.name,
    icon: stageplot.icon ?? null,
    items: stageplot.items,
    drawingLayers: stageplot.drawingLayers ?? [],
    publicShareEnabled: stageplot.publicShareEnabled || null,
    ownerId: stageplot.ownerId ?? userId,
    createdAt: stageplot.createdAt,
    updatedAt: stageplot.updatedAt,
    sortOrder: stageplot.sortOrder,
  };
}

async function writeStageplot(stageplot: Stageplot, userId: string | null) {
  if (!db || !userId) return;
  await setDoc(doc(db, 'users', userId, STAGEPLOTS_COLLECTION, stageplot.id), toFirestoreDocument(stageplot, userId));
}

interface StageplotsContextValue {
  stageplots: Stageplot[];
  activeStageplotId: string | null;
  setActiveStageplotId: (id: string | null) => void;
  addStageplot: (name: string) => Promise<{ stageplotId: string | null; error: string | null }>;
  renameStageplot: (id: string, name: string) => Promise<string | null>;
  updateStageplotIcon: (id: string, icon?: string) => Promise<string | null>;
  updateStageplotSettings: (id: string, stageShape?: 'rectangle' | 'oval' | 'circle', stageSize?: 'small' | 'medium' | 'large') => Promise<string | null>;
  deleteStageplot: (id: string) => Promise<string | null>;
  updateStageplotContent: (params: {
    stageplotId: string;
    items: StageplotItem[];
    drawingLayers: SongHandNoteDocument[];
  }) => Promise<string | null>;
  setStageplotPublicShare: (id: string, enabled: boolean) => Promise<string | null>;
}

const StageplotsContext = createContext<StageplotsContextValue | null>(null);

export function StageplotsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [stageplots, setStageplots] = useState<Stageplot[]>(() =>
    sortStageplots(readLocal(KEY_STAGEPLOTS, []))
  );
  const [activeStageplotId, setActiveStageplotId] = useState<string | null>(() =>
    readLocal(KEY_ACTIVE_STAGEPLOT, null)
  );

  useEffect(() => {
    if (!db || !userId) return;

    getDocs(collection(db, 'users', userId, STAGEPLOTS_COLLECTION))
      .then((snapshot) => {
        const loaded = sortStageplots(
          snapshot.docs.map((entry) => normalizeStageplot(entry.id, entry.data() as Record<string, unknown>, userId))
        );
        setStageplots(loaded);
      })
      .catch((error) => {
        console.error('Failed to load stageplots from Firestore. Falling back to local data.', error);
      });
  }, [userId]);

  useEffect(() => {
    writeLocal(KEY_STAGEPLOTS, stageplots);
  }, [stageplots]);

  useEffect(() => {
    writeLocal(KEY_ACTIVE_STAGEPLOT, activeStageplotId);
  }, [activeStageplotId]);

  const addStageplot = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { stageplotId: null, error: 'Stageplot name is required.' };
    }

    const stageplotId = crypto.randomUUID();
    const now = new Date().toISOString();
    const nextStageplot: Stageplot = {
      id: stageplotId,
      name: trimmed,
      icon: '🗺️',
      items: [],
      drawingLayers: [],
      ownerId: userId ?? undefined,
      accessRole: 'owner',
      createdAt: now,
      updatedAt: now,
    };

    const previousStageplots = stageplots;
    const nextStageplots = withSequentialStageplotSortOrder(sortStageplots([...stageplots, nextStageplot]));
    setStageplots(nextStageplots);

    try {
      if (db && userId) {
        await Promise.all(nextStageplots.map((entry) => writeStageplot(entry, userId)));
      }
      return { stageplotId, error: null };
    } catch (error) {
      setStageplots(previousStageplots);
      return { stageplotId: null, error: error instanceof Error ? error.message : 'Failed to create stageplot.' };
    }
  }, [stageplots, userId]);

  const renameStageplot = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return 'Stageplot name is required.';

    const previousStageplots = stageplots;
    const nextStageplots = stageplots.map((entry) => (
      entry.id === id ? { ...entry, name: trimmed, updatedAt: new Date().toISOString() } : entry
    ));

    setStageplots(nextStageplots);

    try {
      const updated = nextStageplots.find((entry) => entry.id === id);
      if (updated && db && userId) {
        await writeStageplot(updated, userId);
      }
      return null;
    } catch (error) {
      setStageplots(previousStageplots);
      return error instanceof Error ? error.message : 'Failed to rename stageplot.';
    }
  }, [stageplots, userId]);

  const updateStageplotIcon = useCallback(async (id: string, icon?: string) => {
    const previousStageplots = stageplots;
    const now = new Date().toISOString();
    const nextStageplots = stageplots.map((entry) => (
      entry.id === id ? { ...entry, icon, updatedAt: now } : entry
    ));

    setStageplots(nextStageplots);

    try {
      const updated = nextStageplots.find((entry) => entry.id === id);
      if (updated && db && userId) {
        await writeStageplot(updated, userId);
      }
      return null;
    } catch (error) {
      setStageplots(previousStageplots);
      return error instanceof Error ? error.message : 'Failed to update stageplot icon.';
    }
  }, [stageplots, userId]);

  const updateStageplotSettings = useCallback(async (id: string, stageShape?: 'rectangle' | 'oval' | 'circle', stageSize?: 'small' | 'medium' | 'large') => {
    const previousStageplots = stageplots;
    const now = new Date().toISOString();
    const nextStageplots = stageplots.map((entry) => (
      entry.id === id ? { ...entry, stageShape, stageSize, updatedAt: now } : entry
    ));

    setStageplots(nextStageplots);

    try {
      const updated = nextStageplots.find((entry) => entry.id === id);
      if (updated && db && userId) {
        await writeStageplot(updated, userId);
      }
      return null;
    } catch (error) {
      setStageplots(previousStageplots);
      return error instanceof Error ? error.message : 'Failed to update stageplot settings.';
    }
  }, [stageplots, userId]);

  const deleteStageplot = useCallback(async (id: string) => {
    const previousStageplots = stageplots;
    const nextStageplots = withSequentialStageplotSortOrder(
      sortStageplots(stageplots.filter((entry) => entry.id !== id))
    );

    setStageplots(nextStageplots);
    setActiveStageplotId((prev) => (prev === id ? null : prev));

    try {
      if (db && userId) {
        await Promise.all([
          deleteDoc(doc(db, 'users', userId, STAGEPLOTS_COLLECTION, id)),
          ...nextStageplots.map((entry) => writeStageplot(entry, userId)),
        ]);
      }
      return null;
    } catch (error) {
      setStageplots(previousStageplots);
      return error instanceof Error ? error.message : 'Failed to delete stageplot.';
    }
  }, [stageplots, userId]);

  const updateStageplotContent = useCallback(async (params: {
    stageplotId: string;
    items: StageplotItem[];
    drawingLayers: SongHandNoteDocument[];
  }) => {
    const { stageplotId, items, drawingLayers } = params;
    const previousStageplots = stageplots;
    const now = new Date().toISOString();

    const nextStageplots = stageplots.map((entry) => (
      entry.id === stageplotId
        ? { ...entry, items, drawingLayers, updatedAt: now }
        : entry
    ));

    setStageplots(nextStageplots);

    try {
      const updated = nextStageplots.find((entry) => entry.id === stageplotId);
      if (updated && db && userId) {
        await writeStageplot(updated, userId);
      }
      return null;
    } catch (error) {
      setStageplots(previousStageplots);
      return error instanceof Error ? error.message : 'Failed to update stageplot.';
    }
  }, [stageplots, userId]);

  const setStageplotPublicShare = useCallback(async (id: string, enabled: boolean) => {
    const previousStageplots = stageplots;
    const now = new Date().toISOString();
    const nextStageplots = stageplots.map((entry) => (
      entry.id === id ? { ...entry, publicShareEnabled: enabled || undefined, updatedAt: now } : entry
    ));

    setStageplots(nextStageplots);

    try {
      const updated = nextStageplots.find((entry) => entry.id === id);
      if (updated && db && userId) {
        await writeStageplot(updated, userId);
      }
      return null;
    } catch (error) {
      setStageplots(previousStageplots);
      return error instanceof Error ? error.message : 'Failed to update stageplot sharing.';
    }
  }, [stageplots, userId]);

  const value = useMemo<StageplotsContextValue>(() => ({
    stageplots,
    activeStageplotId,
    setActiveStageplotId,
    addStageplot,
    renameStageplot,
    updateStageplotIcon,
    updateStageplotSettings,
    deleteStageplot,
    updateStageplotContent,
    setStageplotPublicShare,
  }), [
    activeStageplotId,
    addStageplot,
    deleteStageplot,
    renameStageplot,
    setStageplotPublicShare,
    stageplots,
    updateStageplotContent,
    updateStageplotIcon,
    updateStageplotSettings,
  ]);

  return <StageplotsContext.Provider value={value}>{children}</StageplotsContext.Provider>;
}

export function useStageplots() {
  const context = useContext(StageplotsContext);
  if (!context) {
    throw new Error('useStageplots must be used inside StageplotsProvider');
  }
  return context;
}
