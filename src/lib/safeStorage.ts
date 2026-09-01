/**
 * `localStorage` access throws in some Safari configurations — legacy private browsing,
 * certain MDM / "block all cookies" profiles — and an uncaught throw in a render or
 * module-init path white-screens the app before React can mount. These wrappers swallow
 * that and fall back to sensible defaults.
 */

export function readStoredString(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredString(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable or full — the preference just won't persist this session.
  }
}

export function removeStoredString(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // no-op
  }
}
