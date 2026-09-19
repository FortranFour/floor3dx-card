/* Copies the Draco and Basis decoders that match the bundled three.js into dist/,
 * so the card can load compressed models without any CDN access. */
const fs = require('fs');
const path = require('path');

const libs = path.join(path.dirname(require.resolve('three/package.json')), 'examples', 'js', 'libs');
const dist = path.join(__dirname, '..', 'dist');

const sets = {
  draco: [path.join(libs, 'draco', 'gltf'), ['draco_wasm_wrapper.js', 'draco_decoder.wasm', 'draco_decoder.js']],
  basis: [path.join(libs, 'basis'), ['basis_transcoder.js', 'basis_transcoder.wasm']],
};

Object.keys(sets).forEach((name) => {
  const [from, files] = sets[name];
  const to = path.join(dist, name);
  fs.mkdirSync(to, { recursive: true });
  files.forEach((file) => {
    fs.copyFileSync(path.join(from, file), path.join(to, file));
    console.log(`dist/${name}/${file}`);
  });
});
