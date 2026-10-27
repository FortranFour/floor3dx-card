"""The card editor's preview: Home Assistant caps the preview at 390/500 px (hui-card in a masonry view,
hui-section for a card of a sections view). The card lifts the cap on whichever host it finds, and in a
section spans every column, so the model fills the preview pane. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const cfg = Object.assign({}, base._config, {entities: [], object_groups: []}); delete cfg.style; delete cfg.look; delete cfg.daylight;
  const hass = base.hass || base._hass || {states: {}, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const pane = document.createElement('div'); pane.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px;z-index:99;background:#eee';
  document.body.appendChild(pane);
  const out = {};
  // masonry: <hui-card preview> capped at 500px
  const hc = document.createElement('hui-card'); hc.setAttribute('preview', ''); hc.style.cssText = 'display:block;max-width:500px;margin:auto 0';
  pane.appendChild(hc);
  let el = document.createElement('floor3dx-card'); el.preview = true; el.setConfig(cfg); el.hass = hass; hc.appendChild(el); await sleep(600);
  out.masonryHostMax = hc.style.maxWidth; out.masonryWidth = el.getBoundingClientRect().width;
  hc.remove();
  // sections: <hui-section preview> capped at 500px, a 12-column grid, the card a grid item spanning 3
  const hs = document.createElement('hui-section'); hs.setAttribute('preview', ''); hs.style.cssText = 'display:block;max-width:500px;margin:auto 0';
  const sh = hs.attachShadow({mode: 'open'});
  const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(12,1fr);column-gap:8px';
  const item = document.createElement('div'); item.className = 'card'; item.style.gridColumn = 'span 3';
  const hc2 = document.createElement('hui-card'); // no attribute, as in HA's section preview
  sh.appendChild(grid); grid.appendChild(item); item.appendChild(hc2); pane.appendChild(hs);
  el = document.createElement('floor3dx-card'); el.preview = true; el.setConfig(cfg); el.hass = hass; hc2.appendChild(el); await sleep(600);
  out.sectionHostMax = hs.style.maxWidth; out.sectionItemColumn = item.style.gridColumn; out.sectionWidth = el.getBoundingClientRect().width;
  out.sectionCanvas = el._renderer ? el._renderer.domElement.getBoundingClientRect().width : 0;
  hs.remove(); pane.remove();
  return out;
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        results.update(page.evaluate(JS))
    result, errors = run(after=after, timeout_ms=400000)
    print(json.dumps(results))
    r = results; fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    check('masonry preview: the hui-card cap is lifted and the card fills the pane', r.get('masonryHostMax') == 'none' and r.get('masonryWidth', 0) > 850)
    check('sections preview: the hui-section cap is lifted, the card spans every column, fills the pane', r.get('sectionHostMax') == 'none' and r.get('sectionItemColumn') == '1 / -1' and r.get('sectionWidth', 0) > 850 and r.get('sectionCanvas', 0) > 850)
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
