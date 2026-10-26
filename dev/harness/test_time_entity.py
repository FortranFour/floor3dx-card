"""daylight.time_entity (the scheduler's preview clock): the scene follows a numeric-hour entity as hass
changes, with and without `sun: yes`. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async ([sunOn]) => {
  const base = window.card;
  const daylight = {time_entity: 'input_number.hs_demo_hour', sun_entity: 'sun.hs_demo_sun', ambient: {day: 0.7, night: 0.16}, hemisphere: 'yes', background: {day: '#dce6ee', dusk: '#a1aabf', night: '#1b293c'}};
  if (sunOn) daylight.sun = 'yes';
  const cfg = Object.assign({}, base._config, {type: 'custom:floor3dx-card', entities: [], object_groups: [], merge_static: 'no', daylight, north: {x: 0, z: -1}});
  delete cfg.style; delete cfg.shadow; delete cfg.look;
  const c = document.createElement('floor3dx-card'); c.setConfig(JSON.parse(JSON.stringify(cfg)));
  const hassAt = (hour) => ({states: {'input_number.hs_demo_hour': {entity_id: 'input_number.hs_demo_hour', state: String(hour), attributes: {}}}, language: 'en', themes: {}, config: {}, user: {}, callService() {}});
  c.hass = hassAt(12);
  const h = document.createElement('div'); h.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:560px;z-index:99'; document.body.appendChild(h); h.appendChild(c);
  const t0 = performance.now(); while (!c._modelready && performance.now() - t0 < 240000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 800)); c._render();
  const probe = () => { let amb = null, sun = null; c._scene.traverse(o => { if (o.isHemisphereLight || (o.isAmbientLight)) amb = (amb ?? 0) + o.intensity; if (o.isDirectionalLight && o.castShadow) sun = o.intensity; }); return {amb, sun, bg: c._scene.background && c._scene.background.getHexString ? c._scene.background.getHexString() : String(c._scene.background)}; };
  const noon = probe();
  c.hass = hassAt(23); await new Promise(r => setTimeout(r, 300)); c._render();
  const night = probe();
  c.hass = hassAt(9); await new Promise(r => setTimeout(r, 300)); c._render();
  const morning = probe();
  h.remove();
  return {noon, night, morning};
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        for sun in (False, True):
            results[sun] = page.evaluate(JS, [sun])
    result, errors = run(after=after, timeout_ms=600000)
    print(json.dumps({str(k): v for k, v in results.items()}))
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    for sun in (False, True):
        r = results.get(sun, {})
        tag = ' (sun: yes)' if sun else ''
        check('night is darker than noon' + tag, r and r['night']['amb'] is not None and r['night']['amb'] < r['noon']['amb'])
        check('the background follows the hour' + tag, r and r['night']['bg'] != r['noon']['bg'])
        check('morning returns light' + tag, r and r['morning']['amb'] > r['night']['amb'])
    check('no page errors', not errors)
    for e in errors[:5]:
        print('  error:', e[:300])
    sys.exit(1 if fails else 0)
