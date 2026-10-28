"""A spot light with shadows lights what it points at. With the logarithmic depth buffer three.js's shadow
pass wrote logarithmic depth into a spot's shadow map while the receiver compared perspective depth, so a
spot with `shadow: yes` lit nothing (or the wrong things); with shadows on the card now uses a linear depth
buffer. Point lights and the sun were never affected. Runs on the demo house: a wall lamp pointed down."""
import json, sys
from run import run

JS = r"""async (opt) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const old = window.card; const cfg = JSON.parse(JSON.stringify(old._config));
  let cands = []; old._scene.traverse(o => { if (o.isMesh && o.name && !/room_|floor|ground|wall/i.test(o.name)) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); const s = b.max.clone().sub(b.min); if (s.x < 150 && s.z < 150 && s.y < 60 && b.min.y > 150) cands.push({name: o.name, y: b.min.y, cx: (b.min.x+b.max.x)/2, cz: (b.min.z+b.max.z)/2}); } });
  cands.sort((a,b) => b.y - a.y); const pick = cands[0];
  const fam = pick.name.replace(/_\d+$/, ''); const parts = []; old._scene.traverse(o => { if (o.isMesh && o.name && o.name.startsWith(fam)) parts.push(o.name); });
  cfg.lights = 'physical'; cfg.color_management = 'managed'; cfg.shadow = 'yes'; cfg.globalLightPower = '0.4'; cfg.extralightmode = 'yes';
  if (opt.depth) cfg.depth_buffer = opt.depth; else delete cfg.depth_buffer;
  cfg.object_groups = [{object_group: 'lamp', objects: parts}];
  cfg.entities = [{entity: 'light.a', type3d: 'light', object_id: '<lamp>', light: {lumens: 500, offset: {x: 0, y: -5, z: 0}, light_direction: opt.point ? undefined : {x: 0, y: -1, z: 0}, vertical_alignment: 'bottom', shadow: opt.shadow, light_object: pick.name, angle: 75, decay: 1}}];
  old.remove();
  const card = document.createElement('floor3dx-card'); card.setConfig(cfg); card.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px;display:block';
  card.hass = {states: {'light.a': {state: 'on', attributes: {brightness: 255}}}, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  document.body.appendChild(card); window.card = card;
  await new Promise(r => { const t = setInterval(() => { if (card._modelready) { clearInterval(t); r(); } }, 100); });
  await sleep(500); card._resizeCanvas(); await sleep(200);
  card._camera.position.set(pick.cx + 300, pick.y + 80, pick.cz + 300); card._controls.target.set(pick.cx, pick.y - 150, pick.cz); card._controls.update();
  card._renderer.shadowMap.needsUpdate = true; card._render();
  const gl = card._renderer.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w*h*4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i+1] + px[i+2];
  let l; card._scene.traverse(o => { if (o.isSpotLight || o.isPointLight) l = o; });
  return {mean: sum / (w*h*3), linear: !card._renderer.capabilities.logarithmicDepthBuffer, casts: l && l.castShadow, bias: l && l.shadow.bias, normalBias: l && l.shadow.normalBias};
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        for name, opt in {'spot_noshadow': {'shadow': 'no'}, 'spot_shadow': {'shadow': 'yes'}, 'point_shadow': {'shadow': 'yes', 'point': 1}, 'spot_shadow_log': {'shadow': 'yes', 'depth': 'log'}}.items():
            results[name] = page.evaluate(JS, opt); page.wait_for_timeout(200)
    result, errors = run(after=after, timeout_ms=400000)
    print(json.dumps(results))
    r = results; fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    a, b, c, d = r.get('spot_noshadow', {}), r.get('spot_shadow', {}), r.get('point_shadow', {}), r.get('spot_shadow_log', {})
    check('shadow: yes makes the renderer use a linear depth buffer', b.get('linear') is True and a.get('linear') is True)
    check('the spot with shadows lights the floor like the spot without (within 5%)', b.get('casts') is True and abs(b.get('mean', 0) - a.get('mean', 1)) < 0.05 * a.get('mean', 1))
    check('a point light with shadows lights it too', c.get('casts') is True and c.get('mean', 0) > 0.9 * a.get('mean', 1))
    check('a spot takes no depth bias and a normal bias of one unit', b.get('bias') == 0 and b.get('normalBias') == 1)
    check('depth_buffer: log is honoured as an override', d.get('linear') is False)
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
