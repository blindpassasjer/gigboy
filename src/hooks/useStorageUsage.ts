import { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { getMetadata, ref } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
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

function toSafeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
    const storageApi = storage;
    const storageSizeCache = new Map<string, number>();

    let cancelled = false;
    let loadingInFlight = false;
    let reloadQueued = false;

    async function getStorageObjectSize(storagePath: string): Promise<number> {
      const cached = storageSizeCache.get(storagePath);
      if (cached !== undefined) return cached;
      if (!storageApi) return 0;

      try {
        const metadata = await getMetadata(ref(storageApi, storagePath));
        const size = toSafeNumber(metadata.size) ?? 0;
        storageSizeCache.set(storagePath, size);
        return size;
      } catch {
        storageSizeCache.set(storagePath, 0);
        return 0;
      }
    }

    async function readDocSizeWithStorageFallback(data: Record<string, unknown>): Promise<number> {
      const sizeBytes = toSafeNumber(data.sizeBytes);
      if (sizeBytes !== null) return sizeBytes;

      const legacySize = toSafeNumber(data.size);
      if (legacySize !== null) return legacySize;

      const storagePath = toSafeNonEmptyString(data.storagePath);
      if (!storagePath) return 0;

      return getStorageObjectSize(storagePath);
    }

    async function load() {
      if (loadingInFlight) {
        reloadQueued = true;
        return;
      }

      loadingInFlight = true;
      setState((current) => ({ ...current, loading: true }));

      try {
        const [
          userSnapshot,
          recordingsSnapshot,
          ownPressKitImagesSnapshot,
          memberBandsSnapshot,
          ownerBandsSnapshot,
        ] = await Promise.all([
          getDoc(doc(firestore, 'users', currentUserId)),
          getDocs(query(collectionGroup(firestore, 'recordings'), where('recorder.userId', '==', currentUserId))),
          getDocs(query(collectionGroup(firestore, 'pressKitImages'), where('createdBy', '==', currentUserId))),
          getDocs(query(collection(firestore, 'bands'), where('memberIds', 'array-contains', currentUserId))),
          getDocs(query(collection(firestore, 'bands'), where('ownerId', '==', currentUserId))),
        ]);

        if (cancelled) return;

        const userData = userSnapshot.data() as Record<string, unknown> | undefined;
        const quotaFromProfile = toSafeNumber(userData?.storageQuotaBytes);
        const baseQuota = quotaFromProfile ?? DEFAULT_STORAGE_QUOTA_BYTES;
        const quotaBytes = planQuotaBytes !== undefined ? Math.max(baseQuota, planQuotaBytes) : baseQuota;

        const recordingSizes = await Promise.all(
          recordingsSnapshot.docs.map((snap) => readDocSizeWithStorageFallback(snap.data() as Record<string, unknown>)),
        );
        const recordingBytes = recordingSizes.reduce((sum, value) => sum + value, 0);

        const bandIds = new Set<string>();
        memberBandsSnapshot.docs.forEach((snap) => {
          bandIds.add(snap.id);
        });
        ownerBandsSnapshot.docs.forEach((snap) => {
          bandIds.add(snap.id);
        });

        const pressKitImageSnapshots = await Promise.allSettled(
          Array.from(bandIds).map((bandId) => getDocs(collection(firestore, 'bands', bandId, 'pressKitImages'))),
        );

        if (cancelled) return;

        const seenPressKitDocPaths = new Set<string>();
        const pressKitDocData: Array<Record<string, unknown>> = [];
        ownPressKitImagesSnapshot.docs.forEach((snap) => {
          if (seenPressKitDocPaths.has(snap.ref.path)) return;
          seenPressKitDocPaths.add(snap.ref.path);
          pressKitDocData.push(snap.data() as Record<string, unknown>);
        });

        pressKitImageSnapshots.forEach((snapshot) => {
          if (snapshot.status !== 'fulfilled') return;
          snapshot.value.docs.forEach((snap) => {
            if (seenPressKitDocPaths.has(snap.ref.path)) return;
            seenPressKitDocPaths.add(snap.ref.path);
            pressKitDocData.push(snap.data() as Record<string, unknown>);
          });
        });

        const pressKitSizes = await Promise.all(
          pressKitDocData.map((data) => readDocSizeWithStorageFallback(data)),
        );
        let pressKitBytes = pressKitSizes.reduce((sum, value) => sum + value, 0);

        // Legacy logos may exist only as bands/{bandId}/logo.* without a pressKitImages doc.
        const seenStoragePaths = new Set<string>();
        pressKitDocData.forEach((data) => {
          const storagePath = toSafeNonEmptyString(data.storagePath);
          if (storagePath) seenStoragePaths.add(storagePath);
        });

        const legacyLogoPaths = new Set<string>();
        memberBandsSnapshot.docs.forEach((snap) => {
          const data = snap.data() as Record<string, unknown>;
          const logoStoragePath = toSafeNonEmptyString(data.logoStoragePath);
          if (!logoStoragePath || seenStoragePaths.has(logoStoragePath)) return;
          legacyLogoPaths.add(logoStoragePath);
        });
        ownerBandsSnapshot.docs.forEach((snap) => {
          const data = snap.data() as Record<string, unknown>;
          const logoStoragePath = toSafeNonEmptyString(data.logoStoragePath);
          if (!logoStoragePath || seenStoragePaths.has(logoStoragePath)) return;
          legacyLogoPaths.add(logoStoragePath);
        });

        if (legacyLogoPaths.size > 0) {
          const legacyLogoSizes = await Promise.all(
            Array.from(legacyLogoPaths).map((storagePath) => getStorageObjectSize(storagePath)),
          );
          pressKitBytes += legacyLogoSizes.reduce((sum, value) => sum + value, 0);
        }

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
      } finally {
        loadingInFlight = false;
        if (!cancelled && reloadQueued) {
          reloadQueued = false;
          void load();
        }
      }
    }

    void load();

    const recordingsQuery = query(
      collectionGroup(firestore, 'recordings'),
      where('recorder.userId', '==', currentUserId),
    );

    const ownPressKitImagesQuery = query(
      collectionGroup(firestore, 'pressKitImages'),
      where('createdBy', '==', currentUserId),
    );

    const memberBandsQuery = query(
      collection(firestore, 'bands'),
      where('memberIds', 'array-contains', currentUserId),
    );

    const ownerBandsQuery = query(
      collection(firestore, 'bands'),
      where('ownerId', '==', currentUserId),
    );

    const userDocRef = doc(firestore, 'users', currentUserId);
    let ownedBandIds = new Set<string>();
    let memberBandIds = new Set<string>();
    const pressKitUnsubByBandId = new Map<string, () => void>();

    function requestReload() {
      void load();
    }

    function reconcilePressKitListeners() {
      const nextBandIds = new Set<string>([...ownedBandIds, ...memberBandIds]);

      for (const [bandId, unsubscribe] of pressKitUnsubByBandId.entries()) {
        if (!nextBandIds.has(bandId)) {
          unsubscribe();
          pressKitUnsubByBandId.delete(bandId);
        }
      }

      nextBandIds.forEach((bandId) => {
        if (pressKitUnsubByBandId.has(bandId)) return;
        const unsubscribe = onSnapshot(
          collection(firestore, 'bands', bandId, 'pressKitImages'),
          () => requestReload(),
          () => requestReload(),
        );
        pressKitUnsubByBandId.set(bandId, unsubscribe);
      });
    }

    const unsubscribeUser = onSnapshot(userDocRef, () => requestReload(), () => requestReload());
    const unsubscribeRecordings = onSnapshot(recordingsQuery, () => requestReload(), () => requestReload());
    const unsubscribeOwnPressKitImages = onSnapshot(ownPressKitImagesQuery, () => requestReload(), () => requestReload());

    const unsubscribeMemberBands = onSnapshot(
      memberBandsQuery,
      (snapshot) => {
        memberBandIds = new Set(snapshot.docs.map((snap) => snap.id));
        reconcilePressKitListeners();
        requestReload();
      },
      () => requestReload(),
    );

    const unsubscribeOwnerBands = onSnapshot(
      ownerBandsQuery,
      (snapshot) => {
        ownedBandIds = new Set(snapshot.docs.map((snap) => snap.id));
        reconcilePressKitListeners();
        requestReload();
      },
      () => requestReload(),
    );

    return () => {
      cancelled = true;
      unsubscribeUser();
      unsubscribeRecordings();
      unsubscribeOwnPressKitImages();
      unsubscribeMemberBands();
      unsubscribeOwnerBands();
      pressKitUnsubByBandId.forEach((unsubscribe) => unsubscribe());
      pressKitUnsubByBandId.clear();
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
