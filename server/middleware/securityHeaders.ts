import type { Request, Response, NextFunction } from 'express';

/**
 * Baseline security response headers, applied to every response. Kept deliberately small (no
 * `helmet` dependency): the SPA is served from the same origin as the API, loads no third-party
 * scripts, and talks only to its own `/api`. `frame-ancestors 'none'` (plus the legacy
 * `X-Frame-Options`) blocks clickjacking; `nosniff` stops a stored upload with a spoofed
 * `Content-Type` from being reinterpreted as HTML/JS.
 *
 * HSTS is intentionally omitted here — self-host instances are commonly served over plain HTTP
 * on a LAN (see SELFHOSTING.md). Set it at the reverse proxy that terminates TLS instead.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // index.html ships one first-party inline bootstrap snippet (the ?p= redirect decoder),
      // hence 'unsafe-inline' for scripts; the app loads no third-party script origins.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      // 'self' plus https: so an optionally-configured Sentry DSN (VITE_SENTRY_DSN) can report.
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  );
  next();
}
