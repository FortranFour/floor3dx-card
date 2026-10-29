"""Close-ups of lamps on the house (dev/private) from a card's YAML, for tuning: the camera looks at a
named object from a given offset, with a list of entities on and optional patches to light rows.

    CARD=card.yaml SHOTS='[{"name":"bulb","object":"83_3","on":["switch.x"],"offset":[300,350,300],"patch":{"83_3":{"light":{...}}}}]' \
        python3 dev/harness/render_spot.py <out-dir>
`patch` maps object_id -> partial entity row merged over the card's row(s) of that object (light rows).
Per shot: `object`, `offset`, `on` (entities on), `hour`, `projection` (three_point|two_point), `fov`, `card`
(top-level card options; these and `patch` / `light_rooms` make the card rebuild, the rest reuse it)."""
import json, os, sys, yaml
from run import run

OUT = sys.argv[1] if len(sys.argv) > 1 else 'dev/out/spot'
os.makedirs(OUT, exist_ok=True)
src = yaml.safe_load(open(os.environ['CARD']))
def find(v):
    if isinstance(v, dict):
        if 'objfile' in v and 'entities' in v: return v
        for x in v.values():
            r = find(x)
            if r: return r
    if isinstance(v, list):
        for x in v:
            r = find(x)
            if r: return r
card = find(src)
SHOTS = json.loads(os.environ['SHOTS'])
W, H = [int(x) for x in os.environ.get('SIZE', '640x480').split('x')]
HOUR = float(os.environ.get('HOUR', '13'))

# One card per distinct configuration (card options, patches); shots that only move the camera, change
# the time of day, the lamps that are on or the projection reuse it, so a run with many shots loads the
# model once instead of once per shot (four minutes each on the house).
BUILD = r"""async ([card, shot, w, h, hour]) => {
  const cfg = JSON.parse(JSON.stringify(card)); cfg.type = 'custom:floor3dx-card'; cfg.path = '/dev/private/';
  delete cfg.card_mod; delete cfg.camera_rotate; delete cfg.header; cfg.style = `height:${h}px;width:${w}px;`;
  cfg.daylight = Object.assign({}, cfg.daylight || {}, {time: hour});
  const merge = (a, b) => { for (const k of Object.keys(b)) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else if (b[k] === null) delete a[k]; else a[k] = b[k]; } return a; };
  if (shot.patch) cfg.entities.forEach(e => { const p = shot.patch[e.object_id]; if (p && (!p.type3d || p.type3d === e.type3d) && (p.type3d || e.type3d === 'light')) merge(e, p); });
  if (shot.light_rooms) cfg.light_rooms = shot.light_rooms;
  if (shot.card) Object.assign(cfg, shot.card);
  if (window.shot) { window.shot.remove(); window.shot = null; }
  const states = {};
  cfg.entities.forEach(e => { if (e.entity && (!states[e.entity] || e.entity_template)) states[e.entity] = (e.type3d === 'light' || e.type3d === 'color') && !e.entity_template ? {state: 'off', attributes: {}} : {state: '0', attributes: {}}; });
  const c = document.createElement('floor3dx-card'); c.setConfig(cfg); window.shotStates = states; window.shotCard = c;
  c.hass = {states: JSON.parse(JSON.stringify(states)), language: 'en', themes: {}, config: {}, user: {}, callService() {}};
  const host = document.createElement('div'); host.id = 'shot'; host.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;z-index:99;background:#000`; document.body.appendChild(host); host.appendChild(c);
  const t0 = performance.now(); while (!c._modelready && performance.now() - t0 < 300000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 1500));
  window.shot = host; return {built: true};
}"""

JS = r"""async ([shot, w, h, hour]) => {
  const c = window.shotCard; if (!c || !c._modelready) return {error: 'no card'};
  // the lamps that are on, the time of day, the projection: all live changes
  const states = JSON.parse(JSON.stringify(window.shotStates));
  (shot.on || []).forEach(id => { states[id] = {state: 'on', attributes: {brightness: 255}}; });
  c.hass = {states, language: 'en', themes: {}, config: {}, user: {}, callService() {}};
  if (c._daylight && c.setDaylightTime) c.setDaylightTime(shot.hour !== undefined ? shot.hour : hour);
  await new Promise(r => setTimeout(r, 400));
  // back to the reference lens before aiming, so every shot's offset means the same thing
  if (c.setProjection) c.setProjection({fov: 45});
  const o = c._scene.getObjectByName(shot.object); if (!o) return {error: 'no object ' + shot.object};
  const box = new (c._camera.position.constructor)(); const B = new (Object.getPrototypeOf(o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox)).constructor)(); B.setFromObject(o); const ce = B.getCenter(box.clone());
  const off = shot.offset || [250, 300, 250];
  const aim = () => { c._renderer.setSize(w, h, true); c._camera.aspect = w / h; c._camera.updateProjectionMatrix(); c._camera.position.set(ce.x + off[0], ce.y + off[1], ce.z + off[2]); c._controls.target.copy(ce); c._controls.update(); c._render(); };
  aim(); await new Promise(r => setTimeout(r, 600)); aim(); await new Promise(r => setTimeout(r, 300)); aim();
  // the projection after the aim: a lens change then keeps this framing (the camera moves along its line of sight)
  if (shot.projection || shot.fov) { c.setProjection({projection: shot.projection || 'three_point', fov: shot.fov || 45}); c._render(); await new Promise(r => setTimeout(r, 300)); c._render(); }
  let lamps = []; c._scene.traverse(l => { if ((l.isPointLight || l.isSpotLight) && (l.intensity > 0 || (shot.all && l.name.includes(shot.all)))) { const p = l.getWorldPosition(l.position.clone()); lamps.push({name: l.name, type: l.isSpotLight ? 'spot' : 'point', intensity: +l.intensity.toFixed(2), distance: l.distance, decay: l.decay, angle: l.angle ? +(l.angle * 180 / Math.PI).toFixed(1) : null, at: p.toArray().map(v => Math.round(v))}); } });
  const sunL = c._daylight && c._daylight.sunLight && c._daylight.sunLight();
  return {sun: sunL ? {intensity: +sunL.intensity.toFixed(2), dir: sunL.position.clone().sub(sunL.target.position).normalize().toArray().map(v => +v.toFixed(2))} : null, projection: c.projectionState ? c.projectionState() : null, cam: c._camera.position.toArray().map(Math.round), canvas: [c._renderer.domElement.width, c._renderer.domElement.height], centre: ce.toArray().map(v => Math.round(v)), size: B.getSize(box.clone()).toArray().map(v => Math.round(v)), lamps};
}"""

def build_key(shot):
    return json.dumps({k: shot.get(k) for k in ('patch', 'light_rooms', 'card')}, sort_keys=True)

def after(page):
    built = None
    for shot in SHOTS:
        key = build_key(shot)
        if key != built:
            page.evaluate(BUILD, [card, shot, W, H, HOUR]); built = key
        r = page.evaluate(JS, [shot, W, H, HOUR])
        page.wait_for_timeout(300)
        page.screenshot(path=f"{OUT}/{shot['name']}.png", clip={'x': 0, 'y': 0, 'width': W, 'height': H}, timeout=180000)
        print(shot['name'], json.dumps(r), flush=True)
    page.evaluate('() => { if (window.shot) window.shot.remove(); }')

result, errors = run(query=f'path=/dev/private/&model={card["objfile"]}&', after=after, timeout_ms=600000)
for e in errors[:5]:
    print('  error:', e[:300])
