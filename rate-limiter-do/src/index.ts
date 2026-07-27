/// <reference types="@cloudflare/workers-types" />

interface Window {
  count: number;
  resetAt: number;
}

interface LimitRequest {
  limit: number;
  windowMs: number;
}

// One instance per rate-limit key (see idFromName in the caller), so storage
// here is naturally scoped to a single caller+endpoint window.
export class RateLimiterDO implements DurableObject {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { limit, windowMs } = await request.json<LimitRequest>();
    const now = Date.now();

    const allowed = await this.state.storage.transaction(async (txn) => {
      const existing = await txn.get<Window>('window');

      if (!existing || now >= existing.resetAt) {
        await txn.put<Window>('window', { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (existing.count >= limit) return false;

      existing.count++;
      await txn.put<Window>('window', existing);
      return true;
    });

    return Response.json({ allowed });
  }
}

export default {
  async fetch() {
    return new Response('gigboy-rate-limiter', { status: 200 });
  },
};
