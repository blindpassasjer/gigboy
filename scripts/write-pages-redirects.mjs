import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');
const redirectsPath = resolve(distDir, '_redirects');

await mkdir(distDir, { recursive: true });
// Allow API requests to reach Functions; route everything else to SPA
await writeFile(redirectsPath, '/api/* :splat 200\n/* /index.html 200\n');