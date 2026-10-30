"""Perspective and lens (2.14): under two-point perspective a vertical edge of the model projects to a
vertical screen line while three-point lets it lean; a change of field of view keeps the target's apparent
size; taps still land under two-point; the Rooms Card's camera menu (long press on the camera button)
applies the choice to every model and remembers it. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const c = window.card;
  const out = {};
  // a tall vertical edge: the tallest mesh's bounding box, its min-x/min-z vertical edge
  let tall = null; c._scene.traverse(o => { if (o.isMesh && o.name && /wall/i.test(o.name)) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); const h = b.max.y - b.min.y; if (h > 100 && (!tall || h > tall.h)) tall = {h, b}; } });
  if (!tall) { let best = null; c._scene.traverse(o => { if (o.isMesh && o.name) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); const h = b.max.y - b.min.y; if (!best || h > best.h) best = {h, b}; } }); tall = best; }
  const lo = tall.b.min.clone(), hi = lo.clone(); hi.y = tall.b.max.y;
  // tilt the camera well down and off-centre so a plain camera makes verticals lean
  const t = c._controls.target; c._camera.position.set(t.x + 900, t.y + 1100, t.z + 300); c._controls.update(); c._render();
  const lean = () => { const a = lo.clone().project(c._camera), b = hi.clone().project(c._camera); return {dx: Math.abs(a.x - b.x) * c._renderer.domElement.width / 2, dy: Math.abs(a.y - b.y) * c._renderer.domElement.height / 2}; };
  out.three = lean();
  c.setProjection({projection: 'two_point'}); c._render(); out.two = lean(); out.stateTwo = c.projectionState();
  // fov: the distance between two projected points (the edge's screen length) is kept when the lens changes
  // the framing is measured at the target: two points beside it, perpendicular to the view, keep their screen distance
  const len = () => { const right = new (lo.constructor)().setFromMatrixColumn(c._camera.matrixWorld, 0).normalize().multiplyScalar(100); const a = t.clone().add(right).project(c._camera), b = t.clone().sub(right).project(c._camera); return Math.hypot((a.x - b.x) * c._renderer.domElement.width / 2, (a.y - b.y) * c._renderer.domElement.height / 2); };
  const l45 = len(); c.setProjection({fov: 25}); c._render(); const l25 = len(); const d25 = c._camera.position.distanceTo(c._controls.target);
  c.setProjection({fov: 60}); c._render(); const l60 = len(); const d60 = c._camera.position.distanceTo(c._controls.target);
  out.lens = {l45: +l45.toFixed(1), l25: +l25.toFixed(1), l60: +l60.toFixed(1), d25: Math.round(d25), d60: Math.round(d60), fov: c._camera.fov};
  // picking under two-point: the ray through the projected point of a mesh centre hits that mesh
  c.setProjection({fov: 45}); c._render();
  const mesh = c._raycasting.find(o => o.isMesh && o.name === 'room_0_1') || c._raycasting[0];
  mesh.geometry.computeBoundingBox(); const centre = mesh.geometry.boundingBox.getCenter(lo.clone()).applyMatrix4(mesh.matrixWorld);
  const p = centre.clone().project(c._camera); const W = c._content.clientWidth, H = c._content.clientHeight;
  const hits = c._getintersect({offsetX: (p.x + 1) / 2 * W, offsetY: (1 - p.y) / 2 * H});
  out.pick = {want: mesh.name, got: hits[0]?.object?.name, n: hits.length};
  // orthographic: parallel edges stay parallel, equal lengths stay equal whatever the depth; picking works; back to perspective keeps the frame
  c.setProjection({projection: 'orthographic'}); c._render();
  out.ortho = {isOrtho: !!c._camera.isOrthographicCamera, state: c.projectionState()};
  const P = (v) => v.clone().project(c._camera);
  const sz = c._renderer.domElement;
  const near = P(lo), nearTop = P(hi); // the tall edge
  const far = lo.clone(); far.x += 600; const farTop = hi.clone(); farTop.x += 600; const a2 = P(far), b2 = P(farTop); // an equal vertical far from it
  out.ortho.lenNear = Math.hypot((nearTop.x - near.x) * sz.width / 2, (nearTop.y - near.y) * sz.height / 2);
  out.ortho.lenFar = Math.hypot((b2.x - a2.x) * sz.width / 2, (b2.y - a2.y) * sz.height / 2);
  const pO = centre.clone().project(c._camera); const hitsO = c._getintersect({offsetX: (pO.x + 1) / 2 * W, offsetY: (1 - pO.y) / 2 * H});
  out.ortho.pick = hitsO[0]?.object?.name;
  const spanO = len();
  c.setProjection({projection: 'three_point'}); c._render();
  out.ortho.back = {isPersp: !!c._camera.isPerspectiveCamera, span: +len().toFixed(1), spanOrtho: +spanO.toFixed(1)};
  // the Rooms Card: the camera menu applies to both models and is remembered
  const card = Object.assign({}, c._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const hass = {states: {}, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const mk = async () => { const el = document.createElement('floor3dx-rooms-card'); el.setConfig({models: [{name: 'A', card}, {name: 'B', card}], rooms: [], title: 'Proj', height: '500px'}); el.hass = hass; const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:500px;z-index:99'; document.body.appendChild(d); d.appendChild(el); await new Promise(r => { const t = setInterval(() => { if (el._slots.every(s => s.el?._modelready)) { clearInterval(t); r(); } }, 100); }); await sleep(300); return {el, d}; };
  let {el, d} = await mk();
  const btn = el.shadowRoot.querySelector('.menu button[data-action="reset"], .menu button[data-action="views"]');
  btn.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, composed: true})); await sleep(600); btn.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, composed: true})); btn.click(); await sleep(100);
  out.menu = !!el.shadowRoot.querySelector('button[data-action="cam-two"]');
  el.shadowRoot.querySelector('button[data-action="cam-two"]').click(); await sleep(100);
  el.shadowRoot.querySelector('button[data-action="cam-fov"][data-i="35"]').click(); await sleep(100);
  out.applied = el._slots.map(s => s.el.projectionState());
  el.shadowRoot.querySelector('button[data-action="cam-flat"]').click(); await sleep(150);
  out.flat = el._slots.map(s => ({p: s.el.projectionState().projection, ortho: !!s.el._camera.isOrthographicCamera}));
  out.lensDisabled = el.shadowRoot.querySelector('button[data-action="cam-fov"]').disabled;
  el.shadowRoot.querySelector('button[data-action="cam-two"]').click(); await sleep(150);
  d.remove();
  ({el, d} = await mk()); out.remembered = el._slots.map(s => s.el.projectionState()); d.remove();
  try { localStorage.removeItem(el._storeKey('projection')); localStorage.removeItem(el._storeKey('two_point')); localStorage.removeItem(el._storeKey('fov')); } catch (_) {}
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
    th, tw = r.get('three', {}), r.get('two', {})
    check('three-point: the tilted camera makes a vertical edge lean on screen', th.get('dx', 0) > 2)
    check('two-point: the same edge is vertical on screen (within a pixel)', tw.get('dx', 99) < 1 and r.get('stateTwo', {}).get('projection') == 'two_point')
    L = r.get('lens', {})
    check('a lens change keeps the framing: a span at the target keeps its screen size within 3%', abs(L.get('l25', 0) - L.get('l45', 1)) < 0.03 * L.get('l45', 1) and abs(L.get('l60', 0) - L.get('l45', 1)) < 0.03 * L.get('l45', 1))
    check('a narrower lens moved the camera back, a wider one forward', L.get('d25', 0) > L.get('d60', 1))
    check('picking under two-point hits what is under the pointer', r.get('pick', {}).get('got') == r.get('pick', {}).get('want'))
    O = r.get('ortho', {})
    check('orthographic: the camera is orthographic and equal verticals near and far have the same screen length', O.get('isOrtho') and O.get('state', {}).get('projection') == 'orthographic' and abs(O.get('lenNear', 0) - O.get('lenFar', 1)) < 0.02 * max(1, O.get('lenNear', 1)))
    check('orthographic: picking hits what is under the pointer', O.get('pick') == r.get('pick', {}).get('want'))
    check('back to perspective: a perspective camera again, the span at the target kept within 5%', O.get('back', {}).get('isPersp') and abs(O.get('back', {}).get('span', 0) - O.get('back', {}).get('spanOrtho', 1)) < 0.05 * O.get('back', {}).get('spanOrtho', 1))
    check('long press on the camera button opens the menu', r.get('menu') is True)
    check('the menu applies two-point and the 35° lens to every model', all(p.get('projection') == 'two_point' and p.get('fov') == 35 for p in r.get('applied', [])) and len(r.get('applied', [])) == 2)
    check('Flat view makes every model orthographic and greys the lens rows', all(x.get('p') == 'orthographic' and x.get('ortho') for x in r.get('flat', [])) and r.get('lensDisabled') is True)
    check('the choice is remembered by a new card in this browser', all(p.get('projection') == 'two_point' and p.get('fov') == 35 for p in r.get('remembered', [])))
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
