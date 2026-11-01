import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver;

// jsdom doesn't implement ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Node's fetch Request rejects jsdom's AbortSignal, which breaks data-router
// navigation in tests. Drop the signal; tests don't rely on aborting requests.
const NativeRequest = globalThis.Request;
globalThis.Request = class Request extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init?.signal ? { ...init, signal: undefined } : init);
  }
} as typeof globalThis.Request;
