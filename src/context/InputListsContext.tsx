/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  normalizeInputList,
  sortInputLists,
  withSequentialRiderEquipmentSortOrder,
  withSequentialRiderLineSortOrder,
  withSequentialInputListSortOrder,
} from '../lib/inputLists';
import type { RiderEquipmentItem, InputList, InputListLine } from '../types';
import { useAuth } from './AuthContext';

const KEY_INPUT_LISTS = 'gigboy-technical-riders';
const KEY_ACTIVE_INPUT_LIST = 'gigboy-active-technical-rider';
const INPUT_LISTS_COLLECTION = 'technicalRiders';

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

function toFirestoreDocument(rider: InputList, userId: string) {
  return {
    name: rider.name,
    icon: rider.icon ?? null,
    lines: rider.lines,
    preferredEquipment: rider.preferredEquipment,
    inventoryEquipment: rider.inventoryEquipment,
    publicShareEnabled: rider.publicShareEnabled || null,
    ownerId: rider.ownerId ?? userId,
    createdAt: rider.createdAt,
    updatedAt: rider.updatedAt,
    sortOrder: rider.sortOrder,
  };
}

async function writeInputList(rider: InputList, userId: string | null) {
  if (!db || !userId) return;
  await setDoc(doc(db, 'users', userId, INPUT_LISTS_COLLECTION, rider.id), toFirestoreDocument(rider, userId));
}

interface InputListsContextValue {
  inputLists: InputList[];
  activeInputListId: string | null;
  setActiveInputListId: (id: string | null) => void;
  addInputList: (name: string) => Promise<{ riderId: string | null; error: string | null }>;
  renameInputList: (id: string, name: string) => Promise<string | null>;
  updateInputListIcon: (id: string, icon?: string) => Promise<string | null>;
  deleteInputList: (id: string) => Promise<string | null>;
  updateInputListContent: (params: {
    riderId: string;
    lines: InputListLine[];
    preferredEquipment: RiderEquipmentItem[];
    inventoryEquipment: RiderEquipmentItem[];
  }) => Promise<string | null>;
  setInputListPublicShare: (id: string, enabled: boolean) => Promise<string | null>;
}

const InputListsContext = createContext<InputListsContextValue | null>(null);

export function InputListsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [inputLists, setInputLists] = useState<InputList[]>(() =>
    sortInputLists(readLocal(KEY_INPUT_LISTS, []))
  );
  const [activeInputListId, setActiveInputListId] = useState<string | null>(() =>
    readLocal(KEY_ACTIVE_INPUT_LIST, null)
  );

  useEffect(() => {
    if (!db || !userId) return;

    getDocs(collection(db, 'users', userId, INPUT_LISTS_COLLECTION))
      .then((snapshot) => {
        const riders = sortInputLists(
          snapshot.docs.map((entry) => normalizeInputList(entry.id, entry.data() as Record<string, unknown>))
        );
        setInputLists(riders);
      })
      .catch((error) => {
        const code = error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : 'unknown';
        console.error(
          `Failed to load input lists from Firestore at users/${userId}/${INPUT_LISTS_COLLECTION}. Falling back to local data. (code: ${code})`,
          error
        );
      });
  }, [userId]);

  useEffect(() => {
    writeLocal(KEY_INPUT_LISTS, inputLists);
  }, [inputLists]);

  useEffect(() => {
    writeLocal(KEY_ACTIVE_INPUT_LIST, activeInputListId);
  }, [activeInputListId]);

  const addInputList = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { riderId: null, error: 'Rider name is required.' };
    }

    const riderId = crypto.randomUUID();
    const now = new Date().toISOString();
    const nextRider: InputList = {
      id: riderId,
      name: trimmed,
      lines: [],
      preferredEquipment: [],
      inventoryEquipment: [],
      ownerId: userId ?? undefined,
      accessRole: 'owner',
      createdAt: now,
      updatedAt: now,
    };

    const previousRiders = inputLists;
    const nextRiders = withSequentialInputListSortOrder(sortInputLists([...inputLists, nextRider]));
    setInputLists(nextRiders);

    try {
      if (db && userId) {
        await Promise.all(nextRiders.map((rider) => writeInputList(rider, userId)));
      }
      return { riderId, error: null };
    } catch (error) {
      setInputLists(previousRiders);
      return { riderId: null, error: error instanceof Error ? error.message : 'Failed to create rider.' };
    }
  }, [inputLists, userId]);

  const renameInputList = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return 'Rider name is required.';

    const previousRiders = inputLists;
    const nextRiders = inputLists.map((rider) => (
      rider.id === id ? { ...rider, name: trimmed, updatedAt: new Date().toISOString() } : rider
    ));
    setInputLists(nextRiders);

    try {
      const updated = nextRiders.find((rider) => rider.id === id);
      if (updated && db && userId) {
        await writeInputList(updated, userId);
      }
      return null;
    } catch (error) {
      setInputLists(previousRiders);
      return error instanceof Error ? error.message : 'Failed to rename rider.';
    }
  }, [inputLists, userId]);

  const updateInputListIcon = useCallback(async (id: string, icon?: string) => {
    const previousRiders = inputLists;
    const now = new Date().toISOString();
    const nextRiders = inputLists.map((rider) => (
      rider.id === id ? { ...rider, icon, updatedAt: now } : rider
    ));
    setInputLists(nextRiders);

    try {
      const updated = nextRiders.find((rider) => rider.id === id);
      if (updated && db && userId) {
        await writeInputList(updated, userId);
      }
      return null;
    } catch (error) {
      setInputLists(previousRiders);
      return error instanceof Error ? error.message : 'Failed to update rider icon.';
    }
  }, [inputLists, userId]);

  const deleteInputList = useCallback(async (id: string) => {
    const previousRiders = inputLists;
    const nextRiders = withSequentialInputListSortOrder(
      sortInputLists(inputLists.filter((rider) => rider.id !== id))
    );
    setInputLists(nextRiders);
    setActiveInputListId((prev) => (prev === id ? null : prev));

    try {
      if (db && userId) {
        await Promise.all([
          deleteDoc(doc(db, 'users', userId, INPUT_LISTS_COLLECTION, id)),
          ...nextRiders.map((rider) => writeInputList(rider, userId)),
        ]);
      }
      return null;
    } catch (error) {
      setInputLists(previousRiders);
      return error instanceof Error ? error.message : 'Failed to delete rider.';
    }
  }, [inputLists, userId]);

  const updateInputListContent = useCallback(async (params: {
    riderId: string;
    lines: InputListLine[];
    preferredEquipment: RiderEquipmentItem[];
    inventoryEquipment: RiderEquipmentItem[];
  }) => {
    const { riderId, lines, preferredEquipment, inventoryEquipment } = params;
    const target = inputLists.find((rider) => rider.id === riderId);
    if (!target) return 'Rider not found.';

    const previousRiders = inputLists;
    const now = new Date().toISOString();
    const nextRiders = inputLists.map((rider) => {
      if (rider.id !== riderId) return rider;
      return {
        ...rider,
        lines: withSequentialRiderLineSortOrder(lines),
        preferredEquipment: withSequentialRiderEquipmentSortOrder(preferredEquipment),
        inventoryEquipment: withSequentialRiderEquipmentSortOrder(inventoryEquipment),
        updatedAt: now,
      };
    });

    setInputLists(nextRiders);

    try {
      const updated = nextRiders.find((rider) => rider.id === riderId);
      if (updated && db && userId) {
        await writeInputList(updated, userId);
      }
      return null;
    } catch (error) {
      setInputLists(previousRiders);
      return error instanceof Error ? error.message : 'Failed to update rider.';
    }
  }, [inputLists, userId]);

  const setInputListPublicShare = useCallback(async (id: string, enabled: boolean) => {
    const target = inputLists.find((rider) => rider.id === id);
    if (!target) return 'Rider not found.';

    const previousRiders = inputLists;
    const now = new Date().toISOString();
    const nextRiders = inputLists.map((rider) => (
      rider.id === id
        ? { ...rider, publicShareEnabled: enabled || undefined, updatedAt: now }
        : rider
    ));

    setInputLists(nextRiders);

    try {
      const updated = nextRiders.find((rider) => rider.id === id);
      if (updated && db && userId) {
        await writeInputList(updated, userId);
      }
      return null;
    } catch (error) {
      setInputLists(previousRiders);
      return error instanceof Error ? error.message : 'Failed to update sharing.';
    }
  }, [inputLists, userId]);

  const value = useMemo<InputListsContextValue>(() => ({
    inputLists,
    activeInputListId,
    setActiveInputListId,
    addInputList,
    renameInputList,
    updateInputListIcon,
    deleteInputList,
    updateInputListContent,
    setInputListPublicShare,
  }), [
    activeInputListId,
    addInputList,
    deleteInputList,
    renameInputList,
    setInputListPublicShare,
    inputLists,
    updateInputListIcon,
    updateInputListContent,
  ]);

  return <InputListsContext.Provider value={value}>{children}</InputListsContext.Provider>;
}

export function useInputLists() {
  const context = useContext(InputListsContext);
  if (!context) {
    throw new Error('useInputLists must be used inside InputListsProvider');
  }
  return context;
}
