"""Taps on phones. The card runs the default action from `touchstart`, reading offsetX/offsetY, which
a TouchEvent does not have. A ray cast from NaN hit nothing in three.js r130 and every triangle of
every object in r186, so from 2.0 every tap anywhere on a card on iOS ran the default action of
whatever object came first: the garage's camera popup opened on any tap. A touchstart must do
nothing, as in 1.x; a double-click (what iOS synthesises from a double tap) on the object must still
open the camera's more-info; a double-click on a wall must not."""
import json
from run import run

JS = r"""async () => {
  const base = window.card;
  // what getLovelace() of custom-card-helpers walks to (the default action reads its editMode): the
  // harness skeleton has ha-panel-lovelace > hui-root without a shadow root; give it one
  { const panel = document.querySelector('home-assistant').shadowRoot.querySelector('home-assistant-main').shadowRoot.querySelector('ha-panel-lovelace');
    const root = panel.querySelector('hui-root'); if (!panel.shadowRoot) { panel.attachShadow({mode: 'open'}); panel.shadowRoot.appendChild(root); }
    root.lovelace = {editMode: false}; }
  const names = []; base._scene.traverse(o => { if (o.isMesh && o.name) names.push(o.name); });
  // the target: the object under the middle of the screen in the base card (same camera)
  const mid = base._getintersect({offsetX: base._content.clientWidth / 2, offsetY: base._content.clientHeight / 2});
  const target = mid.length ? mid[0].object.name : names[0];
  const cfg = Object.assign({}, base._config, {type: 'custom:floor3dx-card', shadow: 'no',
    entities: [{entity: 'camera.garage', type3d: 'camera', object_id: target}]});
  delete cfg.style;
  const c = document.createElement('floor3dx-card'); c.setConfig(JSON.parse(JSON.stringify(cfg)));
  c.hass = {states: {'camera.garage': {state: 'idle', attributes: {}}}, language: 'en', themes: {}, config: {}, user: {}, callService() {}};
  const h = document.createElement('div'); h.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px;z-index:99'; document.body.appendChild(h); h.appendChild(c);
  const t0 = performance.now(); while (!c._modelready && performance.now() - t0 < 240000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 300));
  const popups = []; c.addEventListener('hass-more-info', e => popups.push(e.detail.entityId));
  const content = c._content;
  // 1. a touch anywhere (no offsetX on a TouchEvent): what does the ray cast hit, and does anything open?
  const nanHits = c._getintersect({}).length;
  content.dispatchEvent(new Event('touchstart', {bubbles: true}));
  await new Promise(r => setTimeout(r, 50));
  const afterTouch = popups.length;
  // 2. a double-click on the target (the middle of the screen)
  const rect = content.getBoundingClientRect();
  const x = rect.width / 2, y = rect.height / 2;
  const dbl = (px, py) => { const ev = new MouseEvent('dblclick', {bubbles: true, clientX: rect.left + px, clientY: rect.top + py});
    Object.defineProperty(ev, 'offsetX', {value: px}); Object.defineProperty(ev, 'offsetY', {value: py}); content.dispatchEvent(ev); };
  const hitAt = (px, py) => { const i = c._getintersect({offsetX: px, offsetY: py}); return i.length ? i[0].object.name : ''; };
  const hitTarget = hitAt(x, y);
  dbl(x, y);
  await new Promise(r => setTimeout(r, 50));
  const afterDbl = popups.length;
  // 3. a double-click on something that is not the target (search the screen for one)
  let wx = -1, wy = -1;
  for (let py = 20; py < rect.height && wx < 0; py += 40) for (let px = 20; px < rect.width; px += 40) { const n = hitAt(px, py); if (n && n !== target) { wx = px; wy = py; break; } }
  if (wx >= 0) dbl(wx, wy);
  await new Promise(r => setTimeout(r, 50));
  return {target, hitTarget, nanHits, afterTouch, afterDbl, afterOther: popups.length, otherFound: wx >= 0, popups};
}"""

if __name__ == '__main__':
    result, errors = run(after=lambda page: page.evaluate(JS), timeout_ms=300000)
    print(json.dumps(result)); print(errors[:3])
    r = result
    ok = True
    def check(name, cond):
        global ok
        print(('PASS ' if cond else 'FAIL ') + name)
        ok = ok and cond
    check('the target is under the test point', r['hitTarget'] == r['target'])
    check('a ray cast without coordinates hits nothing (r186 hit everything)', r['nanHits'] == 0)
    check('a touchstart opens nothing', r['afterTouch'] == 0)
    check('a double-click on the camera object opens its more-info', r['afterDbl'] == 1 and r['popups'][0] == 'camera.garage')
    check('a double-click elsewhere opens nothing', not r['otherFound'] or r['afterOther'] == 1)
    check('no page errors', not errors)
    raise SystemExit(0 if ok else 1)
