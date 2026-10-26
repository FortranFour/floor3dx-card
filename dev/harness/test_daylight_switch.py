"""floor3dx-rooms-card: the day & night switch. A compass button appears when a model has daylight, its
needle turns with the camera to where north is on screen, the badge says day or night, switching off
makes a steady neutral day (ambient at the day level, no sun), the choice is remembered in this browser,
and a card without daylight shows no button; off, the compass is only dimmed. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async ([withDaylight]) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: [], north: {x: -1, z: 0}}); delete card.style; delete card.type; delete card.look;
  if (withDaylight) card.daylight = {sun: 'yes', time: 23, ambient: {day: 0.6, night: 0.2}}; else delete card.daylight;
  try { localStorage.removeItem('floor3dx-rooms:daylight:Switch test:' + card.objfile); } catch (_) {}
  const hass = {states: {}, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const make = async () => {
    const el = document.createElement('floor3dx-rooms-card');
    el.setConfig({card, rooms: [], title: 'Switch test', height: '560px'}); el.hass = hass;
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:560px;z-index:99'; document.body.appendChild(d); d.appendChild(el);
    const t = performance.now(); while (!(el._slots.length && el._slots.every(s => s.el && s.el._modelready)) && performance.now() - t < 240000) await sleep(200);
    await sleep(700); el._render(); return {el, d};
  };
  const out = {withDaylight};
  let {el, d} = await make();
  const btn = () => el._ui.querySelector('.dl');
  out.button = !!btn();
  if (!withDaylight) { d.remove(); return out; }
  out.pressed = btn().getAttribute('aria-pressed');
  out.badgeNight = !!el._ui.querySelector('.dl .badge.night');
  const emb = el._embedded;
  const ambient = () => emb._ambient_light.intensity;
  const sun = () => { let s = null; emb._scene.traverse(o => { if (o.isDirectionalLight && o.castShadow) s = o.intensity; }); return s; };
  out.nightAmbient = ambient();
  // the needle turns with the camera
  const angle = () => { const m = /rotate\(([-\d.]+)deg\)/.exec(el._ui.querySelector('.dl .needle').style.transform || ''); return m ? Number(m[1]) : null; };
  out.angle1 = angle();
  emb._camera.position.applyAxisAngle(new emb._camera.position.constructor(0, 1, 0), Math.PI / 2); emb._controls.update(); emb._controls.dispatchEvent({type: 'change'});
  await sleep(100); out.angle2 = angle();
  // off: a steady neutral day
  btn().click(); await sleep(300); el._render();
  out.pressedOff = btn().getAttribute('aria-pressed');
  out.dayAmbient = ambient(); out.sunOff = sun(); out.dimmed = Number(getComputedStyle(btn().querySelector('svg')).opacity);
  out.stored = (() => { try { return localStorage.getItem('floor3dx-rooms:daylight:Switch test:' + card.objfile); } catch (_) { return null; } })();
  d.remove();
  // a new card of the same configuration remembers the choice
  ({el, d} = await make());
  out.rememberedPressed = btn().getAttribute('aria-pressed'); out.rememberedAmbient = el._embedded._ambient_light.intensity;
  btn().click(); await sleep(300); el._render(); out.backOn = btn().getAttribute('aria-pressed'); out.backAmbient = el._embedded._ambient_light.intensity;
  d.remove();
  return out;
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        results['with'] = page.evaluate(JS, [True])
        results['without'] = page.evaluate(JS, [False])
    result, errors = run(after=after, timeout_ms=600000)
    print(json.dumps(results))
    w, wo = results.get('with', {}), results.get('without', {})
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    check('the switch shows for a model with daylight, not without', w.get('button') is True and wo.get('button') is False)
    check('on by default, the badge says night at 23:00', w.get('pressed') == 'true' and w.get('badgeNight') is True)
    check('the needle turns when the camera orbits', w.get('angle1') is not None and w.get('angle2') is not None and abs(w['angle2'] - w['angle1']) > 30)
    check('off: ambient at the day level, the sun out, the compass dimmed', w.get('pressedOff') == 'false' and w.get('dayAmbient', 0) > w.get('nightAmbient', 1) * 1.5 and w.get('sunOff') == 0 and w.get('dimmed', 1) < 0.5)
    check('the choice is remembered and reversible', w.get('stored') == 'off' and w.get('rememberedPressed') == 'false' and w.get('backOn') == 'true' and w.get('backAmbient', 1) < w.get('rememberedAmbient', 0))
    check('no page errors', not errors)
    for e in errors[:5]:
        print('  error:', e[:300])
    sys.exit(1 if fails else 0)
