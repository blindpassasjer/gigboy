/**
 * `navigator.mediaDevices` (and therefore `getUserMedia`) is only exposed in secure contexts
 * (HTTPS, or `localhost`) — on a plain-HTTP self-host origin (e.g. http://192.168.1.50:6168)
 * it's `undefined`, so calling `.getUserMedia` directly throws a raw TypeError. Unlike
 * crypto.randomUUID, there is no in-browser fallback for microphone access — this only checks
 * up front so callers can show a clear message instead of crashing.
 */
export function getMicrophoneUnavailableReason(): string | null {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      return 'Microphone access requires a secure connection (HTTPS). This page is loaded over plain HTTP, so the browser blocks it — put a reverse proxy with HTTPS in front of Gigboy to use this feature.';
    }
    return 'Microphone access is not available in this browser.';
  }
  return null;
}
