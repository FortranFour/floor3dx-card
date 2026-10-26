"""Light through walls: the house (dev/private) with its real lamp configuration, every lamp on, at night,
with the card's shadow option off and on (and every lamp asking for a shadow), for comparison.

    CARD=path/to/card.yaml python3 dev/harness/render_leak.py <out-dir>
(the YAML is a rooms card or a floor3dx card; the first floor3dx card configuration in it is used)"""
import json, os, sys, yaml
from run import run

OUT = sys.argv[1] if len(sys.argv) > 1 else 'dev/out/leak'
os.makedirs(OUT, exist_ok=True)
src = yaml.safe_load(open(os.environ['CARD']))
def find(v):
    if isinstance(v, dict):
        if 'objfile' in v and 'entities' in v: return v
        for x in v.values():
            r = find(x)
            if r: return r
    if isinstance(v, list):
        for x in v:
            r = find(x)
            if r: return r
card = find(src)
VARIANTS = json.loads(os.environ.get('VARIANTS', '{"off": {"shadow": "no"}, "on": {"shadow": "yes"}, "all": {"shadow": "yes", "all_lamps": true, "shadow_budget": 64}}'))
W, H = [int(x) for x in os.environ.get('SIZE', '1600x1120').split('x')]

JS = r"""async ([card, extra, w, h]) => {
  const cfg = JSON.parse(JSON.stringify(card)); cfg.type = 'custom:floor3dx-card'; cfg.path = '/dev/private/';
  delete cfg.style; delete cfg.card_mod;
  Object.assign(cfg, extra);
  if (extra.all_lamps) cfg.entities.forEach(e => { if (e.type3d === 'light') { e.light = Object.assign({}, e.light || {}, {shadow: 'yes'}); } });
  delete cfg.all_lamps;
  cfg.daylight = Object.assign({}, cfg.daylight || {}, {time: 23});
  if (extra.camera) { cfg.camera_position = extra.camera.position; cfg.camera_target = extra.camera.target; delete cfg.camera; }
  const states = {};
  cfg.entities.forEach(e => { if (e.entity && !states[e.entity]) states[e.entity] = e.type3d === 'light' ? {state: 'on', attributes: {brightness: 255}} : {state: '0', attributes: {}}; });
  const c = document.createElement('floor3dx-card'); c.setConfig(cfg); c.hass = {states, language: 'en', themes: {}, config: {}, user: {}, callService() {}};
  const host = document.createElement('div'); host.id = 'shot'; host.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;z-index:99;background:#000`; document.body.appendChild(host); host.appendChild(c);
  const t0 = performance.now(); while (!c._modelready && performance.now() - t0 < 300000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 2500)); c._render(); await new Promise(r => setTimeout(r, 500)); c._render();
  window.shot = host; return {ready: c._modelready, casters: c._shadowCandidates.filter(x => x.light.castShadow).length, budget: c._shadowBudget};
}"""

def after(page):
    for name, extra in VARIANTS.items():
        r = page.evaluate(JS, [card, extra, W, H])
        page.wait_for_timeout(500)
        page.screenshot(path=f'{OUT}/{name}.png', clip={'x': 0, 'y': 0, 'width': W, 'height': H}, timeout=180000)
        page.evaluate('() => { window.shot.remove(); }')
        print(name, r, flush=True)

result, errors = run(query=f'path=/dev/private/&model={card["objfile"]}&', after=after, timeout_ms=600000)
for e in errors[:8]:
    print('  error:', e[:300])
