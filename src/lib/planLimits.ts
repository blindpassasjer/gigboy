import type { PlanTier } from '../types';

export type ProFeature =
  | 'setlists'
  | 'technicalRiders'
  | 'shareableLinks'
  | 'bluetoothPedal'
  | 'recordings'
  | 'metronome'
  | 'multiUserNotes';

interface PlanLimits {
  songLimit: number | null;
  storageQuotaBytes: number;
  memberLimit: number;
}

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  pro: 'Pro',
  crew: 'Crew',
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    songLimit: 12,
    storageQuotaBytes: 100 * 1024 * 1024,
    memberLimit: 1,
  },
  pro: {
    songLimit: null,
    storageQuotaBytes: 1024 * 1024 * 1024,
    memberLimit: 1,
  },
  crew: {
    songLimit: null,
    storageQuotaBytes: 5 * 1024 * 1024 * 1024,
    memberLimit: 5,
  },
};

export const PLAN_FEATURE_ACCESS: Record<PlanTier, Record<ProFeature, boolean>> = {
  free: {
    setlists: false,
    technicalRiders: false,
    shareableLinks: false,
    bluetoothPedal: false,
    recordings: false,
    metronome: false,
    multiUserNotes: false,
  },
  pro: {
    setlists: true,
    technicalRiders: true,
    shareableLinks: true,
    bluetoothPedal: true,
    recordings: true,
    metronome: true,
    multiUserNotes: true,
  },
  crew: {
    setlists: true,
    technicalRiders: true,
    shareableLinks: true,
    bluetoothPedal: true,
    recordings: true,
    metronome: true,
    multiUserNotes: true,
  },
};