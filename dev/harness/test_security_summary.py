"""The panel's subtitle summarises a room's doors, locks and windows: "Doors shut & locked · Windows closed",
or the open and unlocked ones by name, and open windows by the compass side on which their object stands
in the model (from the 3D card's rows bound to them and the card's north). Runs on the demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  // the floor of the test room and an object clearly to one side of it, for the window
  const floor = base._scene.getObjectByName('room_0_1');
  const B = new (Object.getPrototypeOf(floor.geometry.boundingBox || (floor.geometry.computeBoundingBox(), floor.geometry.boundingBox)).constructor)(); B.setFromObject(floor); const c = B.getCenter(floor.position.clone());
  let best = null; base._scene.traverse(o => { if (!o.isMesh || !o.name || !o.name.startsWith('wall')) return; const bb = new (Object.getPrototypeOf(B).constructor)(); bb.setFromObject(o); const p = bb.getCenter(c.clone()); const dx = p.x - c.x, dz = p.z - c.z; const dist = Math.hypot(dx, dz); if (dist > 200 && dist < 1500 && Math.abs(dx) > 3 * Math.abs(dz) && (!best || dist < best.dist)) best = {name: o.name, dx, dz, dist}; });
  if (!best) return {error: 'no wall'};
  const expected = best.dx > 0 ? 'east' : 'west'; // north is -z, so +x is east
  const card = Object.assign({}, base._config, {object_groups: [], north: {x: 0, z: -1}, entities: [{entity: 'binary_sensor.win', type3d: 'color', object_id: best.name, colorcondition: [{state: 'on', color: 'red'}]}]}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const mk = (win, back, lock) => ({states: {'binary_sensor.win': {state: win, attributes: {device_class: 'window', friendly_name: 'Window'}}, 'binary_sensor.back': {state: back, attributes: {device_class: 'door', friendly_name: 'Back Door'}}, 'lock.side': {state: lock, attributes: {friendly_name: 'Side Door'}}, 'light.a': {state: 'off', attributes: {friendly_name: 'Lamp'}}}, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }});
  const el = document.createElement('floor3dx-rooms-card');
  el.setConfig({card, rooms: [{id: 'r', name: 'Den', floors: ['room_0_1'], entities: [{entity: 'light.a'}, {entity: 'binary_sensor.back', name: 'Back door'}, {entity: 'lock.side', name: 'Side door'}, {entity: 'binary_sensor.win', summary_only: true}]}], title: 'Sec', height: '560px'}); el.hass = mk('off', 'off', 'locked');
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:560px;z-index:99'; document.body.appendChild(d); d.appendChild(el);
  const t = performance.now(); while (!(el._slots.length && el._slots.every(s => s.el && s.el._modelready)) && performance.now() - t < 240000) await sleep(200);
  await sleep(500); el._select('r'); await sleep(300); el._render();
  const sub = () => (el._ui.querySelector('.panelhead p') || {}).textContent;
  const out = {expected, secure: sub()};
  el.hass = mk('on', 'on', 'unlocked'); await sleep(200); el._render(); out.breached = sub();
  el.hass = mk('on', 'off', 'locked'); await sleep(200); el._render(); out.windowOnly = sub();
  out.readouts = Array.from(el._ui.querySelectorAll('.readouts span')).map(x => x.textContent.trim());
  d.remove();
  return out;
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        results.update(page.evaluate(JS))
    result, errors = run(after=after, timeout_ms=400000)
    print(json.dumps(results))
    r = results
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    check('all secure: "Everything is off · Doors shut & locked · Windows closed"', r.get('secure') == 'Everything is off · Doors shut & locked · Windows closed')
    check('open and unlocked named', r.get('breached', '').startswith('Everything is off · Back door open, Side door unlocked · '))
    check('an open window named by its side of the room', r.get('windowOnly') == f"Everything is off · Doors shut & locked · {r.get('expected').capitalize()} window open")
    check('summary_only keeps the window out of the readouts', r.get('readouts') == ['Back Door closed', 'Side Door locked'] or r.get('readouts') == ['Back door closed'])
    check('no page errors', not errors)
    for e in errors[:5]:
        print('  error:', e[:300])
    sys.exit(1 if fails else 0)
