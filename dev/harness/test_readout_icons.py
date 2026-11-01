"""2.18: a readout's `icon` - a name or a Jinja template Home Assistant renders to one - replaces its bullet,
scaled to the text; readout_icons: yes uses each entity's own icon for the rest. Demo house, fake connection."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const subs = []; const connection = { subscribeMessage(cb, msg) { subs.push({cb, msg}); return Promise.resolve(() => {}); } };
  const states = {'sensor.t': {state: '21.4', attributes: {unit_of_measurement: '°C', friendly_name: 'Temperature', icon: 'mdi:thermometer'}}, 'sensor.h': {state: '48', attributes: {unit_of_measurement: '%', friendly_name: 'Humidity'}}, 'binary_sensor.d': {state: 'on', attributes: {device_class: 'door', friendly_name: 'Side door'}}};
  const hass = {states, connection, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const TI = "{{ 'mdi:door-open' if is_state('binary_sensor.d','on') else 'mdi:door-closed' }}";
  const TR = "{{ states('sensor.h') }} % rh";
  const TC = "{{ 'red' if is_state('binary_sensor.d','on') else 'gray' }}";
  const mk = async (extra) => {
    const rooms = [{id: 'r', name: 'Hall', floors: ['room_0_1'], entities: [{entity: 'sensor.t'}, {entity: 'sensor.h', icon: 'mdi:water-percent', icon_color: '#2196f3'}, {entity: 'binary_sensor.d', icon: TI, icon_color: TC}, {entity: TR, name: 'Air', icon: 'mdi:weather-windy', icon_color: 'url(javascript:1)'}]}];
    const el = document.createElement('floor3dx-rooms-card'); el.setConfig(Object.assign({card, rooms, title: 'T', height: '560px'}, extra || {})); el.hass = hass;
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:560px;z-index:99'; document.body.appendChild(d); d.appendChild(el);
    const t = performance.now(); while (!(el._slots.length && el._slots.every(s => s.el && s.el._modelready)) && performance.now() - t < 240000) await sleep(200);
    await sleep(300); return {el, d};
  };
  const out = {};
  let {el, d} = await mk();
  out.subs = subs.map(s => s.msg.template === TI ? 'icon' : s.msg.template === TR ? 'readout' : '?');
  subs.forEach(s => s.cb({result: s.msg.template === TI ? 'mdi:door-open' : s.msg.template === TC ? 'red' : '48 % rh'})); await sleep(300);
  el._select('r'); await sleep(300); el._render();
  const spans = () => Array.from(el._ui.querySelectorAll('.readouts span')).map(x => ({ic: x.classList.contains('ic'), icon: x.querySelector('ha-icon')?.getAttribute('icon') || null, text: x.textContent.trim(), bullet: getComputedStyle(x, ':before').content}));
  out.rows = spans(); out.colors = Array.from(el._ui.querySelectorAll('.readouts .ri')).map(x => x.style.color);
  const icEl = el._ui.querySelector('.readouts .ri'); if (icEl) { const cs = getComputedStyle(icEl), fs = parseFloat(getComputedStyle(icEl.parentElement).fontSize); out.iconPx = parseFloat(cs.width); out.fontPx = fs; }
  // the template flips: the icon follows
  subs.find(s => s.msg.template === TI).cb({result: 'mdi:door-closed'}); await sleep(300); el._render();
  out.flipped = spans()[2]?.icon;
  // a template that renders to something that is not an icon name shows the bullet again
  subs.find(s => s.msg.template === TI).cb({result: 'not an icon'}); await sleep(300); el._render();
  out.invalid = spans()[2];
  d.remove();
  // readout_icons: yes - the entity's own icon for those without one
  ({el, d} = await mk({readout_icons: 'yes'})); subs.forEach(s => s.cb({result: s.msg.template === TI ? 'mdi:door-open' : s.msg.template === TC ? 'red' : '48 % rh'})); await sleep(300); el._select('r'); await sleep(300); el._render();
  out.entityIcons = spans().map(x => x.icon); d.remove();
  return out;
}"""

if __name__ == '__main__':
    r, errors = run(after=lambda page: page.evaluate(JS), timeout_ms=600000)
    print(json.dumps(r))
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    R = r.get('rows') or []
    check('an icon template is subscribed like a readout template', sorted(x for x in (r.get('subs') or []) if x != '?') == ['icon', 'readout'])
    check('icon_color: a CSS colour, a template rendering to one; a non-colour is ignored', r.get('colors') == ['rgb(33, 150, 243)', 'red', ''])
    check('a plain readout keeps its bullet; one with icon: shows the icon and no bullet', len(R) == 4 and R[0]['ic'] is False and R[0]['icon'] is None and R[1]['ic'] is True and R[1]['icon'] == 'mdi:water-percent' and R[1]['bullet'] == 'none')
    check('a Jinja icon template renders to the icon, on a sensor and on a template readout', R[2]['icon'] == 'mdi:door-open' and R[3]['icon'] == 'mdi:weather-windy' and R[3]['text'].startswith('Air'))
    check('the icon is scaled to the text (about 1.25 em)', 1.1 * r.get('fontPx', 99) < r.get('iconPx', 0) < 1.4 * r.get('fontPx', 0))
    check('the icon follows the template; a non-icon result falls back to the bullet', r.get('flipped') == 'mdi:door-closed' and (r.get('invalid') or {}).get('icon') is None and (r.get('invalid') or {}).get('ic') is False)
    check("readout_icons: yes gives the entity's own icon where none is set", (r.get('entityIcons') or [None])[0] == 'mdi:thermometer')
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
