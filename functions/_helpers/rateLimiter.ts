/// <reference types="@cloudflare/workers-types" />

/**
 * Returns true if the request is allowed, false if the limit is exceeded.
 * Backed by a Durable Object (one instance per key) so the count is
 * consistent across every edge location/isolate, not just the local one.
 *
 * key      — unique string identifying the caller+endpoint (e.g. "1.2.3.4:/api/auth/")
 * limit    — max requests allowed in the window
 * windowMs — window size in milliseconds
 */
export async function checkRateLimit(
  rateLimiter: DurableObjectNamespace,
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const id = rateLimiter.idFromName(key);
  const stub = rateLimiter.get(id);
  const res = await stub.fetch('https://rate-limiter/', {
    method: 'POST',
    body: JSON.stringify({ limit, windowMs }),
  });
  const { allowed } = await res.json<{ allowed: boolean }>();
  return allowed;
}
