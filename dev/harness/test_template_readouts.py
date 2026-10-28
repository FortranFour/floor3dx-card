"""Template readouts and readout groups (`break`): a room entity whose `entity` is a Jinja template is rendered by Home Assistant
(render_template subscription) and shown as a readout under the room's name, with its label; it is
never a tile; a template error shows a marker; a template removed from the configuration is
unsubscribed. The HA connection is a fake."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const subs = []; let unsubbed = 0;
  const connection = { subscribeMessage(cb, msg) { const s = {cb, msg}; subs.push(s); return Promise.resolve(() => { unsubbed++; }); } };
  const states = {'sensor.p': {state: '12.3', attributes: {unit_of_measurement: 'W', friendly_name: 'Plug power'}}, 'light.a': {state: 'on', attributes: {friendly_name: 'Lamp'}}};
  const hass = {states, connection, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const T1 = "{% set p = states('sensor.p') | float(0) %}{{ 'Running' if p >= 5 else 'Idle' }} · {{ p | round(1) }} W";
  const T2 = "{{ states('sensor.p') }} raw";
  const T3 = "{{ 'Playing · ' ~ states('sensor.p') ~ ' W' }}";
  const rooms = [{id: 'r', name: 'Utility', floors: ['room_0_1'], entities: [{entity: 'light.a', status: T3}, {entity: T1, name: 'Washer', break: 'rule'}, {entity: T2, break: 'yes'}, {entity: 'sensor.p'}]}];
  const el = document.createElement('floor3dx-rooms-card');
  el.setConfig({card, rooms, title: 'T', height: '560px', sensor_tiles: false}); el.hass = hass;
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:560px;z-index:99'; document.body.appendChild(d); d.appendChild(el);
  const t = performance.now(); while (!(el._slots.length && el._slots.every(s => s.el && s.el._modelready)) && performance.now() - t < 240000) await sleep(200);
  await sleep(500);
  const out = {subs: subs.map(s => s.msg.type + ':' + (s.msg.template === T1 ? 'T1' : s.msg.template === T2 ? 'T2' : s.msg.template === T3 ? 'T3' : '?'))};
  el._select('r'); await sleep(300); el._render();
  out.pending = (el._ui.querySelector('.readouts') || {}).textContent || '';
  out.tileBefore = (el._ui.querySelector('.tile .tstate') || {}).textContent;
  subs.find(s => s.msg.template === T1).cb({result: 'Running · 12.3 W'}); subs.find(s => s.msg.template === T2).cb({result: '12.3 raw'}); subs.find(s => s.msg.template === T3).cb({result: 'Playing · 12.3 W'}); await sleep(300); el._render();
  out.tileStatus = (el._ui.querySelector('.tile .tstate') || {}).textContent;
  const readouts = () => Array.from(el._ui.querySelectorAll('.readouts span')).map(x => x.textContent.trim());
  out.readouts = readouts();
  out.lines = el._ui.querySelectorAll('.readouts').length; out.rules = el._ui.querySelectorAll('hr.rule').length;
  out.order = Array.from((el._ui.querySelector('.readoutbox') || el._ui.querySelector('.body')).children).filter(x => x.tagName !== 'BUTTON').map(x => x.tagName.toLowerCase() + (x.className ? '.' + x.className.split(' ')[0] : '')).slice(0, 4);
  out.tiles = Array.from(el._ui.querySelectorAll('.tile')).length;
  subs.find(s => s.msg.template === T2).cb({error: {message: 'boom'}}); await sleep(300); el._render();
  out.afterError = readouts(); out.alert = !!el._ui.querySelector('.readouts .alert');
  // the configuration drops T2: unsubscribed
  el.setConfig({card, rooms: [{id: 'r', name: 'Utility', floors: ['room_0_1'], entities: [{entity: 'light.a'}, {entity: T1, name: 'Washer'}]}], title: 'T', height: '560px'});
  await sleep(300); out.unsubbed = unsubbed; out.subsAfter = subs.length;
  // removed and put back within the grace period: the subscriptions are kept (HA re-attaches cards freely)
  d.remove(); await sleep(300); out.unsubbedRightAfterRemove = unsubbed; document.body.appendChild(d); await sleep(1800); out.unsubbedAfterReattach = unsubbed; out.subsAfterReattach = subs.length;
  // removed for good: dropped after the grace period
  d.remove(); await sleep(100); out.unsubbedAfterRemove = unsubbed; await sleep(1800); out.unsubbedAfterGrace = unsubbed;
  return out;
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        results.update(page.evaluate(JS))
    result, errors = run(after=after, timeout_ms=400000)
    print(json.dumps(results))
    r = results
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    check('one render_template subscription per template, status templates included', sorted(r.get('subs', [])) == ['render_template:T1', 'render_template:T2', 'render_template:T3'])
    check("a tile's status template replaces its status line once rendered", r.get('tileBefore') == '…' and r.get('tileStatus') == 'Playing · 12.3 W')
    check('a pending template shows an ellipsis', '…' in r.get('pending', ''))
    check('rendered results show as readouts, the label in front, beside the sensor', r.get('readouts') == ['Washer Running · 12.3 W', '12.3 raw', 'Plug Power 12.3 W'])
    check('templates are never tiles', r.get('tiles') == 1)
    check('break: rule and break: yes split the readouts into three lines with one hairline, in order', r.get('lines') == 3 and r.get('rules') == 1 and r.get('order') == ['p.readouts', 'hr.rule', 'p.readouts', 'p.readouts'])
    check('a template error shows a marker', r.get('alert') is True and any('⚠' in x for x in r.get('afterError', [])))
    check('a template dropped from the configuration is unsubscribed', r.get('unsubbed') == 2 and r.get('subsAfter') == 3)
    check('a card detached and re-attached within the grace period keeps its subscriptions (no resubscribe)', r.get('unsubbedRightAfterRemove') == 2 and r.get('unsubbedAfterReattach') == 2 and r.get('subsAfterReattach') == 3)
    check('a card removed for good drops them after the grace period, not at once', r.get('unsubbedAfterRemove') == 2 and r.get('unsubbedAfterGrace') == 3)
    check('no page errors', not errors)
    for e in errors[:5]:
        print('  error:', e[:300])
    sys.exit(1 if fails else 0)
