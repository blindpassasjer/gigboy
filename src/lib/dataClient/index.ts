import { apiClient } from './apiClient';
import type { DataClient } from './types';

/**
 * Self-host is the only backend: talks to the Express/Postgres server via `apiClient`.
 */
export const dataClient: DataClient = apiClient;

export type { AuthClient, DataClient } from './types';
