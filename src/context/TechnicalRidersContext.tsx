/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  normalizeTechnicalRider,
  sortTechnicalRiders,
  withSequentialRiderEquipmentSortOrder,
  withSequentialRiderLineSortOrder,
  withSequentialTechnicalRiderSortOrder,
} from '../lib/technicalRiders';
import type { RiderEquipmentItem, TechnicalRider, TechnicalRiderLine } from '../types';
import { useAuth } from './AuthContext';

const KEY_TECHNICAL_RIDERS = 'songbook-technical-riders';
const KEY_ACTIVE_TECHNICAL_RIDER = 'songbook-active-technical-rider';
const TECHNICAL_RIDERS_COLLECTION = 'technicalRiders';

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

function toFirestoreDocument(rider: TechnicalRider, userId: string) {
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

async function writeTechnicalRider(rider: TechnicalRider, userId: string | null) {
  if (!db || !userId) return;
  await setDoc(doc(db, 'users', userId, TECHNICAL_RIDERS_COLLECTION, rider.id), toFirestoreDocument(rider, userId));
}

interface TechnicalRidersContextValue {
  technicalRiders: TechnicalRider[];
  activeTechnicalRiderId: string | null;
  setActiveTechnicalRiderId: (id: string | null) => void;
  addTechnicalRider: (name: string) => Promise<{ riderId: string | null; error: string | null }>;
  renameTechnicalRider: (id: string, name: string) => Promise<string | null>;
  updateTechnicalRiderIcon: (id: string, icon?: string) => Promise<string | null>;
  deleteTechnicalRider: (id: string) => Promise<string | null>;
  updateTechnicalRiderContent: (params: {
    riderId: string;
    lines: TechnicalRiderLine[];
    preferredEquipment: RiderEquipmentItem[];
    inventoryEquipment: RiderEquipmentItem[];
  }) => Promise<string | null>;
  setTechnicalRiderPublicShare: (id: string, enabled: boolean) => Promise<string | null>;
}

const TechnicalRidersContext = createContext<TechnicalRidersContextValue | null>(null);

export function TechnicalRidersProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [technicalRiders, setTechnicalRiders] = useState<TechnicalRider[]>(() =>
    sortTechnicalRiders(readLocal(KEY_TECHNICAL_RIDERS, []))
  );
  const [activeTechnicalRiderId, setActiveTechnicalRiderId] = useState<string | null>(() =>
    readLocal(KEY_ACTIVE_TECHNICAL_RIDER, null)
  );

  useEffect(() => {
    if (!db || !userId) return;

    getDocs(collection(db, 'users', userId, TECHNICAL_RIDERS_COLLECTION))
      .then((snapshot) => {
        const riders = sortTechnicalRiders(
          snapshot.docs.map((entry) => normalizeTechnicalRider(entry.id, entry.data() as Record<string, unknown>))
        );
        setTechnicalRiders(riders);
      })
      .catch((error) => {
        const code = error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : 'unknown';
        console.error(
          `Failed to load technical riders from Firestore at users/${userId}/${TECHNICAL_RIDERS_COLLECTION}. Falling back to local data. (code: ${code})`,
          error
        );
      });
  }, [userId]);

  useEffect(() => {
    writeLocal(KEY_TECHNICAL_RIDERS, technicalRiders);
  }, [technicalRiders]);

  useEffect(() => {
    writeLocal(KEY_ACTIVE_TECHNICAL_RIDER, activeTechnicalRiderId);
  }, [activeTechnicalRiderId]);

  const addTechnicalRider = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { riderId: null, error: 'Rider name is required.' };
    }

    const riderId = crypto.randomUUID();
    const now = new Date().toISOString();
    const nextRider: TechnicalRider = {
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

    const previousRiders = technicalRiders;
    const nextRiders = withSequentialTechnicalRiderSortOrder(sortTechnicalRiders([...technicalRiders, nextRider]));
    setTechnicalRiders(nextRiders);

    try {
      if (db && userId) {
        await Promise.all(nextRiders.map((rider) => writeTechnicalRider(rider, userId)));
      }
      return { riderId, error: null };
    } catch (error) {
      setTechnicalRiders(previousRiders);
      return { riderId: null, error: error instanceof Error ? error.message : 'Failed to create rider.' };
    }
  }, [technicalRiders, userId]);

  const renameTechnicalRider = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return 'Rider name is required.';

    const previousRiders = technicalRiders;
    const nextRiders = technicalRiders.map((rider) => (
      rider.id === id ? { ...rider, name: trimmed, updatedAt: new Date().toISOString() } : rider
    ));
    setTechnicalRiders(nextRiders);

    try {
      const updated = nextRiders.find((rider) => rider.id === id);
      if (updated && db && userId) {
        await writeTechnicalRider(updated, userId);
      }
      return null;
    } catch (error) {
      setTechnicalRiders(previousRiders);
      return error instanceof Error ? error.message : 'Failed to rename rider.';
    }
  }, [technicalRiders, userId]);

  const updateTechnicalRiderIcon = useCallback(async (id: string, icon?: string) => {
    const previousRiders = technicalRiders;
    const now = new Date().toISOString();
    const nextRiders = technicalRiders.map((rider) => (
      rider.id === id ? { ...rider, icon, updatedAt: now } : rider
    ));
    setTechnicalRiders(nextRiders);

    try {
      const updated = nextRiders.find((rider) => rider.id === id);
      if (updated && db && userId) {
        await writeTechnicalRider(updated, userId);
      }
      return null;
    } catch (error) {
      setTechnicalRiders(previousRiders);
      return error instanceof Error ? error.message : 'Failed to update rider icon.';
    }
  }, [technicalRiders, userId]);

  const deleteTechnicalRider = useCallback(async (id: string) => {
    const previousRiders = technicalRiders;
    const nextRiders = withSequentialTechnicalRiderSortOrder(
      sortTechnicalRiders(technicalRiders.filter((rider) => rider.id !== id))
    );
    setTechnicalRiders(nextRiders);
    setActiveTechnicalRiderId((prev) => (prev === id ? null : prev));

    try {
      if (db && userId) {
        await Promise.all([
          deleteDoc(doc(db, 'users', userId, TECHNICAL_RIDERS_COLLECTION, id)),
          ...nextRiders.map((rider) => writeTechnicalRider(rider, userId)),
        ]);
      }
      return null;
    } catch (error) {
      setTechnicalRiders(previousRiders);
      return error instanceof Error ? error.message : 'Failed to delete rider.';
    }
  }, [technicalRiders, userId]);

  const updateTechnicalRiderContent = useCallback(async (params: {
    riderId: string;
    lines: TechnicalRiderLine[];
    preferredEquipment: RiderEquipmentItem[];
    inventoryEquipment: RiderEquipmentItem[];
  }) => {
    const { riderId, lines, preferredEquipment, inventoryEquipment } = params;
    const target = technicalRiders.find((rider) => rider.id === riderId);
    if (!target) return 'Rider not found.';

    const previousRiders = technicalRiders;
    const now = new Date().toISOString();
    const nextRiders = technicalRiders.map((rider) => {
      if (rider.id !== riderId) return rider;
      return {
        ...rider,
        lines: withSequentialRiderLineSortOrder(lines),
        preferredEquipment: withSequentialRiderEquipmentSortOrder(preferredEquipment),
        inventoryEquipment: withSequentialRiderEquipmentSortOrder(inventoryEquipment),
        updatedAt: now,
      };
    });

    setTechnicalRiders(nextRiders);

    try {
      const updated = nextRiders.find((rider) => rider.id === riderId);
      if (updated && db && userId) {
        await writeTechnicalRider(updated, userId);
      }
      return null;
    } catch (error) {
      setTechnicalRiders(previousRiders);
      return error instanceof Error ? error.message : 'Failed to update rider.';
    }
  }, [technicalRiders, userId]);

  const setTechnicalRiderPublicShare = useCallback(async (id: string, enabled: boolean) => {
    const target = technicalRiders.find((rider) => rider.id === id);
    if (!target) return 'Rider not found.';

    const previousRiders = technicalRiders;
    const now = new Date().toISOString();
    const nextRiders = technicalRiders.map((rider) => (
      rider.id === id
        ? { ...rider, publicShareEnabled: enabled || undefined, updatedAt: now }
        : rider
    ));

    setTechnicalRiders(nextRiders);

    try {
      const updated = nextRiders.find((rider) => rider.id === id);
      if (updated && db && userId) {
        await writeTechnicalRider(updated, userId);
      }
      return null;
    } catch (error) {
      setTechnicalRiders(previousRiders);
      return error instanceof Error ? error.message : 'Failed to update sharing.';
    }
  }, [technicalRiders, userId]);

  const value = useMemo<TechnicalRidersContextValue>(() => ({
    technicalRiders,
    activeTechnicalRiderId,
    setActiveTechnicalRiderId,
    addTechnicalRider,
    renameTechnicalRider,
    updateTechnicalRiderIcon,
    deleteTechnicalRider,
    updateTechnicalRiderContent,
    setTechnicalRiderPublicShare,
  }), [
    activeTechnicalRiderId,
    addTechnicalRider,
    deleteTechnicalRider,
    renameTechnicalRider,
    setTechnicalRiderPublicShare,
    technicalRiders,
    updateTechnicalRiderIcon,
    updateTechnicalRiderContent,
  ]);

  return <TechnicalRidersContext.Provider value={value}>{children}</TechnicalRidersContext.Provider>;
}

export function useTechnicalRiders() {
  const context = useContext(TechnicalRidersContext);
  if (!context) {
    throw new Error('useTechnicalRiders must be used inside TechnicalRidersProvider');
  }
  return context;
}
