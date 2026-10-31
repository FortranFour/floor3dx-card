"""2.17.1: `shadow_map` picks the shadow filter (pcf default, basic, vsm); the timing line names it and counts
the shadow-casting lights; the programs compiled before the first frame are the ones the frame uses (the
old PCFSoft request, gone from three r186, made every program compile twice). Demo house, six shadow lights."""
import json, sys
from run import run

JS = r"""async (mode) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const HASS = {states: {'light.a': {state: 'on', attributes: {}}}, language: 'en', themes: {}, config: {}, user: {}, callService() {}};
  // six shadow-casting lights (three point, three spot) on meshes of the demo house
  const names = []; window.card._scene.traverse(o => { if (o.isMesh && o.name && names.length < 6 && !/room_|floor|ground|wall/i.test(o.name)) names.push(o.name); });
  const ents = names.map((n, i) => ({entity: 'light.a', type3d: 'light', object_id: n, light: {lumens: 500, shadow: 'yes', decay: 1, light_direction: i % 2 ? {x: 0, y: -1, z: 0} : undefined}}));
  const base = Object.assign({}, window.card._config, {shadow: 'yes', lights: 'physical', entities: ents, object_groups: []}); if (mode) base.shadow_map = mode; else delete base.shadow_map;
  const infos = []; const ci = console.info; console.info = (...a) => { infos.push(a.join(' ')); ci(...a); };
  const c = document.createElement('floor3dx-card'); c.setConfig(base);
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:400px;z-index:99'; document.body.appendChild(host); host.appendChild(c); c.hass = HASS;
  const t0 = performance.now(); while (!c._modelready && performance.now() - t0 < 240000) await sleep(50);
  console.info = ci;
  const r = c._renderer, gl = r.getContext();
  const programs = r.info.programs || [];
  let frag = 0; for (const p of programs) { try { frag += gl.getShaderSource(p.fragmentShader).length; } catch (_) {} }
  const atTiming = Number(((infos.find((s) => /floor3dx .*programs/.test(s)) || '').match(/\((\d+) programs/) || [])[1]);
  c._render(); await sleep(100);
  const out = {type: r.shadowMap.type, atTiming, programs: (r.info.programs || []).length, fragChars: frag, timing: infos.find((s) => /floor3dx .*programs/.test(s)) || null};
  host.remove(); return out;
}"""

if __name__ == '__main__':
    R = {}
    def after(page):
        for m in ['', 'pcf_soft', 'basic']:
            R[m or 'default'] = page.evaluate(JS, m)
    _, errors = run(after=after, timeout_ms=600000)
    print(json.dumps(R))
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    d, p, b = R.get('default', {}), R.get('pcf_soft', {}), R.get('basic', {})
    check('default is pcf (1); pcf_soft is taken as pcf; basic gives 0', d.get('type') == 1 and p.get('type') == 1 and b.get('type') == 0)
    check('the programs compiled before the first frame are the ones it draws with (no second compile; the shadow depth materials aside)', all(0 < x.get('atTiming', 0) and x.get('programs', 99) - x['atTiming'] <= 2 for x in (d, p, b)))
    check('the timing line names the filter and counts the shadow-casting lights', 'pcf shadows' in (d.get('timing') or '') and 'basic shadows' in (b.get('timing') or '') and '6 shadow-casting lights' in (d.get('timing') or ''))
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
