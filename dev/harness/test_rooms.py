"""floor3dx-rooms-card: embeds a floor3dx card, detects the rooms of its model on request from the
editor, tints and selects a room on a tap, shows the room's controls over the model, and keeps the
embedded card's own bindings. Runs on the demo house (or the private house with ?model=)."""
import json, os, sys
from run import run

OUT = sys.argv[1] if len(sys.argv) > 1 else 'dev/out/rooms'
os.makedirs(OUT, exist_ok=True)

JS = r"""async ([theme]) => {
  const base = window.card;
  const names = []; base._scene.traverse(o => { if (o.isMesh && o.name) names.push(o.name); });
  const room = names.filter(n => /^room_\d+_1$/.test(n));
  // a lamp in a room, so detection has something to place and a tint has something to show
  const card = Object.assign({}, base._config); delete card.style; delete card.type;
  card.entities = room.length ? [
    {entity: 'light.a', type3d: 'light', object_id: room[0], light: {lumens: 600, distance: 300}},
    {entity: 'input_button.room_b', type3d: 'camera', object_id: room[1] || room[0]},
    {entity: 'switch.b', type3d: 'hide', object_id: names.find(n => !/^room_|^wall/.test(n)), hide: {state: 'off'}},
  ] : [];
  const states = {'light.a': {state: 'on', attributes: {brightness: 200, friendly_name: 'Kitchen Lamp'}}, 'switch.b': {state: 'on', attributes: {friendly_name: 'Garage Door'}},
    'input_button.room_b': {state: 'unknown', attributes: {friendly_name: 'Living Room'}}};
  const calls = [];
  const hass = {states, language: 'en', themes: {}, config: {}, user: {}, callService(d, s, data) { calls.push([d, s, data]); return Promise.resolve(); }};
  const el = document.createElement('floor3dx-rooms-card');
  el.preview = true;
  el.setConfig({card, theme, rooms: [], title: 'Rooms test', height: '560px'});
  el.hass = hass;
  const h = document.createElement('div'); h.id = 'shot'; h.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:560px;z-index:99'; document.body.appendChild(h); h.appendChild(el);
  const t0 = performance.now(); while (!(el._embedded && el._embedded._modelready) && performance.now() - t0 < 240000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 600));
  const out = {embedded: !!(el._embedded && el._embedded._modelready), floorsInModel: room.length};
  out.look = el._embedded._config.look ? el._embedded._config.look.theme : null;
  // 1. detection, as the editor asks for it
  const got = []; const onPrev = (e) => got.push(e.detail); window.addEventListener('floor3dx-rooms-preview', onPrev);
  window.dispatchEvent(new CustomEvent('floor3dx-rooms-editor', {detail: {request: 'detect'}}));
  await new Promise(r => setTimeout(r, 300));
  window.removeEventListener('floor3dx-rooms-preview', onPrev);
  const answer = got.find(d => d.rooms || d.error) || {};
  out.detectError = answer.error || null;
  const rooms = answer.rooms || [];
  out.rooms = rooms.length; out.roomNames = rooms.map(r => r.name);
  out.placed = rooms.reduce((n, r) => n + r.entities.length, 0);
  out.namedFromButton = rooms.some(r => r.name === 'Living Room');
  // 2. configure the rooms, wait for the tints
  el.setConfig({card, theme, rooms, title: 'Rooms test', height: '560px'});
  const t1 = performance.now(); while (!(el._embedded && el._embedded._modelready && el._tints.length) && performance.now() - t1 < 240000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 400));
  out.tints = el._tints.length;
  out.litTint = el._tints.some(t => t.mesh.visible); // light.a is on: its room is tinted
  out.pins = el.shadowRoot.querySelectorAll('.pin').length;
  out.pinsPlaced = Array.from(el.shadowRoot.querySelectorAll('.pin')).filter(p => !p.hidden && p.style.left).length;
  // 3. a tap on a room: a point of its floor that is visible (its centre may be behind a wall from
  // this camera), found by raycasting at a few points of the floor
  const target = rooms.find(r => r.entities.length) || rooms[0];
  const cam = el._embedded._camera; cam.updateMatrixWorld();
  const canvas = el._embedded._renderer.domElement; const rect = canvas.getBoundingClientRect();
  const c0 = el._index.centre(target, el._embedded._scene);
  let x = 0, y = 0, found = false;
  const tryAt = (px, pz) => { const v = c0.clone(); v.x = px; v.z = pz; v.project(cam); const sx = rect.left + (v.x + 1) / 2 * rect.width, sy = rect.top + (1 - v.y) / 2 * rect.height;
    const hits = el._embedded._getintersect({offsetX: sx - rect.left, offsetY: sy - rect.top}); if (hits.length && hits[0].object.name === target.floors[0]) { x = sx; y = sy; found = true; } };
  outer: for (const dx of [0, 40, -40, 80, -80, 120, -120, 160, -160]) for (const dz of [0, 40, -40, 80, -80, 120, -120, 160, -160]) { tryAt(c0.x + dx, c0.z + dz); if (found) break outer; }
  out.tapFound = found;
  const pd = new PointerEvent('pointerdown', {clientX: x, clientY: y, bubbles: true, pointerType: 'touch'});
  const pu = new PointerEvent('pointerup', {clientX: x, clientY: y, bubbles: true, pointerType: 'touch'});
  el._modelHost.dispatchEvent(pd); el._modelHost.dispatchEvent(pu);
  await new Promise(r => setTimeout(r, 200));
  out.selected = el._room; out.target = target.id;
  out.panel = !!el.shadowRoot.querySelector('.panel');
  out.tilesShown = el.shadowRoot.querySelectorAll('.tile').length;
  out.selectedTint = el._tints.some(t => t.room.id === target.id && t.mesh.visible && t.mesh.material.opacity >= 0.5);
  // 4. a control in the panel calls the service
  const toggle = el.shadowRoot.querySelector('.tile button[data-action=toggle]');
  if (toggle) toggle.click();
  await new Promise(r => setTimeout(r, 100));
  out.calls = calls.map(c => c[0] + '.' + c[1]);
  // 5. the panel's colours come from the theme
  const cs = getComputedStyle(el); out.stageVar = cs.getPropertyValue('--f3r-stage').trim(); out.lightClass = el.classList.contains('light');
  // 6. the editor: renders its four sections and the theme swatches, and gets the preview's objects
  const ed = document.createElement('floor3dx-rooms-card-editor'); ed.hass = hass; ed.setConfig({card, theme, rooms});
  const eh = document.createElement('div'); eh.style.cssText = 'position:fixed;left:0;top:0;width:400px;z-index:100;opacity:0'; document.body.appendChild(eh); eh.appendChild(ed);
  await new Promise(r => setTimeout(r, 300));
  out.editorSections = ed.shadowRoot.querySelectorAll('details[data-section]').length;
  out.editorSwatches = ed.shadowRoot.querySelectorAll('.sw').length;
  out.editorRooms = ed.shadowRoot.querySelectorAll('details.room').length;
  out.editorObjects = ed.shadowRoot.querySelectorAll('#f3r-objects option').length;
  eh.remove();
  el._embedded._render && el._embedded._render();
  window.shot = h; return out;
}"""

if __name__ == '__main__':
    theme = os.environ.get('THEME', 'midnight-teal')
    model = os.environ.get('MODEL', '')
    query = f'path=/dev/private/&model={model}' if model else ''
    def after(page):
        r = page.evaluate(JS, [theme])
        page.wait_for_timeout(400)
        page.screenshot(path=f'{OUT}/rooms-{theme}.png', clip={'x': 0, 'y': 0, 'width': 900, 'height': 560}, timeout=120000)
        return r
    result, errors = run(query=query, after=after, timeout_ms=300000)
    print(json.dumps(result)); print(errors[:3])
    r = result
    ok = True
    def check(name, cond):
        global ok
        print(('PASS ' if cond else 'FAIL ') + name)
        ok = ok and cond
    check('embedded floor3dx card loads the model with the theme', r['embedded'] and r['look'])
    check('detection finds the rooms and places the lamp', r['rooms'] == r['floorsInModel'] and r['rooms'] > 0 and r['placed'] >= 1 and not r['detectError'])
    check('a room is named after the camera / button bound to its floor', r['namedFromButton'])
    check('tint meshes exist, the lit room is tinted', r['tints'] > 0 and r['litTint'])
    check('pins placed on the model', r['pins'] == r['rooms'] and r['pinsPlaced'] > 0)
    check('a tap selects the room and opens its panel', r['selected'] == r['target'] and r['panel'] and r['tilesShown'] >= 1 and r['selectedTint'])
    check('a tile toggles its entity', 'light.turn_off' in r['calls'])
    check('theme colours applied', r['stageVar'] and not r['lightClass'])
    check('the editor renders, with 40 theme swatches, the rooms, and the model\'s objects from the preview', r['editorSections'] == 4 and r['editorSwatches'] == 40 and r['editorRooms'] == r['rooms'] and r['editorObjects'] > 0)
    check('no page errors', not errors)
    raise SystemExit(0 if ok else 1)
