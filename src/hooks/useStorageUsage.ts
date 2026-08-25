import { useEffect, useMemo, useState } from 'react';
import { isDemoMode } from '../lib/demo/demoMode';
import { getStorageUsage } from '../lib/demo/demoStore';

// Self-host has no plan tiers; storage quota is a raw per-user/per-band value.
// This is the old `crew` tier's figure, used only when no explicit quota is set.
const DEFAULT_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
// Storage usage isn't hyper time-sensitive (unlike hand notes) — poll at a relaxed interval,
// matching the polling pattern in src/lib/songHandNotes.ts.
const POLL_INTERVAL_MS = 20000;

interface UsageState {
  usedBytes: number;
  recordingBytes: number;
  imageBytes: number;
  attachmentBytes: number;
  quotaBytes: number;
  loading: boolean;
}

interface StorageUsageResponse {
  recordingBytes: number;
  attachmentBytes: number;
  imageBytes: number;
  quotaBytes: number;
}

async function fetchStorageUsage(bandId?: string | null): Promise<StorageUsageResponse> {
  if (isDemoMode) return getStorageUsage();
  const url = bandId ? `/api/storage-usage?bandId=${encodeURIComponent(bandId)}` : '/api/storage-usage';
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json() as Promise<StorageUsageResponse>;
}

/**
 * Self-host implementation of storage usage tracking — talks to `GET /api/storage-usage`
 * (see server/routes/storageUsage.ts) instead of aggregating Firestore/Storage metadata
 * client-side. Self-host has no realtime subscriptions, so this polls instead of using
 * `onSnapshot` (matching src/lib/songHandNotes.ts's precedent).
 */
export function useStorageUsage(userId: string | null | undefined, planQuotaBytes?: number, bandId?: string | null) {
  const [state, setState] = useState<UsageState>({
    usedBytes: 0,
    recordingBytes: 0,
    imageBytes: 0,
    attachmentBytes: 0,
    quotaBytes: planQuotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES,
    loading: false,
  });

  useEffect(() => {
    if (!userId) {
      setState({
        usedBytes: 0,
        recordingBytes: 0,
        imageBytes: 0,
        attachmentBytes: 0,
        quotaBytes: planQuotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES,
        loading: false,
      });
      return;
    }

    let cancelled = false;
    const currentBandId = bandId ?? null;

    const poll = async () => {
      setState((current) => ({ ...current, loading: true }));
      try {
        const usage = await fetchStorageUsage(currentBandId);
        if (cancelled) return;
        const quotaBytes = planQuotaBytes !== undefined ? Math.max(usage.quotaBytes, planQuotaBytes) : usage.quotaBytes;
        setState({
          usedBytes: usage.recordingBytes + usage.imageBytes + usage.attachmentBytes,
          recordingBytes: usage.recordingBytes,
          imageBytes: usage.imageBytes,
          attachmentBytes: usage.attachmentBytes,
          quotaBytes,
          loading: false,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('[useStorageUsage] Failed to load storage usage:', err);
        setState((current) => ({ ...current, loading: false }));
      }
    };

    void poll();
    const intervalId = window.setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
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
