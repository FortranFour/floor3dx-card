"""merge_static: the meshes no configuration entry refers to are merged per level and material; the
ones it refers to (entities, groups, hide_objects, transparent rules, look.keep, * patterns) stay as
they are, and the picture is the same (render_views.py compares the merged views to the baseline)."""
import json
from run import run

JS = r"""async () => {
  const base = window.card;
  const names = []; base._scene.traverse(o => { if (o.isMesh && o.name) names.push(o.name); });
  const walls = names.filter(n => n.startsWith('wall')).slice(0, 3);
  const other = names.filter(n => !n.startsWith('wall'));
  const ents = [
    {entity: 'light.a', type3d: 'light', object_id: walls[0], light: {lumens: 500, distance: 300}},
    {entity: 'light.a', type3d: 'color', object_id: walls[1], colorcondition: [{state: 'on', color: 'red'}]},
    {entity: 'sensor.t', type3d: 'text', object_id: other[0], text: {font: 'verdana', span: '100', textbgcolor: 'transparent', textfgcolor: 'blue'}},
    {entity: 'light.a', type3d: 'hide', object_id: '<grp>', hide: {state: 'on'}},
  ];
  const cfg = Object.assign({}, base._config, {type: 'custom:floor3dx-card', pro_skill: 'mobile', shadow: 'no', entities: ents, merge_static: 'yes',
    object_groups: [{object_group: 'grp', objects: [{object_id: other[1]}]}], hide_objects: other[2], transparent: [{objects: other[3], transparency: 50}],
    look: {theme: 'day', edge_skip: 'seams', keep: other[4]}});
  delete cfg.style;
  const logs = []; const orig = console.log; console.log = (...a) => { logs.push(a.join(' ')); orig(...a); };
  const c = document.createElement('floor3dx-card'); c.setConfig(JSON.parse(JSON.stringify(cfg)));
  c.hass = {states: {'light.a': {state: 'on', attributes: {}}, 'sensor.t': {state: '12', attributes: {}}}, language: 'en', themes: {}, config: {}, user: {}, callService() {}};
  const h = document.createElement('div'); h.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px;z-index:99'; document.body.appendChild(h); h.appendChild(c);
  const t0 = performance.now(); while (!c._modelready && performance.now() - t0 < 240000) await new Promise(r => setTimeout(r, 200));
  console.log = orig;
  const out = {log: logs.find(l => /merge_static/.test(l)) || ''};
  const kept = [walls[0], walls[1], other[0], other[1], other[2], other[3], other[4]];
  out.kept = kept.map(n => { const o = c._scene.getObjectByName(n); return o ? [n, o.visible, o.material && o.material.name] : [n, 'MISSING']; });
  const merged = []; c._scene.traverse(o => { if (o.name && o.name.startsWith('f3dx_merged')) merged.push([o.name, o.userData.f3dxMerged ? o.userData.f3dxMerged.length : 'lines', o.visible]); });
  out.merged = merged.length; out.mergedLines = merged.filter(m => m[1] === 'lines').length;
  out.meshesLeft = c._levels.reduce((n, l) => n + (l ? l.children.filter(o => o.isMesh && !o.name.startsWith('f3dx_')).length : 0), 0);
  out.raycastHasMerged = c._raycastinglevels.some(l => l.some(o => o.name && o.name.startsWith('f3dx_merged')));
  out.raycastHasOriginal = c._raycastinglevels.some(l => l.some(o => o.userData && o.userData.f3dxMergedInto));
  out.raycastHasGone = c._raycastinglevels.some(l => l.some(o => !o.parent)); // a merged original is detached from its level
  out.raycastCount = c._raycastinglevels.reduce((n, l) => n + l.length, 0);
  c._renderer.render(c._scene, c._camera); out.calls = c._renderer.info.render.calls;
  // level menu: hiding every level hides the merged meshes too
  c._setVisibleLevel(999); c._renderer.render(c._scene, c._camera); out.callsNoLevel = c._renderer.info.render.calls; c._setVisibleLevel(-1);
  // the hidden group object is hidden (hide type), the hide_objects one too
  out.hiddenOk = !c._scene.getObjectByName(other[1]).visible && !c._scene.getObjectByName(other[2]).visible;
  out.total = names.length;
  out.editorNames = c._modelObjectNames().length; // what the editor's object menus get
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
    check('most meshes merged, a few merged objects left', r['merged'] > 0 and r['meshesLeft'] < r['total'] / 4)
    check('every configured object still there by name', all(k[1] != 'MISSING' for k in r['kept']))
    check('text panel keeps its own material', any(k[2] and str(k[2]).startswith('f3dmat') for k in r['kept']))
    check('edge lines merged too', r['mergedLines'] > 0)
    check('raycasting list: merged meshes in (a tap on a wall still lands on the wall), originals out', r['raycastHasMerged'] and not r['raycastHasGone'] and r['raycastCount'] < r['total'])
    check('draw calls well below the mesh count', r['calls'] < r['total'] / 3)
    check('level menu still hides the merged meshes', r['callsNoLevel'] < r['calls'] / 4)
    check('hide type and hide_objects still work', r['hiddenOk'])
    check('the editor still gets the full object list (holes and slabs never were in it)', r['editorNames'] > r['total'] * 0.9)
    check('no page errors', not errors)
    raise SystemExit(0 if ok else 1)
