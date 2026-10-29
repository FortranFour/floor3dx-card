"""A touch tap on the model that opens a room's panel must not also press the panel's first tile: iOS fires
the compatibility click after the touch, when the panel is already on screen under the finger. The card
cancels the compatibility events of a handled tap and ignores a panel click that follows a tap at once.
Runs on the demo house with a fake hass that records service calls."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const calls = [];
  const hass = {states: {'light.a': {state: 'off', attributes: {friendly_name: 'Bare bulbs'}}}, language: 'en', themes: {}, config: {}, user: {}, callService(d, s, data) { calls.push([d, s, data]); return Promise.resolve(); }};
  const el = document.createElement('floor3dx-rooms-card');
  el.setConfig({card, rooms: [{id: 'a', name: 'Room A', floors: ['room_0_1'], entities: [{entity: 'light.a'}]}], title: 'T', height: '600px'});
  el.hass = hass;
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px;z-index:99'; document.body.appendChild(d); d.appendChild(el);
  await new Promise(r => { const t = setInterval(() => { if (el._slots[0]?.el?._modelready) { clearInterval(t); r(); } }, 100); }); await sleep(800);
  // where is the room's floor on screen? project its centre
  const slot = el._slots[0], c = slot.el; const floor = c._scene.getObjectByName('room_0_1');
  const THREE_Box = floor.geometry.boundingBox || (floor.geometry.computeBoundingBox(), floor.geometry.boundingBox);
  const centre = THREE_Box.getCenter(c._camera.position.clone()).applyMatrix4(floor.matrixWorld);
  const p = centre.clone().project(c._camera); const rect = c._renderer.domElement.getBoundingClientRect();
  const x = rect.left + (p.x + 1) / 2 * rect.width, y = rect.top + (1 - p.y) / 2 * rect.height;
  const host = slot.host;
  const out = {x: Math.round(x), y: Math.round(y)};
  // a touch tap: pointerdown/up (touch), touchend, then — as iOS does ~50 ms later — the compatibility click on whatever is under the finger
  host.dispatchEvent(new PointerEvent('pointerdown', {clientX: x, clientY: y, pointerType: 'touch', bubbles: true}));
  host.dispatchEvent(new PointerEvent('pointerup', {clientX: x, clientY: y, pointerType: 'touch', bubbles: true}));
  const te = new Event('touchend', {bubbles: true, cancelable: true}); host.dispatchEvent(te); out.touchendCancelled = te.defaultPrevented;
  // the compatibility click follows the touch at once (iOS: within the same input sequence); the
  // panel is already rendered synchronously by the tap, so the click lands on its first tile
  await new Promise(r => requestAnimationFrame(r)); await new Promise(r => requestAnimationFrame(r)); out.room = el._room; out.sinceTap = Date.now() - el._tappedAt;
  const tile = el.shadowRoot.querySelector('.tile button[data-action="toggle"]'); out.tile = tile ? tile.dataset.action : null;
  // headless frames take ~1 s here where a phone takes 16 ms: stand at the moment the panel appeared
  el._tappedAt = Date.now();
  if (tile) tile.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}));
  await sleep(50); out.callsAfterTap = calls.length;
  // a genuine press on the same tile half a second later works
  await sleep(1200); if (tile) tile.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true})); await sleep(50); out.callsAfterRealClick = calls.length;
  d.remove();
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
    check('the tap opens the room', r.get('room') == 'a')
    check('the touchend of a handled tap is cancelled (no compatibility mouse events)', r.get('touchendCancelled') is True)
    check('a click arriving right after the tap does not press a tile', r.get('tile') is not None and r.get('callsAfterTap') == 0)
    check('a real press a moment later works', r.get('callsAfterRealClick') == 1)
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
