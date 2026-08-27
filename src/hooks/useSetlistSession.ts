import { useCallback, useEffect, useRef, useState } from 'react';
import {
  claimSetlistHost,
  pushSetlistSession,
  releaseSetlistHost,
  subscribeSetlistSession,
  type SessionPatch,
  type SetlistSessionState,
} from '../lib/setlistSession';
import { isDemoMode } from '../lib/demo/demoMode';
import { DEMO_SESSION_HOST_ID } from '../lib/setlistSession';

export type SessionMode = 'solo' | 'follow' | 'lead';

interface Params {
  bandId: string | null | undefined;
  setlistId: string | null | undefined;
  currentUserId: string | null | undefined;
}

/**
 * Drives a shared "now playing" setlist session. In `follow` mode the returned `state`
 * tracks the leader's position; in `lead` mode call `push` on every local navigation.
 */
export function useSetlistSession({ bandId, setlistId, currentUserId }: Params) {
  const [mode, setModeState] = useState<SessionMode>('solo');
  const [state, setState] = useState<SetlistSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const enabled = Boolean(bandId && setlistId) && mode !== 'solo';

  // Live subscription while following or leading.
  useEffect(() => {
    if (!enabled || !bandId || !setlistId) {
      setState(null);
      return;
    }
    const unsubscribe = subscribeSetlistSession(bandId, setlistId, setState);
    return unsubscribe;
  }, [enabled, bandId, setlistId]);

  // Claim / release host when entering / leaving lead mode.
  useEffect(() => {
    if (mode !== 'lead' || !bandId || !setlistId) return;
    claimSetlistHost(bandId, setlistId)
      .then((s) => setState(s))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not lead this setlist.');
        setModeState('follow');
      });
    return () => {
      void releaseSetlistHost(bandId, setlistId).catch(() => {});
    };
  }, [mode, bandId, setlistId]);

  const isHost = mode === 'lead'
    && state?.hostUserId != null
    && (isDemoMode ? state.hostUserId === DEMO_SESSION_HOST_ID : state.hostUserId === currentUserId);

  const push = useCallback(
    (patch: SessionPatch) => {
      if (modeRef.current !== 'lead' || !bandId || !setlistId) return;
      void pushSetlistSession(bandId, setlistId, patch).catch(() => {});
    },
    [bandId, setlistId],
  );

  const setMode = useCallback((next: SessionMode) => {
    setError(null);
    setModeState(next);
  }, []);

  return {
    mode,
    setMode,
    /** Leader's position while following; also reflects your own pushes while leading. */
    state: mode === 'solo' ? null : state,
    isHost,
    isFollowing: mode === 'follow',
    error,
    push,
  };
}
