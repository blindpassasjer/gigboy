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

export function useStorageUsage(userId: string | null | undefined, planQuotaBytes?: number, bandId?: string | null) {
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
    const currentBandId = bandId ?? null;
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
        // ── Quota (always from user profile) ─────────────────────────────────
        const userSnapshotResult = await Promise.allSettled([
          getDoc(doc(firestore, 'users', currentUserId)),
        ]);
        if (cancelled) return;
        const userSnapshot = userSnapshotResult[0].status === 'fulfilled' ? userSnapshotResult[0].value : null;
        const userData = userSnapshot?.data() as Record<string, unknown> | undefined;
        const quotaFromProfile = toSafeNumber(userData?.storageQuotaBytes);
        const baseQuota = quotaFromProfile ?? DEFAULT_STORAGE_QUOTA_BYTES;
        const quotaBytes = planQuotaBytes !== undefined ? Math.max(baseQuota, planQuotaBytes) : baseQuota;

        let recordingBytes = 0;
        let pressKitBytes = 0;

        if (currentBandId) {
          // ── Band-scoped: only count assets belonging to this band ──────────
          const [bandDocResult, pressKitImagesResult, bandSongsResult] = await Promise.allSettled([
            getDoc(doc(firestore, 'bands', currentBandId)),
            getDocs(collection(firestore, 'bands', currentBandId, 'pressKitImages')),
            getDocs(collection(firestore, 'bands', currentBandId, 'songs')),
          ]);

          if (cancelled) return;

          // Press kit images
          const pressKitImageDocs = pressKitImagesResult.status === 'fulfilled'
            ? pressKitImagesResult.value.docs
            : [];
          const seenStoragePaths = new Set<string>();
          const pkSizes = await Promise.all(
            pressKitImageDocs.map((snap) => {
              const data = snap.data() as Record<string, unknown>;
              const sp = toSafeNonEmptyString(data.storagePath);
              if (sp) seenStoragePaths.add(sp);
              return readDocSizeWithStorageFallback(data);
            }),
          );
          pressKitBytes = pkSizes.reduce((sum, v) => sum + v, 0);

          // Legacy logo not already covered by a pressKitImages doc
          if (bandDocResult.status === 'fulfilled') {
            const bandData = bandDocResult.value.data() as Record<string, unknown> | undefined;
            const logoPath = toSafeNonEmptyString(bandData?.logoStoragePath);
            if (logoPath && !seenStoragePaths.has(logoPath)) {
              pressKitBytes += await getStorageObjectSize(logoPath);
            }
          }

          // Recordings within this band's songs
          const songIds = bandSongsResult.status === 'fulfilled'
            ? bandSongsResult.value.docs.map((s) => s.id)
            : [];
          const recordingSnapshots = await Promise.allSettled(
            songIds.map((songId) =>
              getDocs(collection(firestore, 'bands', currentBandId, 'songs', songId, 'recordings')),
            ),
          );
          if (cancelled) return;
          const allRecordingDocs = recordingSnapshots.flatMap((r) =>
            r.status === 'fulfilled' ? r.value.docs : [],
          );
          const recSizes = await Promise.all(
            allRecordingDocs.map((snap) => readDocSizeWithStorageFallback(snap.data() as Record<string, unknown>)),
          );
          recordingBytes = recSizes.reduce((sum, v) => sum + v, 0);
        } else {
          // ── Cross-band: aggregate across all bands the user belongs to ─────
          const [
            recordingsSnapshotResult,
            ownPressKitImagesSnapshotResult,
            memberBandsSnapshotResult,
            ownerBandsSnapshotResult,
          ] = await Promise.allSettled([
            getDocs(query(collectionGroup(firestore, 'recordings'), where('recorder.userId', '==', currentUserId))),
            getDocs(query(collectionGroup(firestore, 'pressKitImages'), where('createdBy', '==', currentUserId))),
            getDocs(query(collection(firestore, 'bands'), where('memberIds', 'array-contains', currentUserId))),
            getDocs(query(collection(firestore, 'bands'), where('ownerId', '==', currentUserId))),
          ]);

          if (cancelled) return;

          const recordingsSnapshot = recordingsSnapshotResult.status === 'fulfilled' ? recordingsSnapshotResult.value : null;
          const ownPressKitImagesSnapshot = ownPressKitImagesSnapshotResult.status === 'fulfilled' ? ownPressKitImagesSnapshotResult.value : null;
          const memberBandsSnapshot = memberBandsSnapshotResult.status === 'fulfilled' ? memberBandsSnapshotResult.value : null;
          const ownerBandsSnapshot = ownerBandsSnapshotResult.status === 'fulfilled' ? ownerBandsSnapshotResult.value : null;

          const recordingSizes = await Promise.all(
            (recordingsSnapshot?.docs ?? []).map((snap) => readDocSizeWithStorageFallback(snap.data() as Record<string, unknown>)),
          );
          recordingBytes = recordingSizes.reduce((sum, value) => sum + value, 0);

          const allBandIds = new Set<string>();
          (memberBandsSnapshot?.docs ?? []).forEach((snap) => allBandIds.add(snap.id));
          (ownerBandsSnapshot?.docs ?? []).forEach((snap) => allBandIds.add(snap.id));

          const pressKitImageSnapshots = await Promise.allSettled(
            Array.from(allBandIds).map((bid) => getDocs(collection(firestore, 'bands', bid, 'pressKitImages'))),
          );

          if (cancelled) return;

          const seenPressKitDocPaths = new Set<string>();
          const pressKitDocData: Array<Record<string, unknown>> = [];
          ownPressKitImagesSnapshot?.docs.forEach((snap) => {
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
          pressKitBytes = pressKitSizes.reduce((sum, value) => sum + value, 0);

          const seenStoragePaths = new Set<string>();
          pressKitDocData.forEach((data) => {
            const sp = toSafeNonEmptyString(data.storagePath);
            if (sp) seenStoragePaths.add(sp);
          });

          const legacyLogoPaths = new Set<string>();
          [...(memberBandsSnapshot?.docs ?? []), ...(ownerBandsSnapshot?.docs ?? [])].forEach((snap) => {
            const data = snap.data() as Record<string, unknown>;
            const logoStoragePath = toSafeNonEmptyString(data.logoStoragePath);
            if (!logoStoragePath || seenStoragePaths.has(logoStoragePath)) return;
            legacyLogoPaths.add(logoStoragePath);
          });

          if (legacyLogoPaths.size > 0) {
            const legacyLogoSizes = await Promise.all(
              Array.from(legacyLogoPaths).map((sp) => getStorageObjectSize(sp)),
            );
            pressKitBytes += legacyLogoSizes.reduce((sum, value) => sum + value, 0);
          }
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

    function requestReload() {
      void load();
    }

    const userDocRef = doc(firestore, 'users', currentUserId);
    const unsubscribeUser = onSnapshot(userDocRef, () => requestReload(), () => {});
    const cleanups: Array<() => void> = [unsubscribeUser];

    if (currentBandId) {
      // Band-scoped listeners
      cleanups.push(
        onSnapshot(doc(firestore, 'bands', currentBandId), () => requestReload(), () => {}),
        onSnapshot(collection(firestore, 'bands', currentBandId, 'pressKitImages'), () => requestReload(), () => {}),
        onSnapshot(collection(firestore, 'bands', currentBandId, 'songs'), () => requestReload(), () => {}),
      );
    } else {
      // Cross-band listeners
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

      let ownedBandIds = new Set<string>();
      let memberBandIds = new Set<string>();
      const pressKitUnsubByBandId = new Map<string, () => void>();

      function reconcilePressKitListeners() {
        const nextBandIds = new Set<string>([...ownedBandIds, ...memberBandIds]);
        for (const [bid, unsubscribe] of pressKitUnsubByBandId.entries()) {
          if (!nextBandIds.has(bid)) {
            unsubscribe();
            pressKitUnsubByBandId.delete(bid);
          }
        }
        nextBandIds.forEach((bid) => {
          if (pressKitUnsubByBandId.has(bid)) return;
          pressKitUnsubByBandId.set(
            bid,
            onSnapshot(collection(firestore, 'bands', bid, 'pressKitImages'), () => requestReload(), () => {}),
          );
        });
      }

      cleanups.push(
        onSnapshot(recordingsQuery, () => requestReload(), () => {}),
        onSnapshot(ownPressKitImagesQuery, () => requestReload(), () => {}),
        onSnapshot(
          memberBandsQuery,
          (snapshot) => { memberBandIds = new Set(snapshot.docs.map((s) => s.id)); reconcilePressKitListeners(); requestReload(); },
          () => {},
        ),
        onSnapshot(
          ownerBandsQuery,
          (snapshot) => { ownedBandIds = new Set(snapshot.docs.map((s) => s.id)); reconcilePressKitListeners(); requestReload(); },
          () => {},
        ),
        () => { pressKitUnsubByBandId.forEach((u) => u()); pressKitUnsubByBandId.clear(); },
      );
    }

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [userId, planQuotaBytes, bandId]);

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
