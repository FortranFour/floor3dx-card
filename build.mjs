// Build: src/floor3dpro-card.ts -> dist/floor3dx-card.js, one ES module, with esbuild.
//   node build.mjs           production build (minified)
//   node build.mjs --watch   rebuild on change, unminified
// The fork's identity (element names floor3dpro-* -> floor3dx-*, the build id) is applied to the
// output text by fork-identity.mjs, as it was under rollup. A few @material/mwc modules are stubbed
// out: Home Assistant already defines those elements, and a second definition would throw.
import { build, context } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { applyForkIdentity } from './fork-identity.mjs';

const require = createRequire(import.meta.url);
const watch = process.argv.includes('--watch');

const stubbed = [
  '@material/mwc-notched-outline/mwc-notched-outline.js',
  '@material/mwc-ripple/mwc-ripple.js',
  '@material/mwc-list/mwc-list-item.js',
  '@material/mwc-list/mwc-list.js',
  '@material/mwc-menu/mwc-menu.js',
  '@material/mwc-menu/mwc-menu-surface.js',
  '@material/mwc-icon/mwc-icon.js',
  '@material/mwc-button/mwc-button.js',
].map((m) => require.resolve(m));

const stubPlugin = {
  name: 'stub-mwc-elements',
  setup(b) {
    b.onLoad({ filter: /\.js$/ }, (args) => (stubbed.includes(args.path) ? { contents: '', loader: 'js' } : null));
  },
};

const identityPlugin = {
  name: 'fork-identity',
  setup(b) {
    b.onEnd((result) => {
      for (const file of result.outputFiles || []) {
        fs.mkdirSync('dist', { recursive: true });
        fs.writeFileSync(file.path, applyForkIdentity(file.text));
      }
    });
  },
};

const options = {
  entryPoints: ['src/floor3dpro-card.ts'],
  outfile: 'dist/floor3dx-card.js',
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: !watch,
  legalComments: 'none',
  write: false, // the identity plugin writes the processed text
  logLevel: 'info',
  plugins: [stubPlugin, identityPlugin],
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching src/ ...');
} else {
  await build(options);
}
