"""Pictures of floor3dx-rooms-card with two models (the house and the garage, dev/private): the
switcher on House, on Garage, and Both side by side; a room of the garage selected.

    THEME=architect python3 dev/harness/render_models.py <out-dir>
"""
import json, os, sys
from run import run
from render_views import HOUSE, GARAGE

OUT = sys.argv[1] if len(sys.argv) > 1 else 'dev/out/rooms-models'
os.makedirs(OUT, exist_ok=True)
THEME = os.environ.get('THEME', 'architect')

JS = r"""async ([house, garage, theme, width, height]) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const model = (m) => { const card = Object.assign({}, base._config, {objfile: m.file, entities: m.lights, object_groups: [], shadow: 'yes', globalLightPower: 0.77}); delete card.style; delete card.type; if (m.camera) { card.camera_position = m.camera.position; card.camera_target = m.camera.target; } else { delete card.camera_position; delete card.camera_target; } return card; };
  const states = {'light.a': {state: 'on', attributes: {brightness: 200, friendly_name: 'Living Room Lamp'}}, 'light.b': {state: 'on', attributes: {brightness: 120, friendly_name: 'Dining Pendant'}},
    'light.c': {state: 'off', attributes: {friendly_name: 'Kitchen Spots'}}, 'light.d': {state: 'on', attributes: {brightness: 255, friendly_name: 'Bedroom Lamp'}}, 'light.e': {state: 'on', attributes: {friendly_name: 'Bath Light'}},
    'light.garage': {state: 'on', attributes: {brightness: 255, friendly_name: 'Garage Lights'}}, 'cover.garage_door': {state: 'closed', attributes: {device_class: 'garage', friendly_name: 'Garage Door'}},
    'sensor.garage_temp': {state: '12.6', attributes: {unit_of_measurement: '°C', device_class: 'temperature', friendly_name: 'Garage Temperature'}}, 'binary_sensor.garage_side_door': {state: 'off', attributes: {device_class: 'door', friendly_name: 'Side Door'}}};
  const hass = {states, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const el = document.createElement('floor3dx-rooms-card'); el.preview = true;
  const models = [{name: 'House', width: 62, card: model(house)}, {name: 'Garage', width: 38, card: model(garage)}];
  el.setConfig({models, theme, rooms: [], title: 'House', height: height + 'px', guest_mode: false});
  el.hass = hass;
  const h = document.createElement('div'); h.id = 'shot'; h.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;z-index:99`; document.body.appendChild(h); h.appendChild(el);
  const ready = async () => { const t = performance.now(); while (!(el._slots.length === 2 && el._slots.every(s => s.el && s.el._modelready)) && performance.now() - t < 300000) await sleep(200); await sleep(500); };
  await ready();
  // rooms of both models, by the preview's detection
  const got = []; const onPrev = (e) => got.push(e.detail); window.addEventListener('floor3dx-rooms-preview', onPrev);
  for (const id of ['house', 'garage']) { window.dispatchEvent(new CustomEvent('floor3dx-rooms-editor', {detail: {request: 'detect', model: id}})); await sleep(300); }
  window.removeEventListener('floor3dx-rooms-preview', onPrev);
  const rooms = [];
  for (const id of ['house', 'garage']) { const a = got.find(d => d.rooms && d.model === id); (a ? a.rooms : []).forEach(r => { r.model = id; if (rooms.some(x => x.id === r.id)) r.id = id + '-' + r.id; rooms.push(r); }); }
  const bay = rooms.find(r => r.model === 'garage') || null;
  if (bay) { bay.name = 'Garage'; bay.icon = 'mdi:garage-variant'; bay.entities = [{entity: 'light.garage'}, {entity: 'cover.garage_door'}, {entity: 'sensor.garage_temp'}, {entity: 'binary_sensor.garage_side_door'}]; }
  el.setConfig({models, theme, rooms, title: 'House', height: height + 'px', guest_mode: false, labels: true});
  await ready();
  const t1 = performance.now(); while (!el._tints.length && performance.now() - t1 < 60000) await sleep(200);
  await sleep(600);
  window.rooms = el; window.shot = h;
  return {rooms: rooms.length, bay: bay && bay.id};
}"""

STEP = r"""async ([what]) => {
  const el = window.rooms; const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  if (what === 'house') el._showModel('house');
  if (what === 'garage') { el._showModel('garage'); const bay = el._config.rooms.find(r => r.model === 'garage'); if (bay) el._select(bay.id); }
  if (what === 'both') { el._select(null); el._showModel('all'); }
  await sleep(500);
  el._slots.forEach(s => { s.el._render && s.el._render(); });
  el._placePins();
  await sleep(200);
  return el._active;
}"""

def after(page):
    r = page.evaluate(JS, [HOUSE, GARAGE, THEME, 1100, 620])
    print('setup', r, flush=True)
    for what in ('house', 'garage', 'both'):
        a = page.evaluate(STEP, [what])
        page.wait_for_timeout(500)
        page.screenshot(path=f'{OUT}/{THEME}-{what}.png', clip={'x': 0, 'y': 0, 'width': 1100, 'height': 620}, timeout=120000)
        print(what, a, flush=True)

result, errors = run(query=f'path=/dev/private/&model={HOUSE["file"]}&', after=after, timeout_ms=400000)
for e in errors[:5]:
    print('  error:', e[:200])
