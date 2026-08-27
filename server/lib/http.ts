import type { Request } from 'express';

/**
 * The public-facing origin (`https://host[:port]`) for URLs the server hands back to clients —
 * invite links, press-kit share URLs, OG `og:url` tags.
 *
 * Prefers the operator-configured `PUBLIC_ORIGIN` env var. Falls back to reconstructing it from
 * the request's protocol + `Host` header, which is attacker-controlled: without `PUBLIC_ORIGIN`
 * set, a forged `Host` header is reflected into generated links (link/cache poisoning). Setting
 * `PUBLIC_ORIGIN` removes that vector entirely.
 */
export function resolveOrigin(req: Request): string {
  const configured = process.env.PUBLIC_ORIGIN;
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/+$/, '');
  }
  return `${req.protocol}://${req.get('host')}`;
}
