import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
await build({ absWorkingDir: root, entryPoints: ['src/main.tsx'], bundle: true, minify: true, sourcemap: false, outfile: path.join(root, 'assets/subasta.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, target: ['es2020'], legalComments: 'eof' });
