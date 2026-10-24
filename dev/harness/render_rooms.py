"""Pictures of floor3dx-rooms-card on the house: the reference lamps, rooms detected, one room
selected, in a few themes, at desktop and phone widths.

    THEMES=neon,riso,ice python3 dev/harness/render_rooms.py <out-dir>
    SELECT=small selects the room with the fewest entities at the desktop width
"""
import json, os, sys
from run import run
from render_views import HOUSE

OUT = sys.argv[1] if len(sys.argv) > 1 else 'dev/out/rooms-house'
os.makedirs(OUT, exist_ok=True)
THEMES = [t for t in os.environ.get('THEMES', 'neon,riso,ice,architect').split(',') if t]

JS = r"""async ([model, theme, width, select]) => {
  const base = window.card;
  const card = Object.assign({}, base._config, {objfile: model.file, entities: model.lights, object_groups: [], shadow: 'yes', globalLightPower: 0.77});
  delete card.style; delete card.type;
  if (model.camera) { card.camera_position = model.camera.position; card.camera_target = model.camera.target; }
  const states = {'light.a': {state: 'on', attributes: {brightness: 200, friendly_name: 'Living Room Lamp'}}, 'light.b': {state: 'on', attributes: {brightness: 120, friendly_name: 'Dining Pendant'}},
    'light.c': {state: 'off', attributes: {friendly_name: 'Kitchen Spots'}}, 'light.d': {state: 'on', attributes: {brightness: 255, friendly_name: 'Bedroom Lamp'}}, 'light.e': {state: 'on', attributes: {friendly_name: 'Bath Light'}},
    'switch.tv': {state: 'on', attributes: {friendly_name: 'Living Room TV'}}, 'fan.ceiling': {state: 'on', attributes: {percentage: 67, supported_features: 1, friendly_name: 'Living Room Fan'}},
    'cover.blinds': {state: 'open', attributes: {friendly_name: 'Living Room Blinds'}}, 'climate.house': {state: 'heat_cool', attributes: {target_temp_low: 66, target_temp_high: 74, current_temperature: 68, hvac_modes: ['heat_cool', 'heat', 'cool', 'off'], hvac_action: 'heating', min_temp: 50, max_temp: 90, supported_features: 2 | 128 | 256, friendly_name: 'Thermostat'}},
    'cover.left_bottom': {state: 'closed', attributes: {current_position: 0, supported_features: 15, friendly_name: 'Master Left Shade Bottom'}}, 'cover.left_top': {state: 'open', attributes: {current_position: 15, supported_features: 15, friendly_name: 'Master Left Shade Top'}},
    'light.color': {state: 'on', attributes: {brightness: 180, supported_color_modes: ['color_temp', 'hs'], color_mode: 'hs', hs_color: [220, 55], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500, friendly_name: 'Living Room Colour Lamp'}}};
  const hass = {states, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const el = document.createElement('floor3dx-rooms-card'); el.preview = true;
  el.setConfig({card, theme, rooms: [], title: 'House', subtitle: 'tap a room', height: '600px'});
  el.hass = hass;
  const h = document.createElement('div'); h.id = 'shot'; h.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:600px;z-index:99`; document.body.appendChild(h); h.appendChild(el);
  const t0 = performance.now(); while (!(el._embedded && el._embedded._modelready) && performance.now() - t0 < 240000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 500));
  const got = []; const onPrev = (e) => got.push(e.detail); window.addEventListener('floor3dx-rooms-preview', onPrev);
  window.dispatchEvent(new CustomEvent('floor3dx-rooms-editor', {detail: {request: 'detect'}}));
  await new Promise(r => setTimeout(r, 300)); window.removeEventListener('floor3dx-rooms-preview', onPrev);
  const rooms = (got.find(d => d.rooms) || {rooms: []}).rooms;
  // the living room gets the extra controls
  const living = rooms.find(r => r.entities.some(e => e.entity === 'light.a')) || rooms[0];
  if (living) living.entities.push({entity: 'light.color'}, {entity: 'cover.left_bottom', top_entity: 'cover.left_top'}, {entity: 'climate.house'}, {entity: 'fan.ceiling'}, {entity: 'switch.tv'});
  el.setConfig({card, theme, rooms, title: 'House', subtitle: 'tap a room', height: '600px', labels: true, tint_on: true, pins: false, guest_mode: false});
  const t1 = performance.now(); while (!(el._embedded && el._embedded._modelready && el._tints.length) && performance.now() - t1 < 240000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 800));
  // SELECT=small picks the room with the fewest entities instead, to see the panel fit its contents
  const target = select === 'small' ? rooms.filter(r => r !== living && r.entities.length).sort((a, b) => a.entities.length - b.entities.length)[0] || living : living;
  if (select && target) el._select(target.id);
  await new Promise(r => setTimeout(r, 300));
  el._embedded._render && el._embedded._render(); el._placePins();
  window.shot = h; return {rooms: rooms.length, selected: target && target.id, panel: el._ui.querySelector('.panel') && el._ui.querySelector('.panel').getBoundingClientRect().height};
}"""

def after(page):
    for theme in THEMES:
        for width, select in ((900, os.environ.get('SELECT', 'true')), (420, True)):
            r = page.evaluate(JS, [HOUSE, theme, width, select])
            page.wait_for_timeout(400)
            page.screenshot(path=f'{OUT}/{theme}-{width}.png', clip={'x': 0, 'y': 0, 'width': width, 'height': 600}, timeout=120000)
            page.evaluate('() => { window.shot.remove(); }')
            print(theme, width, r, flush=True)

result, errors = run(query=f'path=/dev/private/&model={HOUSE["file"]}&', after=after, timeout_ms=300000)
for e in errors[:5]:
    print('  error:', e[:200])
