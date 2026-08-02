import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');
const routesPath = resolve(distDir, '_routes.json');

await mkdir(distDir, { recursive: true });
// Cloudflare Pages routing: /api/* requests go to Functions, everything else is static/SPA.
// /public/press-kit/* also goes to Functions so it can rewrite Open Graph meta tags
// (band name/logo) into the SPA shell before serving it, for link-preview crawlers.
await writeFile(routesPath, JSON.stringify({
  version: 1,
  include: ['/api/*', '/public/press-kit/*'],
  exclude: []
}, null, 2));