"""2.19.2: the room panel's subtitle. room_summary: full names what is on (counts past three), reports the
climate, shades, media, alarm and the readouts marked summary: yes, then the doors, locks and windows; basic
(the default) is the count and the doors as before; a room's `description` may be a Jinja template. The
room icon and the close button sit on the name's line however long the subtitle runs. Demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const subs = []; const connection = { subscribeMessage(cb, msg) { subs.push({cb, msg}); return Promise.resolve(() => {}); } };
  const S = (state, attributes = {}) => ({state, attributes});
  const states = {
    'light.a': S('on', {friendly_name: 'Island Lights'}), 'light.b': S('off', {friendly_name: 'Sink Light'}), 'switch.c': S('on', {friendly_name: 'Counter Lights'}), 'switch.d': S('on', {friendly_name: 'Radio'}), 'switch.e': S('on', {friendly_name: 'Fan'}),
    'media_player.tv': S('playing', {friendly_name: 'TV'}), 'climate.t': S('heat', {friendly_name: 'Thermostat', hvac_action: 'heating', temperature: 70}),
    'cover.s1': S('closed', {friendly_name: 'Shade 1', device_class: 'shade'}), 'cover.s2': S('open', {friendly_name: 'Shade 2', device_class: 'shade'}),
    'cover.g': S('closed', {friendly_name: 'Garage Door', device_class: 'garage'}), 'lock.l': S('locked', {friendly_name: 'Side Door'}),
    'alarm_control_panel.p': S('armed_home', {}), 'sensor.p': S('12.3', {unit_of_measurement: 'W', friendly_name: 'Plug'}),
  };
  const hass = {states, connection, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const TW = "{{ 'Running' if states('sensor.p') | float(0) > 5 else 'Idle' }}", TD = "{{ 'Quiet night' if is_state('light.a','off') else 'Lights on in here' }}";
  const mk = async (cfg) => {
    const el = document.createElement('floor3dx-rooms-card'); el.setConfig(Object.assign({card, height: '560px'}, cfg)); el.hass = hass;
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:560px;z-index:99'; document.body.appendChild(d); d.appendChild(el);
    const t = performance.now(); while (!(el._slots.length && el._slots.every(s => s.el && s.el._modelready)) && performance.now() - t < 240000) await sleep(200);
    await sleep(300); subs.forEach(s => s.cb({result: s.msg.template === TW ? 'Running' : 'Lights on in here'})); await sleep(300); return {el, d};
  };
  const sub = (el) => el._ui.querySelector('.panelhead p')?.textContent.trim();
  const rooms = (extra) => [Object.assign({id: 'r', name: 'Kitchen', floors: ['room_0_1'], entities: [
    {entity: 'light.a'}, {entity: 'light.b'}, {entity: 'switch.c'}, {entity: 'media_player.tv'}, {entity: 'climate.t'}, {entity: 'cover.s1'}, {entity: 'cover.s2'}, {entity: 'cover.g'}, {entity: 'lock.l'}, {entity: 'alarm_control_panel.p'},
    {entity: TW, name: 'Washer', summary: 'yes'}, {entity: 'sensor.p', name: 'Plug', summary: true}]}, extra || {})];
  const out = {};
  // basic (default)
  let {el, d} = await mk({rooms: rooms()}); el._select('r'); await sleep(300); el._render(); out.basic = sub(el);
  // the header: the icon and the close button sit on the name's line
  const head = el._ui.querySelector('.panelhead'), ic = head.querySelector('.roomicon').getBoundingClientRect(), h3 = head.querySelector('h3').getBoundingClientRect(), cl = head.querySelector('.close').getBoundingClientRect(), p = head.querySelector('p').getBoundingClientRect();
  out.head = {iconMid: Math.round(ic.top + ic.height / 2), nameMid: Math.round(h3.top + h3.height / 2), closeMid: Math.round(cl.top + cl.height / 2), pTop: Math.round(p.top), icBottom: Math.round(ic.bottom)};
  d.remove();
  // full, card-wide
  ({el, d} = await mk({rooms: rooms(), room_summary: 'full'})); el._select('r'); await sleep(300); el._render(); out.full = sub(el);
  // more than three on: a count
  states['switch.d'] = S('on', {friendly_name: 'Radio'}); el.setConfig({card, height: '560px', room_summary: 'full', rooms: rooms({entities: [{entity: 'light.a'}, {entity: 'switch.c'}, {entity: 'switch.d'}, {entity: 'switch.e'}, {entity: 'light.b'}]})}); el.hass = Object.assign({}, hass); el._select('r'); await sleep(300); el._render(); out.many = sub(el);
  d.remove();
  // a room overrides the card: basic; another: a description template
  ({el, d} = await mk({rooms: rooms({summary: 'basic'}), room_summary: 'full'})); el._select('r'); await sleep(300); el._render(); out.override = sub(el); d.remove();
  ({el, d} = await mk({rooms: rooms({description: TD})})); el._select('r'); await sleep(300); el._render(); out.described = sub(el); d.remove();
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
    check('basic (default) is unchanged: the count and the doors', r.get('basic') == '3 on · Doors shut & locked')
    f = r.get('full') or ''
    check('full: names what is on, then media, climate, shades, alarm, the chosen readouts and the doors', f == 'Island Lights, Counter Lights on · TV playing · Heating to 70° · 1 of 2 shades up · Alarm armed home · Washer Running · Plug 12.3 W · Doors shut & locked')
    check('full: past three on, a count by kind', r.get('many') == '2 lights and 2 others on')
    check("a room's summary: basic overrides the card's full", r.get('override') == '3 on · Doors shut & locked')
    check('a description template renders live', r.get('described') == 'Lights on in here')
    h = r.get('head') or {}
    check('the room icon and the close button are centred on the name line, above the subtitle', abs(h.get('iconMid', 0) - h.get('nameMid', 99)) <= 3 and abs(h.get('closeMid', 0) - h.get('nameMid', 99)) <= 4)
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
