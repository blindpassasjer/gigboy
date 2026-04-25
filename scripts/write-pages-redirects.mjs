import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');
const redirectsPath = resolve(distDir, '_redirects');

await mkdir(distDir, { recursive: true });
await writeFile(redirectsPath, '/* /index.html 200\n');