/**
 * Cloudflare Workers compatibility patch.
 *
 * In the Workers runtime (nodejs_compat), process.stdout and process.stderr
 * are Web WritableStreams. google-logging-utils/colours.js calls
 * stream.getColorDepth() and compares the result with `> 2`, which throws
 * "Cannot convert object to primitive value" when the polyfilled stream
 * returns a non-primitive from getColorDepth().
 *
 * Nulling out these streams before firebase-admin is loaded causes
 * Colours.isEnabled(null) to short-circuit safely.
 *
 * This file MUST be the first import in any file that transitively
 * imports firebase-admin.
 */
if (typeof process !== 'undefined') {
  try {
    Object.defineProperty(process, 'stderr', { value: null, configurable: true, writable: true });
    Object.defineProperty(process, 'stdout', { value: null, configurable: true, writable: true });
  } catch {
    // defineProperty may throw in some environments; ignore silently.
  }
}
