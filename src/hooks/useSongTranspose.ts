import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearMyTranspose,
  loadMyTranspose,
  saveMyTranspose,
} from '../lib/songMemberPrefs';

interface Params {
  bandId: string;
  songId: string;
  /** The song's stored `preferredTranspose`, used only as the seed when the member has
   *  no saved override of their own. */
  bandDefault: number | null | undefined;
}

export type TransposeScope = 'personal' | 'none';

/**
 * Resolves the transpose a member should see for a song: their personal override if set,
 * otherwise the song's stored fallback, otherwise the original key. Also exposes the
 * mutators for saving / clearing the personal override.
 *
 * The component keeps owning the live `transpose` value (so the +/- buttons stay snappy);
 * this hook just seeds it and reports which scope the current value matches.
 */
export function useSongTranspose({ bandId, songId, bandDefault }: Params) {
  const normalizedDefault = bandDefault ?? 0;
  const [myTranspose, setMyTranspose] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);
  // The value the transpose state should be (re)seeded to whenever the song or the
  // personal pref changes. Bump `seedToken` to signal the consumer to re-apply it.
  const [seed, setSeed] = useState({ value: normalizedDefault, token: 0 });
  const tokenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setResolved(false);
    loadMyTranspose(bandId, songId)
      .then((value) => {
        if (cancelled) return;
        setMyTranspose(value);
        tokenRef.current += 1;
        setSeed({ value: value ?? normalizedDefault, token: tokenRef.current });
        setResolved(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMyTranspose(null);
        tokenRef.current += 1;
        setSeed({ value: normalizedDefault, token: tokenRef.current });
        setResolved(true);
      });
    return () => {
      cancelled = true;
    };
    // normalizedDefault intentionally omitted — a band-default change shouldn't yank a
    // member off their own pinned transpose mid-view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandId, songId]);

  const pinForMe = useCallback(
    async (value: number) => {
      const saved = await saveMyTranspose(bandId, songId, value);
      setMyTranspose(saved);
      return saved;
    },
    [bandId, songId],
  );

  const clearMine = useCallback(async () => {
    await clearMyTranspose(bandId, songId);
    setMyTranspose(null);
    tokenRef.current += 1;
    setSeed({ value: normalizedDefault, token: tokenRef.current });
  }, [bandId, songId, normalizedDefault]);

  /** Whether a given live transpose value matches the member's saved override. */
  const scopeOf = useCallback(
    (current: number): TransposeScope =>
      myTranspose !== null && current === myTranspose ? 'personal' : 'none',
    [myTranspose],
  );

  return { myTranspose, resolved, seed, pinForMe, clearMine, scopeOf };
}
