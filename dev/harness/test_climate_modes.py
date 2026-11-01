"""2.19.4: a climate tile's `heat_source` switch as a pair of buttons under the modes (selecting the furnace leaves cool/auto first), and `modes` - a list, or a Jinja template rendering to one - limits the mode buttons
offered (the thermostat's own list otherwise; `off` stays the power switch). Demo house, fake connection."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const subs = []; const connection = { subscribeMessage(cb, msg) { subs.push({cb, msg}); return Promise.resolve(() => {}); } };
  const clim = (st) => ({state: st, attributes: {friendly_name: 'Thermostat', hvac_modes: ['off', 'heat', 'cool', 'heat_cool'], hvac_action: 'idle', temperature: 70, current_temperature: 72, min_temp: 50, max_temp: 90}});
  const states = {'climate.t': clim('heat'), 'switch.aux': {state: 'on', attributes: {}}};
  const hass = {states, connection, language: 'en', themes: {}, config: {unit_system: {temperature: '°F'}}, user: {}, callService() { return Promise.resolve(); }};
  const TM = "{{ ['heat'] if is_state('switch.aux','on') else ['heat','cool','heat_cool'] }}";
  const mk = async (ent) => {
    const el = document.createElement('floor3dx-rooms-card'); el.setConfig({card, height: '560px', guest_mode: false, rooms: [{id: 'r', name: 'Hall', floors: ['room_0_1'], entities: [ent]}]}); el.hass = hass;
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:560px;z-index:99'; document.body.appendChild(d); d.appendChild(el);
    const t = performance.now(); while (!(el._slots.length && el._slots.every(s => s.el && s.el._modelready)) && performance.now() - t < 240000) await sleep(200);
    await sleep(300); return {el, d};
  };
  const buttons = (el) => [...el._ui.querySelectorAll('.tile button[data-action="hvac"]')].map(b => b.dataset.mode);
  const out = {};
  let {el, d} = await mk({entity: 'climate.t'}); el._select('r'); await sleep(300); el._render(); out.all = buttons(el); d.remove();
  ({el, d} = await mk({entity: 'climate.t', modes: ['heat', 'cool']})); el._select('r'); await sleep(300); el._render(); out.list = buttons(el); d.remove();
  ({el, d} = await mk({entity: 'climate.t', modes: 'heat cool'})); el._select('r'); await sleep(300); el._render(); out.words = buttons(el); d.remove();
  ({el, d} = await mk({entity: 'climate.t', modes: TM})); subs.forEach(s => s.cb({result: "['heat']"})); await sleep(300); el._select('r'); await sleep(300); el._render(); out.tplAux = buttons(el); out.tplAuxSingle = !!el._ui.querySelector('.tile .seg');
  subs.forEach(s => s.cb({result: "['heat', 'cool', 'heat_cool']"})); await sleep(300); el._render(); out.tplPump = buttons(el); d.remove();
  // heat_source: two buttons; aux selected while cooling -> set heat first, then the switch on
  const calls = []; hass.callService = (dom, svc, data) => { calls.push([dom, svc, data]); return Promise.resolve(); };
  states['climate.t'] = clim('cool');
  ({el, d} = await mk({entity: 'climate.t', heat_source: {entity: 'switch.aux', off: 'Heat Pump', on: 'Aux Gas', on_icon: 'mdi:fire'}}));
  el._call = (id, dom, svc, data) => { calls.push([dom, svc, Object.assign({entity_id: id}, data || {})]); return Promise.resolve(true); };
  el._select('r'); await sleep(300); el._render();
  const hsb = [...el._ui.querySelectorAll('.tile button[data-action="heat-source"]')];
  out.hs = {labels: hsb.map(b => b.textContent.trim()), pressed: hsb.map(b => b.getAttribute('aria-pressed')), icon: hsb[1]?.querySelector('ha-icon')?.getAttribute('icon')};
  hsb[1].click(); await sleep(200); out.hsCalls = calls.map(c => c[1] + ':' + (c[2].hvac_mode || c[2].entity_id)); calls.length = 0;
  hsb[0].click(); await sleep(200); out.hsOff = calls.map(c => c[1] + ':' + c[2].entity_id); d.remove();
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
    check("without modes: all of the thermostat's modes but off", r.get('all') == ['heat', 'cool', 'heat_cool'])
    check('a list limits the buttons', r.get('list') == ['heat', 'cool'] and r.get('words') == ['heat', 'cool'])
    check('a template: one mode (aux gas) gives no mode row; the heat pump set brings the buttons back', r.get('tplAux') == [] and r.get('tplAuxSingle') is False and r.get('tplPump') == ['heat', 'cool', 'heat_cool'])
    h = r.get('hs') or {}
    check('heat_source: two labelled buttons, the current one pressed (switch on = aux)', h.get('labels') == ['Heat Pump', 'Aux Gas'] and h.get('pressed') == ['false', 'true'] and h.get('icon') == 'mdi:fire')
    check('choosing aux while cooling sets heat first, then turns the switch on; heat pump just turns it off', r.get('hsCalls') == ['set_hvac_mode:heat', 'turn_on:switch.aux'] and r.get('hsOff') == ['turn_off:switch.aux'])
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
