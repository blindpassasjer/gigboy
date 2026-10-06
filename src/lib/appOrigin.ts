/**
 * The URL prefix public share links are built from: the page's origin plus the app's base path.
 * On a normal self-host the base is '/', so this is just `window.location.origin`. The static demo
 * is served from a repo subpath on GitHub Pages (e.g. `/gigboy/`), and a link without that prefix
 * would point outside the app.
 */
export function appOrigin(): string {
  const base = import.meta.env.BASE_URL;
  // A relative base ('./') has no fixed path to prefix, so fall back to the origin alone.
  const path = base.startsWith('.') ? '' : base.replace(/\/+$/, '');
  return `${window.location.origin}${path}`;
}
