"""2.18: the card's title, icon and subtitle take Jinja templates, and the subtitle may be a list of readouts
(`entity` or `text`, `name`, `icon`, `break`) with icons in place of bullets, running to several lines.
Demo house, fake connection; also at phone width."""
import json, sys
from run import run

JS = r"""async (width) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const subs = []; const connection = { subscribeMessage(cb, msg) { subs.push({cb, msg}); return Promise.resolve(() => {}); } };
  const states = {'sensor.t': {state: '21.4', attributes: {unit_of_measurement: '°C', friendly_name: 'Outside'}}, 'binary_sensor.v': {state: 'on', attributes: {device_class: 'opening', friendly_name: 'Water valve'}}};
  const hass = {states, connection, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const TT = "{{ states('sensor.t') }} house", TI = "{{ 'mdi:home-flood' if is_state('binary_sensor.v','on') else 'mdi:home' }}", TS = "{{ 'Valve open' if is_state('binary_sensor.v','on') else 'Valve shut' }}", TV = "{{ 'mdi:valve-open' if is_state('binary_sensor.v','on') else 'mdi:valve-closed' }}";
  const render = () => subs.forEach(s => s.cb({result: s.msg.template === TT ? '21.4 house' : s.msg.template === TI ? 'mdi:home-flood' : s.msg.template === TS ? 'Valve open' : s.msg.template === TV ? 'mdi:valve-open' : '?'}));
  const mk = async (cfg) => {
    const el = document.createElement('floor3dx-rooms-card'); el.setConfig(Object.assign({card, rooms: [], height: '560px'}, cfg)); el.hass = hass;
    const d = document.createElement('div'); d.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:560px;z-index:99`; document.body.appendChild(d); d.appendChild(el);
    const t = performance.now(); while (!(el._slots.length && el._slots.every(s => s.el && s.el._modelready)) && performance.now() - t < 240000) await sleep(200);
    await sleep(300); render(); await sleep(300); el._render(); return {el, d};
  };
  const out = {width};
  // 1. templates in title, icon and a string subtitle
  let {el, d} = await mk({title: TT, icon: TI, subtitle: TS, icon_color: 'orange'});
  out.one = {title: el._ui.querySelector('.title .t')?.textContent, icon: el._ui.querySelector('.title > ha-icon')?.getAttribute('icon'), color: el._ui.querySelector('.title > ha-icon')?.style.color, sub: el._ui.querySelector('.title small')?.textContent, subs: subs.length};
  d.remove(); subs.length = 0;
  // 2. a subtitle as readouts: a sensor, a template with an icon template, a text item, over two lines
  ({el, d} = await mk({title: 'Banks House', subtitle: [{entity: 'sensor.t', icon: 'mdi:thermometer', break: 'yes'}, {entity: TS, icon: TV}, {text: 'Guests welcome', icon: 'mdi:account-group'}]}));
  const lines = Array.from(el._ui.querySelectorAll('.title .readouts.sub'));
  out.two = {lines: lines.length, spans: lines.map(l => Array.from(l.querySelectorAll('span')).map(x => ({icon: x.querySelector('ha-icon')?.getAttribute('icon') || null, text: x.textContent.trim(), bullet: getComputedStyle(x, ':before').content}))), noSmall: !el._ui.querySelector('.title small')};
  const tb = el._ui.querySelector('.title').getBoundingClientRect(), hb = el.getBoundingClientRect();
  out.two.box = {w: Math.round(tb.width), h: Math.round(tb.height), inside: tb.right <= hb.right && tb.bottom <= hb.bottom};
  // the valve shuts: the template readout and its icon follow
  subs.filter(s => s.msg.template === TS).forEach(s => s.cb({result: 'Valve shut'})); subs.filter(s => s.msg.template === TV).forEach(s => s.cb({result: 'mdi:valve-closed'})); await sleep(300); el._render();
  const second = el._ui.querySelectorAll('.title .readouts.sub')[1]?.querySelector('span');
  out.two.after = {icon: second?.querySelector('ha-icon')?.getAttribute('icon'), text: second?.textContent.trim()};
  d.remove(); subs.length = 0;
  // 3. nothing configured: no title box; a plain string subtitle still works
  ({el, d} = await mk({title: 'Plain', subtitle: 'Just words'})); out.three = {sub: el._ui.querySelector('.title small')?.textContent, subs: subs.length}; d.remove();
  return out;
}"""

if __name__ == '__main__':
    R = {}
    def after(page):
        R['wide'] = page.evaluate(JS, 900); R['phone'] = page.evaluate(JS, 390)
    _, errors = run(after=after, timeout_ms=600000)
    print(json.dumps(R))
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    w, p = R.get('wide', {}), R.get('phone', {})
    o = w.get('one') or {}
    check('title, icon and a string subtitle render as templates (three subscriptions)', o.get('title') == '21.4 house' and o.get('icon') == 'mdi:home-flood' and o.get('sub') == 'Valve open' and o.get('subs') == 3)
    check('the title icon takes icon_color', o.get('color') == 'orange')
    t = w.get('two') or {}; sp = t.get('spans') or []
    check('a readout-list subtitle: two lines after break: yes, no <small>', t.get('lines') == 2 and t.get('noSmall') is True and len(sp[0]) == 1 and len(sp[1]) == 2)
    check('sensor readout with its icon and no bullet; template readout with a template icon; a text item', sp and sp[0][0]['icon'] == 'mdi:thermometer' and sp[0][0]['text'] == 'Outside 21.4°C' and sp[0][0]['bullet'] == 'none' and sp[1][0]['icon'] == 'mdi:valve-open' and sp[1][0]['text'] == 'Valve open' and sp[1][1]['icon'] == 'mdi:account-group' and sp[1][1]['text'] == 'Guests welcome')
    check('a change of state flips the readout and its icon', (t.get('after') or {}).get('icon') == 'mdi:valve-closed' and (t.get('after') or {}).get('text') == 'Valve shut')
    check('the title box stays inside the card, wide and at phone width', (t.get('box') or {}).get('inside') is True and ((p.get('two') or {}).get('box') or {}).get('inside') is True and ((p.get('two') or {}).get('lines')) == 2)
    th = w.get('three') or {}
    check('a plain string subtitle is unchanged and subscribes to nothing', th.get('sub') == 'Just words' and th.get('subs') == 0)
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
