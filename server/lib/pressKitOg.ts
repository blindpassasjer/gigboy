import type { PublicPressKitData } from '../routes/publicPressKits.js';

/** Escapes `"`, `<`, `>`, `&` for safe interpolation into an HTML attribute or text node. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function replaceMetaContent(html: string, attr: 'property' | 'name', value: string, content: string): string {
  const re = new RegExp(`(<meta\\s+${attr}=["']${value}["']\\s+content=["'])[^"']*(["']\\s*/?>)`, 'i');
  return html.replace(re, `$1${content}$2`);
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
}

/**
 * Ports functions/public/press-kit/[token].ts's Cloudflare `HTMLRewriter`-based meta tag
 * injection to plain string replacement, for the Express OG-tag SSR middleware (index.ts). Same
 * tag values/logic as the Cloudflare version — title, og: and twitter: meta content, and an
 * appended `og:url` tag — just implemented without HTMLRewriter. All interpolated values are
 * HTML-escaped first since they come from user-supplied band/press-kit data.
 */
export function renderPressKitOgHtml(indexHtml: string, data: PublicPressKitData, pageUrl: string, origin: string): string {
  const title = escapeHtml(`${data.bandName} — Press Kit`);
  const descriptionSource = data.kit.richText ?? '';
  const description = escapeHtml(
    stripHtml(descriptionSource).slice(0, 200) || `Press kit and media for ${data.bandName}, shared via GIGBOY.`,
  );
  const rawImage = data.bandLogo ?? data.images[0]?.url ?? `${origin}/pwa-512.png`;
  const image = escapeHtml(rawImage.startsWith('http') ? rawImage : `${origin}${rawImage}`);
  const escapedPageUrl = escapeHtml(pageUrl);

  let html = indexHtml;
  html = replaceTitle(html, title);
  html = replaceMetaContent(html, 'property', 'og:title', title);
  html = replaceMetaContent(html, 'name', 'twitter:title', title);
  html = replaceMetaContent(html, 'property', 'og:description', description);
  html = replaceMetaContent(html, 'name', 'twitter:description', description);
  html = replaceMetaContent(html, 'property', 'og:image', image);
  html = replaceMetaContent(html, 'name', 'twitter:image', image);
  html = replaceMetaContent(html, 'property', 'og:type', 'profile');
  html = replaceMetaContent(html, 'name', 'description', description);
  html = html.replace(/<\/head>/i, `<meta property="og:url" content="${escapedPageUrl}"></head>`);

  return html;
}
