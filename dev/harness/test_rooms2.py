"""floor3dx-rooms-card 2.5: a tap on a bound object (object_tap), readouts in the panel header, the
hue slider, reset view, several models in one card with the switcher, the select event and the URL
hash, the editor keeping entity-reference tokens, and the regular card's editor finding rooms cards.
Runs on the demo house (or the private house with ?model=)."""
import json, os, sys
from run import run

OUT = sys.argv[1] if len(sys.argv) > 1 else 'dev/out/rooms2'
os.makedirs(OUT, exist_ok=True)

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(e.message)); window.addEventListener('unhandledrejection', (e) => window.__errs.push('rej ' + (e.reason && e.reason.message)));
  const mark = (k) => { out['errs_' + k] = window.__errs.length; };
  const base = window.card;
  const names = []; base._scene.traverse(o => { if (o.isMesh && o.name) names.push(o.name); });
  const room = names.filter(n => /^room_\d+_1$/.test(n));
  const card = Object.assign({}, base._config); delete card.style; delete card.type;
  const out = {};
  const calls = [];
  const states = {
    'light.c': {state: 'on', attributes: {brightness: 120, friendly_name: 'Table Lamp'}},
    'light.a': {state: 'off', attributes: {friendly_name: 'Floor Lamp'}},
    'light.col': {state: 'on', attributes: {brightness: 180, supported_color_modes: ['hs'], color_mode: 'hs', hs_color: [220, 55], friendly_name: 'Colour Lamp'}},
    'sensor.temp': {state: '21.44', attributes: {unit_of_measurement: '°C', device_class: 'temperature', friendly_name: 'Temperature'}},
    'sensor.hum': {state: '48', attributes: {unit_of_measurement: '%', friendly_name: 'Humidity'}},
    'binary_sensor.win': {state: 'on', attributes: {device_class: 'window', friendly_name: 'Window'}},
  };
  const hass = {states, language: 'en', themes: {}, config: {}, user: {}, callService(d, s, data) { calls.push([d, s, data]); return Promise.resolve(); }, callWS: () => Promise.resolve(null)};
  const mount = (el, w, h, hidden) => { const d = document.createElement('div'); d.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;z-index:99;${hidden ? 'opacity:0' : ''}`; document.body.appendChild(d); d.appendChild(el); return d; };
  const ready = async (el) => { const t = performance.now(); while (!(el._slots.length && el._slots.every(s => s.el && s.el._modelready) && el._tints.length) && performance.now() - t < 240000) await sleep(200); await sleep(500); };
  // a screen point that hits an object (name), from the embedded card's camera
  const pointOn = (el, name) => {
    const emb = el._embedded, cam = emb._camera, rect = emb._renderer.domElement.getBoundingClientRect(); cam.updateMatrixWorld();
    const o = emb._scene.getObjectByName(name); if (!o) return null;
    const centre = (() => { const bb = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox); return bb.getCenter(bb.min.clone()).applyMatrix4(o.matrixWorld); })();
    for (const [dx, dy, dz] of [[0,0,0],[10,0,0],[-10,0,0],[0,0,10],[0,0,-10],[0,10,0]]) {
      const v = centre.clone(); v.x += dx; v.y += dy; v.z += dz; v.project(cam);
      // whole pixels, as a real pointer reports them
      const sx = Math.round(rect.left + (v.x + 1) / 2 * rect.width), sy = Math.round(rect.top + (1 - v.y) / 2 * rect.height);
      const hits = emb._getintersect({offsetX: sx - rect.left, offsetY: sy - rect.top});
      if (hits.length && hits[0].object.name === name) return {x: sx, y: sy};
    }
    return null;
  };
  const tap = (el, p) => { const h = el._modelHost; h.dispatchEvent(new PointerEvent('pointerdown', {clientX: p.x, clientY: p.y, bubbles: true, pointerType: 'touch'})); h.dispatchEvent(new PointerEvent('pointerup', {clientX: p.x, clientY: p.y, bubbles: true, pointerType: 'touch'})); };

  // 1. a lamp object that can be hit: the first non-floor, non-wall mesh the camera sees
  const el = document.createElement('floor3dx-rooms-card'); el.preview = true;
  const probeCard = Object.assign({}, card, {entities: []});
  // every floor a room, so the probe can tell which room an object stands in
  el.setConfig({card: probeCard, theme: 'architect', rooms: room.map((f, i) => ({id: 'p' + i, floors: [f], entities: [{entity: 'light.a'}]})), title: 'Rooms 2.5', height: '560px'}); el.hass = hass;
  const h = mount(el, 900, 560);
  await ready(el);
  let lamp = null, lampPoint = null, lampFloor = room[0];
  for (const n of names) {
    if (/^room_|^wall|^f3dx_/i.test(n)) continue;
    const p = pointOn(el, n); if (!p) continue;
    const r = el._roomAt(el._hits({clientX: p.x, clientY: p.y}, el._slots[0]), el._slots[0]); if (!r) continue;
    lamp = n; lampPoint = p; lampFloor = r.floors[0]; break;
  }
  out.lamp = lamp;
  const rooms = [{id: 'r1', name: 'One', floors: [lampFloor], entities: [{entity: 'light.c'}, {entity: 'light.col'}, {entity: 'sensor.temp'}, {entity: 'sensor.hum'}, {entity: 'binary_sensor.win'}]}];
  const cfg = (extra) => Object.assign({card: Object.assign({}, card, {entities: [{entity: 'light.c', type3d: 'light', object_id: lamp, light: {lumens: 500}}, {entity: 'light.a', type3d: 'light', object_id: lampFloor, light: {lumens: 500}}]}), theme: 'architect', rooms, title: 'Rooms 2.5', height: '560px', guest_mode: false}, extra);
  el.setConfig(cfg({}));
  await ready(el);
  lampPoint = pointOn(el, lamp);
  out.lampHit = !!lampPoint;
  // 2. object_tap: action (default): the tap toggles the lamp, the room stays unselected
  const n0 = calls.length;
  tap(el, lampPoint); await sleep(250);
  out.tapToggled = calls.slice(n0).some(c => c[1] === 'toggle' && c[2].entity_id === 'light.c');
  mark('tap');
  out.tapNoRoom = el._room === null;
  // a double tap on the lamp is swallowed before the embedded card's listener
  const n1 = calls.length;
  el._embedded._renderer.domElement.dispatchEvent(new MouseEvent('dblclick', {clientX: lampPoint.x, clientY: lampPoint.y, bubbles: true, composed: true}));
  await sleep(150);
  mark('dbl');
  out.dblSwallowed = calls.length === n1;
  // the floor is the room, even when a lamp is bound to it
  const fp = pointOn(el, lampFloor);
  if (fp) { const n2 = calls.length; tap(el, fp); await sleep(250); out.floorSelects = el._room === 'r1' && calls.length === n2; } else out.floorSelects = 'skipped';
  mark('floor');
  el._select(null);
  // 3. object_tap: panel: the room opens with the lamp's tile highlighted
  el.setConfig(cfg({object_tap: 'panel'})); await ready(el);
  const n3 = calls.length; tap(el, lampPoint); await sleep(300);
  mark('panel');
  out.panelMode = el._room === 'r1' && calls.length === n3 && !!el.shadowRoot.querySelector('.tile.focus [data-entity="light.c"]');
  // 4. readouts: the sensors are a line under the room name, not tiles
  const ro = el.shadowRoot.querySelector('.readouts');
  out.readouts = ro ? ro.textContent : null;
  out.readoutsOk = !!ro && /21\.4°C/.test(ro.textContent) && /48%/.test(ro.textContent) && /Window open/.test(ro.textContent);
  out.tileCount = el.shadowRoot.querySelectorAll('.tiles .tile').length;
  // 5. object_tap: room: the tap selects the room, nothing toggles
  el._select(null); el.setConfig(cfg({object_tap: 'room'})); await ready(el);
  const n4 = calls.length; tap(el, lampPoint); await sleep(250);
  mark('room');
  out.roomMode = el._room === 'r1' && calls.length === n4;
  // 6. the hue slider
  el.setConfig(cfg({color_control: 'slider'})); await ready(el); el._select('r1'); await sleep(200);
  const hue = el.shadowRoot.querySelector('input.range.hue');
  out.hueSlider = !!hue && Number(hue.value) === 220 && !el.shadowRoot.querySelector('.wheel');
  if (hue) { hue.value = '200'; hue.dispatchEvent(new Event('change', {bubbles: true})); await sleep(100); }
  out.hueCall = calls.some(c => c[1] === 'turn_on' && c[2].entity_id === 'light.col' && Array.isArray(c[2].hs_color) && c[2].hs_color[0] === 200 && c[2].hs_color[1] === 100);
  el.setConfig(cfg({color_control: 'both'})); await ready(el); el._select('r1'); await sleep(200);
  mark('hue');
  out.hueBoth = !!el.shadowRoot.querySelector('input.range.hue') && !!el.shadowRoot.querySelector('.wheel');
  // 7. reset view: the camera flies back to where the model was first shown
  const emb = el._embedded, home = el._slots[0].home.position.clone();
  emb._camera.position.x += 600; emb._camera.position.y += 300; emb._controls.update();
  const moved = emb._camera.position.distanceTo(home) > 500;
  el.shadowRoot.querySelector('button[data-action=reset]').click();
  await sleep(1200);
  mark('reset');
  out.resetDist = emb._camera.position.distanceTo(home); out.resetMoved = moved; out.resetBtn = !!el.shadowRoot.querySelector('button[data-action=reset]'); out.resetZoom = (emb._zoom || []).length;
  out.resetView = moved && out.resetDist < 1;
  // 8. several models in one card
  h.remove();
  const el3 = document.createElement('floor3dx-rooms-card'); el3.preview = true;
  const m = (name) => ({name, card: Object.assign({}, card, {entities: [{entity: 'light.a', type3d: 'light', object_id: room[0], light: {lumens: 500}}]})});
  el3.setConfig({models: [m('House'), m('Annex')], theme: 'architect', rooms: [{id: 'a', name: 'A', model: 'house', floors: [room[0]], entities: [{entity: 'light.a'}]}, {id: 'b', name: 'B', model: 'annex', floors: [room[0]], entities: [{entity: 'light.c'}]}], height: '560px'});
  el3.hass = hass;
  const h3 = mount(el3, 900, 560);
  await ready(el3);
  mark('multi');
  out.slots = el3._slots.length;
  out.switcher = el3.shadowRoot.querySelectorAll('.seg button').length;
  out.firstShown = el3._active === 'house' && !el3._slots[0].host.hidden && el3._slots[1].host.hidden;
  el3.shadowRoot.querySelector('.seg button[data-model=all]').click(); await sleep(200);
  out.bothShown = el3._active === 'all' && el3._slots.every(s => !s.host.hidden) && el3._slots[0].host.getBoundingClientRect().width > 300 && el3._slots[1].host.getBoundingClientRect().width > 300;
  // selecting a room of the other model shows that model
  el3._showModel('house'); el3._select('b'); await sleep(100);
  out.selectSwitches = el3._active === 'annex' && !el3._slots[1].host.hidden;
  // pins only on the shown model
  await sleep(200);
  const pinsShown = Array.from(el3.shadowRoot.querySelectorAll('.pin')).filter(p => !p.hidden).map(p => p.dataset.room);
  out.pinsOnShown = pinsShown.includes('b') && !pinsShown.includes('a');
  // the select event and the URL hash
  window.dispatchEvent(new CustomEvent('floor3dx-rooms-select', {detail: {model: 'House', room: 'a'}})); await sleep(100);
  out.selectEvent = el3._active === 'house' && el3._room === 'a';
  location.hash = '#model=annex&room=b'; await sleep(200);
  mark('hash');
  out.hashSelect = el3._active === 'annex' && el3._room === 'b';
  history.replaceState(null, '', location.pathname + location.search);
  // detection per model
  const got = []; const onPrev = (e) => got.push(e.detail); window.addEventListener('floor3dx-rooms-preview', onPrev);
  window.dispatchEvent(new CustomEvent('floor3dx-rooms-editor', {detail: {request: 'detect', model: 'annex'}}));
  await sleep(400); window.removeEventListener('floor3dx-rooms-preview', onPrev);
  const ans = got.find(d => d.rooms);
  mark('detect');
  out.detectModel = ans && ans.model === 'annex' && ans.rooms.length === room.length;
  // the editor with two models: groups the rooms, detects both, tags the rooms with their model
  const ed = document.createElement('floor3dx-rooms-card-editor'); ed.hass = hass;
  ed.setConfig({models: [m('House'), m('Annex')], theme: 'architect', rooms: []});
  const eh = mount(ed, 400, 600, true);
  await sleep(200);
  out.editorModels = ed._models().length === 2 && ed.shadowRoot.querySelectorAll('.group').length === 2;
  const emitted = []; ed.addEventListener('config-changed', (e) => emitted.push(e.detail.config));
  ed._detect(); await sleep(1500);
  const last = emitted[emitted.length - 1];
  out.editorDetect = !!last && last.rooms.length === room.length * 2 && last.rooms.filter(r => r.model === 'house').length === room.length && last.rooms.filter(r => r.model === 'annex').length === room.length;
  mark('editor');
  eh.remove(); h3.remove();
  // 9. the editor keeps [[entity:…]] references when asked
  const dashboards = {null: {views: [
    {title: 'Controls', cards: [{type: 'entities', card_reference_id: 'lights', entities: [{entity: 'light.a', entity_reference_id: 'lights.kitchen'}]}]},
    {title: 'Test 3D', cards: [{type: 'custom:dashboard-entity-reference', card: Object.assign({}, card, {type: 'custom:floor3dx-card', entities: [{entity: '[[entity:lights.kitchen]]', type3d: 'light', object_id: room[0], light: {lumens: 500}}]})}]},
    {title: 'Rooms', cards: [{type: 'custom:floor3dx-rooms-card', title: 'House', card: Object.assign({}, card, {entities: [{entity: 'light.a', type3d: 'light', object_id: room[0]}]}), rooms: []},
      {type: 'custom:floor3dx-rooms-card', models: [{name: 'Main', card: Object.assign({}, card, {entities: []})}, {name: 'Garage', card: Object.assign({}, card, {entities: []})}], rooms: []}]},
  ]}};
  const edHass = Object.assign({}, hass, {callWS: (q) => Promise.resolve(q.type === 'lovelace/dashboards/list' ? [] : q.type === 'lovelace/config' ? dashboards[q.url_path] : null)});
  const ed2 = document.createElement('floor3dx-rooms-card-editor'); ed2.hass = edHass; ed2.setConfig({card, theme: 'architect', rooms: []});
  const eh2 = mount(ed2, 400, 600, true); await sleep(100);
  await ed2._scan();
  out.scanFloor3dOnly = ed2._found.length === 1 && ed2._found[0].kind === 'floor3d';
  ed2._act('use-found', {i: 0});
  out.resolvedCopy = ed2._config.card.entities[0].entity === 'light.a';
  ed2._keep = true; ed2._act('use-found', {i: 0});
  out.keptTokens = ed2._config.card.entities[0].entity === '[[entity:lights.kitchen]]' && !('card_reference_id' in ed2._config.card);
  mark('scan');
  eh2.remove();
  // 10. the regular card's editor finds rooms cards (one per model) and takes one's card: block
  const red = document.createElement('floor3dx-card-editor'); red.hass = edHass; red.setConfig(Object.assign({type: 'custom:floor3dx-card'}, card, {entities: []}));
  const rh = mount(red, 400, 600, true); await sleep(300);
  await red._scanRooms();
  out.reverseFound = (red._foundRooms || []).map(f => f.label.replace(/^.*· /, '') + (f.model ? ` (${f.model})` : ''));
  out.reverseOk = (red._foundRooms || []).length === 3 && red._foundRooms.every(f => f.kind === 'rooms' && f.card.objfile === card.objfile);
  const changed = []; red.addEventListener('config-changed', (e) => changed.push(e.detail.config));
  red._useFound(red._foundRooms[0].card);
  await sleep(100);
  out.reverseUsed = changed.length > 0 && changed[changed.length - 1].entities.length === 1 && changed[changed.length - 1].entities[0].entity === 'light.a' && changed[changed.length - 1].type === 'custom:floor3dx-card';
  mark('reverse');
  rh.remove();
  document.body.appendChild(h);
  el.setConfig(cfg({})); await ready(el); el._select('r1'); await sleep(200);
  window.shot = h; return out;
}"""

if __name__ == '__main__':
    model = os.environ.get('MODEL', '')
    query = f'path=/dev/private/&model={model}' if model else ''
    def after(page):
        r = page.evaluate(JS, [])
        page.wait_for_timeout(400)
        page.screenshot(path=f'{OUT}/rooms2.png', clip={'x': 0, 'y': 0, 'width': 900, 'height': 560}, timeout=120000)
        return r
    result, errors = run(query=query, after=after, timeout_ms=600000)
    r = result or {}
    print(json.dumps(r))
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    check('a lamp object of the model can be hit', r.get('lampHit') is True)
    check('object_tap action: a tap on the lamp toggles it and leaves the room alone', r.get('tapToggled') and r.get('tapNoRoom'))
    check('a double tap on the lamp is swallowed', r.get('dblSwallowed'))
    check('the floor is the room even with a lamp bound to it', r.get('floorSelects') in (True, 'skipped'))
    check('object_tap panel: the room opens with the lamp tile highlighted', r.get('panelMode'))
    check('sensors are a line of readouts under the room name, not tiles', r.get('readoutsOk') and r.get('tileCount') == 2)
    check('object_tap room: the tap selects the room only', r.get('roomMode'))
    check('hue slider: shown at the current hue, sets hs_color [h, 100]; both adds the swatches', r.get('hueSlider') and r.get('hueCall') and r.get('hueBoth'))
    check('reset view flies the camera home', r.get('resetView'))
    check('two models: two embedded cards, a switcher with Both, the first shown', r.get('slots') == 2 and r.get('switcher') == 3 and r.get('firstShown'))
    check('Both shows the models side by side', r.get('bothShown'))
    check('selecting a room of the other model shows that model; pins only on the shown model', r.get('selectSwitches') and r.get('pinsOnShown'))
    check('the select event and the URL hash pick a model and a room', r.get('selectEvent') and r.get('hashSelect'))
    check('detection answers per model; the editor detects both and tags the rooms', r.get('detectModel') and r.get('editorModels') and r.get('editorDetect'))
    check('the scanner offers floor3d cards; Use copies resolved ids, or the tokens when asked', r.get('scanFloor3dOnly') and r.get('resolvedCopy') and r.get('keptTokens'))
    check('the regular editor finds rooms cards (one per model) and takes a card: block', r.get('reverseOk') and r.get('reverseUsed'))
    check('no page errors', not errors)
    for e in errors[:5]:
        print('  error:', e[:300])
    sys.exit(1 if fails else 0)
