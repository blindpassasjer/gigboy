import { apiClient } from './apiClient';
import { demoClient } from './demoClient';
import { isDemoMode } from '../demo/demoMode';
import type { DataClient } from './types';

/**
 * Self-host is the default backend: talks to the Express/Postgres server via `apiClient`.
 * The static demo build (`VITE_DEMO=true`) swaps in `demoClient`, which runs entirely
 * client-side against in-browser sample data — see `src/lib/demo/demoStore.ts`.
 */
export const dataClient: DataClient = isDemoMode ? demoClient : apiClient;

export type { AuthClient, DataClient } from './types';
