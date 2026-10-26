"""daylight.sun: a directional sun with a shadow map, shadows enabled without `shadow: yes`, every caster
shadowing from both sides (ceilings as the roof), glass glowing after dark with `glow: auto`, a fixed
`time`. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async ([hour]) => {
  const base = window.card;
  const cfg = Object.assign({}, base._config, {type: 'custom:floor3dx-card', shadow: undefined, entities: [], object_groups: [], merge_static: 'yes',
    daylight: {sun: 'yes', glow: 'auto', time: hour, ambient: {day: 0.6, night: 0.2}}, north: {x: 0, z: -1}});
  delete cfg.style; delete cfg.shadow; delete cfg.look;
  const c = document.createElement('floor3dx-card'); c.setConfig(JSON.parse(JSON.stringify(cfg)));
  c.hass = {states: {}, language: 'en', themes: {}, config: {}, user: {}, callService() {}};
  const h = document.createElement('div'); h.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:560px;z-index:99'; document.body.appendChild(h); h.appendChild(c);
  const t0 = performance.now(); while (!c._modelready && performance.now() - t0 < 240000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 800)); c._render();
  const out = {hour, shadowEnabled: c._renderer.shadowMap.enabled, sun: null, casters: 0, doubleSided: 0, glass: 0, glowing: 0};
  c._scene.traverse(o => {
    if (o.isDirectionalLight && o.castShadow) out.sun = {intensity: o.intensity, y: o.position.y, map: o.shadow.mapSize.x};
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (o.castShadow) { out.casters++; if (mats.every(m => m && m.shadowSide === 2)) out.doubleSided++; }
    if (mats.some(m => m && m.transparent && m.opacity > 0.02 && m.opacity < 0.95)) { out.glass++; if (mats.some(m => m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05)) out.glowing++; }
  });
  h.remove();
  return out;
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        for hour in (12, 23):
            results[hour] = page.evaluate(JS, [hour])
    result, errors = run(after=after, timeout_ms=600000)
    print(json.dumps(results))
    noon, night = results.get(12, {}), results.get(23, {})
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    check('shadows are on without shadow: yes, and the meshes cast', noon.get('shadowEnabled') and noon.get('casters', 0) > 0)
    check('a directional sun with a shadow map, above the model at noon', bool(noon.get('sun')) and noon['sun']['y'] > 0 and noon['sun']['map'] >= 1024 and noon['sun']['intensity'] > 0)
    check('every caster shadows from both sides (ceilings as the roof)', noon.get('casters') == noon.get('doubleSided'))
    check('the sun is off at night', bool(night.get('sun')) and night['sun']['intensity'] == 0)
    check('glass glows after dark with glow: auto, not at noon', night.get('glass', 0) > 0 and night.get('glowing') == night.get('glass') and noon.get('glowing') == 0)
    check('no page errors', not errors)
    for e in errors[:5]:
        print('  error:', e[:300])
    sys.exit(1 if fails else 0)
