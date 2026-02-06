import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');

const outDir = path.join(packageRoot, 'dist', 'terraform');

const bundles = [
  {
    name: 'vau-processor',
    entry: path.join(packageRoot, 'workers', 'vau-processor', 'src', 'index.ts'),
    outfile: path.join(outDir, 'vau-processor.js'),
  },
  {
    name: 'security-worker',
    entry: path.join(packageRoot, 'workers', 'security-worker', 'src', 'index.ts'),
    outfile: path.join(outDir, 'security-worker.js'),
  },
  {
    name: 'durable-objects',
    entry: path.join(packageRoot, 'durable-objects', 'index.ts'),
    outfile: path.join(outDir, 'durable-objects.js'),
  },
];

await mkdir(outDir, { recursive: true });

for (const bundle of bundles) {
  await build({
    entryPoints: [bundle.entry],
    outfile: bundle.outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    minify: false,
    logLevel: 'info',
  });
}
