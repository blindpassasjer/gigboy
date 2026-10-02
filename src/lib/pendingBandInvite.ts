const KEY = 'gigboy-pending-band-invite';

/** Remembers a band invite opened while signed out, so it survives login or account creation. */
export function savePendingBandInvite(inviteId: string) {
  try {
    window.localStorage.setItem(KEY, inviteId);
  } catch {
    // Ignore localStorage failures.
  }
}

export function getPendingBandInvite(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingBandInvite() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Ignore localStorage failures.
  }
}
