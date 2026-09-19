/* Builds dist-sidebyside/floor3dx-card.js: the same card under different custom-element
 * names, so it can be loaded alongside an unmodified floor3dpro-card for A/B comparison.
 * Usage: node scripts/make-sidebyside.js [prefix]   (default prefix: floor3dx) */
const fs = require('fs');
const path = require('path');

const prefix = process.argv[2] || 'floor3dx';
if (!/^[a-z][a-z0-9]*$/.test(prefix)) throw new Error('prefix must be lowercase letters/digits');

const dist = path.join(__dirname, '..', 'dist');
const out = path.join(__dirname, '..', 'dist-sidebyside');
const tags = ['card-editor', 'card', 'button', 'formfield', 'select', 'textfield'];
const pattern = new RegExp(`floor3dpro-(${tags.join('|')})(?![a-z-])`, 'g');

let code = fs.readFileSync(path.join(dist, 'floor3dpro-card.js'), 'utf8');
let count = 0;
code = code.replace(pattern, (_m, tag) => {
  count++;
  return `${prefix}-${tag}`;
});
// distinguish the two entries in the dashboard card picker
code = code.replace(/name:\s*(["'])Floor3D Pro Card\1/, `name:"Floor3D Pro Card (${prefix})"`);

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, `${prefix}-card.js`), code);
['draco', 'basis'].forEach((dir) => {
  fs.mkdirSync(path.join(out, dir), { recursive: true });
  fs.readdirSync(path.join(dist, dir)).forEach((f) => fs.copyFileSync(path.join(dist, dir, f), path.join(out, dir, f)));
});
console.log(`dist-sidebyside/${prefix}-card.js (${count} tag references renamed)`);
