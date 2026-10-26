"""light_rooms: lamps stay in their room. On the demo house a lamp is placed in one room; the floor of
another room, on the far side of a wall, is lit by it without the option and not with it, while its own
room's floor keeps its light; the room map answers roomAt(); touching floors are joined; without floors
the option is off with a warning."""
import json, sys
from run import run

JS = r"""async ([on, pairNames]) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const floors = []; base._scene.traverse(o => { if (o.isMesh && /^room_\d+_1$/.test(o.name)) floors.push(o); });
  const centre = (o) => { o.updateWorldMatrix(true, false); const bb = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox); return bb.getCenter(bb.min.clone()).applyMatrix4(o.matrixWorld); };
  // a lamp: the floor of room A is lit from 120 units above its centre, with a reach that crosses into room B
  const cs = floors.map(centre);
  const make = async (lampOn, lightRooms) => {
    const cfg = Object.assign({}, base._config, {type: 'custom:floor3dx-card', shadow: 'no', object_groups: [], entities: lampOn ? [
      {entity: 'light.x', type3d: 'light', object_id: lampOn, light: {lumens: 2500, distance: 1500, decay: 0.5, vertical_alignment: 'top', color: '#ffffff'}}] : []});
    if (lightRooms) cfg.light_rooms = 'yes'; else delete cfg.light_rooms;
    delete cfg.style; delete cfg.look; delete cfg.daylight;
    const c = document.createElement('floor3dx-card'); c.setConfig(JSON.parse(JSON.stringify(cfg)));
    c.hass = {states: {'light.x': {state: 'on', attributes: {brightness: 255}}}, language: 'en', themes: {}, config: {}, user: {}, callService() {}};
    const h = document.createElement('div'); h.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:560px;z-index:99'; document.body.appendChild(h); h.appendChild(c);
    const t0 = performance.now(); while (!c._modelready && performance.now() - t0 < 240000) await new Promise(r => setTimeout(r, 200));
    await sleep(800); return {c, h};
  };
  // the pair of rooms: two floors the map tells apart (the demo's floors overlap and nest), nearest first
  let best = null;
  if (pairNames) { best = {i: floors.findIndex(f => f.name === pairNames[0]), j: floors.findIndex(f => f.name === pairNames[1])}; }
  else {
    const probe = await make(null, true); const rl = probe.c._roomLight;
    const ids = cs.map(p => rl.roomAt(p.x, p.y, p.z));
    for (let i = 0; i < floors.length; i++) for (let j = 0; j < floors.length; j++) { if (i === j || !ids[i] || !ids[j] || ids[i] === ids[j]) continue; const d = cs[i].distanceTo(cs[j]); if (d > 150 && d < 700 && Math.abs(cs[i].y - cs[j].y) < 50 && (!best || d < best.d)) best = {i, j, d}; }
    probe.h.remove();
    if (!best) return {error: 'no room pair'};
  }
  const A = floors[best.i], B = floors[best.j];
  const {c, h} = await make(A.name, true);
  const rl = c._roomLight;
  // the lamp sits on the floor (vertical_alignment top of a flat floor is the floor itself): lift it
  let lamp = null; c._scene.traverse(o => { if (o.isPointLight || o.isSpotLight) lamp = o; });
  if (lamp) { const p = cs[best.i].clone(); p.y += 120; lamp.parent.worldToLocal(p); lamp.position.copy(p); }
  const mid = cs[best.i].clone().lerp(cs[best.j], 0.5);
  c._camera.position.set(mid.x, mid.y + 1400, mid.z + 1); c._controls.target.copy(mid); c._controls.update();
  const render = async (mask) => { if (!mask) c._roomLight = null; else c._roomLight = rl; c._render(); await sleep(150); c._render(); };
  const gl = c._renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, buf = new Uint8Array(W * H * 4);
  // the picture as a whole: with the mask the lamp's light leaves the other rooms, so fewer pixels
  // are bright, while the brightest (under the lamp, in its own room) stay as they were
  const stats = () => { gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf); let bright = 0, sum = 0, max = 0; for (let i = 0; i < buf.length; i += 4) { const l = (buf[i] + buf[i + 1] + buf[i + 2]) / 3; sum += l; if (l > max) max = l; if (l > 150) bright++; } return {bright, mean: sum / (W * H), max}; };
  await render(false); const off = stats();
  await render(true); const onS = stats();
  const idA = rl.roomAt(cs[best.i].x, cs[best.i].y, cs[best.i].z), idB = rl.roomAt(cs[best.j].x, cs[best.j].y, cs[best.j].z);
  const out = {on, pair: [A.name, B.name], off, onS, rooms: {active: rl.active, floors: rl.rooms, joined: rl.joined, idA, idB, outside: rl.roomAt(1e5, 0, 1e5)}};
  h.remove();
  return out;
}"""

NOFLOORS = r"""async () => {
  const base = window.card;
  const cfg = Object.assign({}, base._config, {type: 'custom:floor3dx-card', shadow: 'no', object_groups: [], entities: [], light_rooms: {floors: 'no_such_floor_*'}});
  delete cfg.style;
  const warned = []; const orig = console.warn; console.warn = (...a) => { warned.push(a.join(' ')); orig(...a); };
  const c = document.createElement('floor3dx-card'); c.setConfig(JSON.parse(JSON.stringify(cfg)));
  c.hass = {states: {}, language: 'en', themes: {}, config: {}, user: {}, callService() {}};
  const h = document.createElement('div'); h.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;z-index:99'; document.body.appendChild(h); h.appendChild(c);
  const t0 = performance.now(); while (!c._modelready && performance.now() - t0 < 240000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 500)); c._render();
  console.warn = orig; h.remove();
  return {roomLight: !!c._roomLight, warned: warned.some(w => /light_rooms found no floors/.test(w))};
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        results['on'] = page.evaluate(JS, [True, None])
        results['nofloors'] = page.evaluate(NOFLOORS)
    result, errors = run(after=after, timeout_ms=600000)
    print(json.dumps(results))
    on, nf = results.get('on', {}), results.get('nofloors', {})
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    r = on.get('rooms') or {}
    check('the room map is built from the floors and answers roomAt', r.get('active') and r.get('floors', 0) >= 2 and r.get('idA', 0) > 0 and r.get('idB', 0) > 0 and r.get('idA') != r.get('idB') and r.get('outside') == 0)
    off, onS = on.get('off') or {}, on.get('onS') or {}
    check('the lamp lights the picture without the option', off.get('bright', 0) > 2000)
    check('with light_rooms its light leaves the other rooms: fewer bright pixels, a darker picture', 0 < onS.get('bright', 0) < off.get('bright', 0) * 0.8 and onS.get('mean', 1e9) < off.get('mean', 0))
    check("the lamp's own room keeps its light: the brightest pixels are as bright", onS.get('max', 0) >= off.get('max', 1) * 0.9)
    check('no floors: the option is off with a warning', nf.get('roomLight') is False and nf.get('warned') is True)
    check('no page errors', not errors)
    for e in errors[:5]:
        print('  error:', e[:300])
    sys.exit(1 if fails else 0)
