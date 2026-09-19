/*
 * floor3dx-card keeps its source as close as possible to upstream floor3dpro-card so upstream
 * changes stay easy to merge. The things that make it a separate card are applied here, at build
 * time:
 *   - custom element names: floor3dpro-*  ->  floor3dx-*  (lets both cards live on one dashboard)
 *   - the build id shown in the browser console
 */
const TAGS = ['card-editor', 'card', 'button', 'formfield', 'select', 'textfield'];
// Only real element references are renamed: markup (<tag, </tag), quoted selectors and type strings,
// CSS selectors (leading whitespace) and the HACS install folder. Prose such as
// "(floor3dpro-card fork)" and links to the upstream repository are left alone.
const TAG_PATTERN = new RegExp(
  `(?<=<\\/?|["'\`\\s]|\\/local\\/community\\/)floor3dpro-(${TAGS.join('|')})(?![a-z-])`,
  'g',
);

// UTC build time, to the minute. Deliberately not a git hash: dist/ is committed, and a hash taken
// before the commit that contains the build would name the wrong commit.
function buildId() {
  return new Date().toISOString().slice(0, 16) + 'Z';
}

export default function forkIdentity(prefix = 'floor3dx') {
  const id = buildId();
  return {
    name: 'fork-identity',
    renderChunk(code) {
      const out = code
        .replace(TAG_PATTERN, (_m, tag) => `${prefix}-${tag}`)
        .replace(/__FLOOR3DX_BUILD__/g, id);
      return { code: out, map: null };
    },
  };
}
