/**
 * True when this build was compiled with `VITE_DEMO=true` (see `npm run build:demo`) — a
 * static, backend-free build meant for GitHub Pages. Swaps `dataClient` (and a few modules
 * that bypass it) over to the in-browser `demoStore` instead of talking to a real server.
 */
export const isDemoMode = import.meta.env.VITE_DEMO === 'true';
