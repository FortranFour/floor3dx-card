"""GPU texture leaks, on the fake WebGL context (fakegl.js).

Every state change of a text entity draws a new canvas and a new texture; the previous one must be
disposed, or a readout that updates every few seconds leaks a texture each time for as long as the
dashboard is open. Pictures redraw into one canvas and must not create textures at all."""
import json
from run import run

JS = r"""async () => {
  const base = window.card;
  const names = []; base._scene.traverse(o => { if (o.isMesh && o.name && o.name.startsWith('wall')) names.push(o.name); }); // walls: large, in view, so their textures are really uploaded
  const ents = [
    {entity: 'sensor.t', type3d: 'text', object_id: names[0], text: {font: 'verdana', span: '100', textbgcolor: 'transparent', textfgcolor: 'blue'}},
    {entity: 'sensor.t', type3d: 'text', object_id: names[1], text: {font: 'verdana', span: '80', textbgcolor: 'yellow', textfgcolor: 'black'}},
    {entity: 'sensor.p', type3d: 'image', object_id: names[2], image: {url: '/dev/harness/assets/red.png', fit: 'stretch'}},
  ];
  const cfg = Object.assign({}, base._config, {type: 'custom:floor3dx-card', pro_skill: 'mobile', shadow: 'no', entities: ents, object_groups: []});
  delete cfg.style;
  const c = document.createElement('floor3dx-card'); c.setConfig(JSON.parse(JSON.stringify(cfg)));
  const mk = (t) => ({states: {'sensor.t': {state: t, attributes: {}}, 'sensor.p': {state: t, attributes: {}}}, language: 'en', themes: {}, config: {}, user: {}, callService() {}});
  c.hass = mk('v');
  const h = document.createElement('div'); h.style.cssText = 'width:600px;height:400px'; document.body.appendChild(h); h.appendChild(c);
  const t0 = performance.now(); while (!c._modelready && performance.now() - t0 < 120000) await new Promise(r => setTimeout(r, 100));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  await wait(500); c._render();
  const f = window.__fakegl; const before = {created: f.createTexture, deleted: f.deleteTexture, live: c._renderer.info.memory.textures};
  const N = 40;
  for (let k = 0; k < N; k++) { c.hass = mk('v' + k); await wait(30); c._render(); }
  await wait(500); c._render();
  const after = {created: f.createTexture, deleted: f.deleteTexture, live: c._renderer.info.memory.textures};
  return {N, before, after, net: (after.created - after.deleted) - (before.created - before.deleted)};
}"""

if __name__ == '__main__':
    r, errors = run(query='fakegl=1', after=lambda page: page.evaluate(JS), timeout_ms=200000)
    print(json.dumps(r)); print('errors:', errors[:3])
    ok = True
    def check(name, cond):
        global ok
        print(('PASS ' if cond else 'FAIL ') + name)
        ok = ok and cond
    check('text updates create textures (the new canvases)', r['after']['created'] - r['before']['created'] >= r['N'])
    check('and dispose the previous ones: net growth stays small', r['net'] <= 4)
    check('live texture count does not grow with the updates', r['after']['live'] - r['before']['live'] <= 4)
    check('no page errors', not errors)
    raise SystemExit(0 if ok else 1)
