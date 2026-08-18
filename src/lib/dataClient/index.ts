import { apiClient } from './apiClient';
import { firebaseClient } from './firebaseClient';
import type { DataClient } from './types';

/**
 * Selects the backend implementation once at startup: `firebaseClient` (today's
 * Firestore-backed hosted SaaS, the default) or `apiClient` (self-host, talks to the
 * Express/Postgres server) when built with `VITE_BACKEND=selfhost`.
 */
export const dataClient: DataClient =
  import.meta.env.VITE_BACKEND === 'selfhost' ? apiClient : firebaseClient;

export type { AuthClient, CrudClient, DataClient } from './types';
