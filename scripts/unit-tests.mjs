// Node unit tests of the card's logic that needs neither a browser nor a GPU: test/unit/*.test.ts are
// bundled with esbuild (the embedded decoder and the DOM-only modules stubbed) and run with node --test.
import { build } from 'esbuild';
import { readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const dir = 'test/unit';
const out = path.join('dev', 'out', 'unit');
mkdirSync(out, { recursive: true });
const entries = readdirSync(dir).filter((f) => f.endsWith('.test.ts')).map((f) => path.join(dir, f));
await build({
  entryPoints: entries,
  outdir: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
  plugins: [
    {
      name: 'stubs',
      setup(b) {
        b.onResolve({ filter: /^embedded:/ }, (a) => ({ path: a.path, namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default ""', loader: 'js' }));
      },
    },
  ],
});
const files = readdirSync(out).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join(out, f));
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
