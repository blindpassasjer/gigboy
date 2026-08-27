import { isDemoMode } from './demo/demoMode';

/**
 * Public instance metadata served by `GET /api/config` (see server/routes/config.ts).
 * All fields are optional — when the self-hoster hasn't set the matching env var the
 * value is null and the UI falls back to generic wording.
 */
export interface InstanceConfig {
  operatorName: string | null;
  operatorContactEmail: string | null;
  operatorJurisdiction: string | null;
}

const EMPTY_CONFIG: InstanceConfig = {
  operatorName: null,
  operatorContactEmail: null,
  operatorJurisdiction: null,
};

let cached: Promise<InstanceConfig> | null = null;

export function loadInstanceConfig(): Promise<InstanceConfig> {
  if (cached) return cached;

  // The static demo build has no server to ask — everything falls back to generic wording.
  if (isDemoMode) {
    cached = Promise.resolve(EMPTY_CONFIG);
    return cached;
  }

  cached = fetch('/api/config', { credentials: 'include' })
    .then((res) => (res.ok ? (res.json() as Promise<Partial<InstanceConfig>>) : {}))
    .then((data) => ({ ...EMPTY_CONFIG, ...data }))
    .catch(() => EMPTY_CONFIG);

  return cached;
}
