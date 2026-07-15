interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, win] of store) {
    if (now >= win.resetAt) store.delete(key);
  }
}

/**
 * Returns true if the request is allowed, false if the limit is exceeded.
 * key    — unique string identifying the caller+endpoint (e.g. "1.2.3.4:/api/auth/")
 * limit  — max requests allowed in the window
 * windowMs — window size in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  cleanup();
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= limit) return false;

  existing.count++;
  return true;
}
