import { useEffect, useState } from 'react';
import { loadInstanceConfig, type InstanceConfig } from '../lib/instanceConfig';

/**
 * Reads the public instance metadata from `GET /api/config` once and caches it for the
 * session. Returns null until the first load resolves.
 */
export function useInstanceConfig(): InstanceConfig | null {
  const [config, setConfig] = useState<InstanceConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadInstanceConfig().then((value) => {
      if (!cancelled) setConfig(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
