import { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PLAN_LIMITS } from '../lib/planLimits';

const DEFAULT_STORAGE_QUOTA_BYTES = PLAN_LIMITS.free.storageQuotaBytes;

interface UsageState {
  usedBytes: number;
  quotaBytes: number;
  loading: boolean;
}

function toSafeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value >= 0 ? value : null;
}

export function useStorageUsage(userId: string | null | undefined, planQuotaBytes?: number) {
  const [state, setState] = useState<UsageState>({
    usedBytes: 0,
    quotaBytes: planQuotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES,
    loading: false,
  });

  useEffect(() => {
    if (!db || !userId) {
      setState({
        usedBytes: 0,
        quotaBytes: planQuotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES,
        loading: false,
      });
      return;
    }

    const firestore = db;
    const currentUserId = userId;

    let cancelled = false;

    async function load() {
      setState((current) => ({ ...current, loading: true }));

      try {
        const [
          userSnapshot,
          recordingsSnapshot,
          memberBandsSnapshot,
          ownerBandsSnapshot,
        ] = await Promise.all([
          getDoc(doc(firestore, 'users', currentUserId)),
          getDocs(query(collectionGroup(firestore, 'recordings'), where('recorder.userId', '==', currentUserId))),
          getDocs(query(collection(firestore, 'bands'), where('memberIds', 'array-contains', currentUserId))),
          getDocs(query(collection(firestore, 'bands'), where('ownerId', '==', currentUserId))),
        ]);

        if (cancelled) return;

        const userData = userSnapshot.data() as Record<string, unknown> | undefined;
        const quotaFromProfile = toSafeNumber(userData?.storageQuotaBytes);
        const baseQuota = quotaFromProfile ?? DEFAULT_STORAGE_QUOTA_BYTES;
        const quotaBytes = planQuotaBytes !== undefined ? Math.max(baseQuota, planQuotaBytes) : baseQuota;

        const recordingBytes = recordingsSnapshot.docs.reduce((sum, snap) => {
          const data = snap.data() as Record<string, unknown>;
          const sizeBytes = toSafeNumber(data.sizeBytes);
          if (sizeBytes !== null) return sum + sizeBytes;

          const legacySize = toSafeNumber(data.size);
          return legacySize !== null ? sum + legacySize : sum;
        }, 0);

        const bandIds = new Set<string>();
        memberBandsSnapshot.docs.forEach((snap) => {
          bandIds.add(snap.id);
        });
        ownerBandsSnapshot.docs.forEach((snap) => {
          bandIds.add(snap.id);
        });

        const pressKitImageSnapshots = await Promise.all(
          Array.from(bandIds).map((bandId) => getDocs(collection(firestore, 'bands', bandId, 'pressKitImages'))),
        );

        if (cancelled) return;

        const pressKitBytes = pressKitImageSnapshots.reduce((total, snapshot) => {
          const bandTotal = snapshot.docs.reduce((sum, snap) => {
            const data = snap.data() as Record<string, unknown>;
            const sizeBytes = toSafeNumber(data.sizeBytes);
            if (sizeBytes !== null) return sum + sizeBytes;

            const legacySize = toSafeNumber(data.size);
            return legacySize !== null ? sum + legacySize : sum;
          }, 0);

          return total + bandTotal;
        }, 0);

        const usedBytes = recordingBytes + pressKitBytes;

        setState({
          usedBytes,
          quotaBytes,
          loading: false,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('[useStorageUsage] Failed to load storage usage:', err);
        setState((current) => ({ ...current, loading: false }));
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, planQuotaBytes]);

  return useMemo(() => {
    const usageRatio = state.quotaBytes > 0
      ? Math.min(1, Math.max(0, state.usedBytes / state.quotaBytes))
      : 0;

    return {
      ...state,
      usageRatio,
      remainingBytes: Math.max(0, state.quotaBytes - state.usedBytes),
    };
  }, [state]);
}
