import { useEffect, useState } from 'react';
import { loadBandTransposePrefs } from '../lib/songMemberPrefs';

/**
 * The current user's personal transpose overrides for every song in a band, keyed by
 * song id. Loaded once per band; empty object until it resolves (and on failure).
 */
export function useBandTransposePrefs(bandId: string | null | undefined): Record<string, number> {
  const [prefs, setPrefs] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!bandId) {
      setPrefs({});
      return;
    }
    let cancelled = false;
    loadBandTransposePrefs(bandId)
      .then((value) => {
        if (!cancelled) setPrefs(value);
      })
      .catch(() => {
        if (!cancelled) setPrefs({});
      });
    return () => {
      cancelled = true;
    };
  }, [bandId]);

  return prefs;
}
