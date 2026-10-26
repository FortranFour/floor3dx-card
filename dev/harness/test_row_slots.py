"""Every entity row keeps its slot: a gesture row without an entity (or an entity HA lacks) before a
lamp used to shift every later row onto its neighbour's state, so a lamp that was on at load came up
dark until its switch next changed, and a text panel read the wrong value. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const names = []; base._scene.traverse(o => { if (o.isMesh && o.name && o.name.startsWith('wall')) names.push(o.name); });
  const ents = [
    {gesture: {domain: 'script', service: 'x'}, object_id: names[0], type3d: 'gesture'},            // no entity
    {entity: 'light.missing_in_ha', type3d: 'color', object_id: names[1], colorcondition: [{state: 'on', color: 'red'}]}, // no state
    {entity: 'light.lamp', type3d: 'light', object_id: names[2], light: {lumens: 900, distance: 300, decay: 1}},
    {entity: 'sensor.t', type3d: 'text', object_id: names[3], text: {font: 'verdana', span: '100', textbgcolor: 'transparent', textfgcolor: 'blue'}},
    {entity: 'light.lamp2', type3d: 'light', object_id: names[4], light: {lumens: 900, distance: 300, decay: 1}},
  ];
  const cfg = Object.assign({}, base._config, {type: 'custom:floor3dx-card', shadow: 'no', entities: ents, object_groups: []}); delete cfg.style;
  const c = document.createElement('floor3dx-card'); c.setConfig(JSON.parse(JSON.stringify(cfg)));
  const mk = (lamp, lamp2, t) => ({states: {'light.lamp': {state: lamp, attributes: {brightness: 255}}, 'light.lamp2': {state: lamp2, attributes: {brightness: 120}}, 'sensor.t': {state: t, attributes: {}}}, language: 'en', themes: {}, config: {}, user: {}, callService() {}});
  c.hass = mk('on', 'off', '21.5');
  const h = document.createElement('div'); h.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:400px;z-index:99'; document.body.appendChild(h); h.appendChild(c);
  const t0 = performance.now(); while (!c._modelready && performance.now() - t0 < 240000) await sleep(200);
  await sleep(600); c._render();
  const lamp = () => c._findObject(names[2] + '_light').intensity, lamp2 = () => c._findObject(names[4] + '_light').intensity;
  const out = {slots: c._states.length, rows: ents.length, states: c._states.slice(), lampOn: lamp(), lamp2Off: lamp2(), textState: c._text[3], brightness: c._brightness.slice()};
  c.hass = mk('on', 'on', '22.0'); await sleep(200); c._render();
  out.lamp2On = lamp2(); out.textAfter = c._text[3];
  h.remove();
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
    check('one slot per row, rows without a state included', r.get('slots') == r.get('rows'))
    check('the lamp after a gesture row and a missing entity is lit at load', (r.get('lampOn') or 0) > 0 and r.get('lamp2Off') == 0)
    check('the text row holds its own value', r.get('textState') == '21.5' and r.get('textAfter') == '22.0')
    check('brightness sits in its own slot (120 for the second lamp)', (r.get('brightness') or [])[4] == 120)
    check('a later change lights the second lamp', (r.get('lamp2On') or 0) > 0)
    check('no page errors', not errors)
    for e in errors[:5]:
        print('  error:', e[:300])
    sys.exit(1 if fails else 0)
