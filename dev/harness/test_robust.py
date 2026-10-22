"""One broken entity (an object that is not in the model, a bad template) must not take the others
down: it is left out with a console warning, the entities after it keep their objects and update."""
import json
from run import run

JS = r"""async () => {
  const base = window.card;
  const names = []; base._scene.traverse(o => { if (o.isMesh && o.name) names.push(o.name); });
  const ents = [
    {entity: 'light.a', type3d: 'color', object_id: names[0], colorcondition: [{state: 'on', color: 'red'}]},
    {entity: 'light.a', type3d: 'color', object_id: 'no_such_object_42', colorcondition: [{state: 'on', color: 'red'}]},
    {entity: 'light.a', type3d: 'light', object_id: 'no_such_object_43', light: {lumens: 500}},
    {entity: 'sensor.t', type3d: 'text', object_id: names[1], text: {font: 'verdana', span: '100', textbgcolor: 'transparent', textfgcolor: 'blue'}},
    {entity: 'light.a', type3d: 'color', object_id: names[2], colorcondition: [{state: 'on', color: 'green'}]},
    {entity: 'fan.f', type3d: 'rotate', object_id: names[3], rotate: {axis: 'y', round_per_second: 1}},
  ];
  const cfg = Object.assign({}, base._config, {type: 'custom:floor3dx-card', pro_skill: 'mobile', shadow: 'no', entities: ents, object_groups: []});
  delete cfg.style;
  const warns = []; const orig = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); orig(...a); };
  const c = document.createElement('floor3dx-card'); c.setConfig(JSON.parse(JSON.stringify(cfg)));
  const mk = (on, t) => ({states: {'light.a': {state: on, attributes: {}}, 'sensor.t': {state: t, attributes: {}}, 'fan.f': {state: 'off', attributes: {}}}, language: 'en', themes: {}, config: {}, user: {}, callService() {}});
  c.hass = mk('on', '12');
  const h = document.createElement('div'); h.style.cssText = 'width:600px;height:400px'; document.body.appendChild(h); h.appendChild(c);
  const t0 = performance.now(); while (!c._modelready && performance.now() - t0 < 240000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 500));
  const hex = (n) => '#' + c._scene.getObjectByName(n).material.color.getHexString();
  const out = {ready: c._modelready, first: hex(names[0]), after: hex(names[2]), text: c._text[3], broken: Array.from(c._brokenEntities), warns: warns.filter(w => /left out/.test(w)).length, error: c._content.innerText};
  c.hass = mk('on', '34'); await new Promise(r => setTimeout(r, 300));
  out.textAfter = c._text[3];
  console.warn = orig;
  return out;
}"""

if __name__ == '__main__':
    result, errors = run(after=lambda page: page.evaluate(JS), timeout_ms=300000)
    print(json.dumps(result))
    r = result
    ok = True
    def check(name, cond):
        global ok
        print(('PASS ' if cond else 'FAIL ') + name)
        ok = ok and cond
    check('model ready, no error shown', r['ready'] and 'error' not in r['error'].lower())
    check('entities before and after the broken ones coloured', r['first'] == '#ff0000' and r['after'] == '#008000')
    check('text entity after the broken ones set up and updating', r['text'] == '12' and r['textAfter'] == '34')
    check('the broken entries named in the console and skipped', 1 in r['broken'] and r['warns'] >= 1)
    check('no page errors', not errors)
    raise SystemExit(0 if ok else 1)
