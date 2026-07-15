import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');
const routesPath = resolve(distDir, '_routes.json');

await mkdir(distDir, { recursive: true });
// Cloudflare Pages routing: /api/* requests go to Functions, everything else is static/SPA
await writeFile(routesPath, JSON.stringify({
  version: 1,
  include: ['/api/*'],
  exclude: []
}, null, 2));