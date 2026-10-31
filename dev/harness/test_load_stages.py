"""2.17: the scene is set up in stages with the event loop released between them (the progress label
changes and the page stays responsive), the shaders are compiled before the first frame, and one console
line reports the timing. A reload during the set-up supersedes the older load. Demo house."""
import json, sys
from run import run, PORT

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {}; const HASS = {states: {}, language: 'en', themes: {}, config: {}, user: {}, callService() {}};
  // a second card, watched from the start: the labels its loading box shows, and whether the page ran
  // tasks between the stages (a timer that ticks while the scene is prepared)
  const c = document.createElement('floor3dx-card'); c.setConfig(Object.assign({}, window.card._config));
  const labels = []; const orig = c._showLoading.bind(c); c._showLoading = (step, a, b) => { if (!labels.includes(step)) labels.push(step); orig(step, a, b); };
  const infos = []; const ci = console.info; console.info = (...a) => { infos.push(a.join(' ')); ci(...a); };
  let ticks = 0; const tick = setInterval(() => ticks++, 1);
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:400px;z-index:99'; document.body.appendChild(host); host.appendChild(c); c.hass = HASS;
  const t0 = performance.now(); let sawLabelAfterModel = false, firstFrameBeforeReady = false;
  while (!c._modelready && performance.now() - t0 < 240000) { if (c._compiling && c._content.contains(c._loadingUi?.box)) sawLabelAfterModel = true; await sleep(20); }
  clearInterval(tick); console.info = ci;
  out.ready = c._modelready; out.labels = labels; out.ticks = ticks; out.boxOverCanvasWhileCompiling = sawLabelAfterModel; out.boxGone = !c._content.contains(c._loadingUi?.box);
  out.timing = infos.find((s) => /floor3dx .*programs/.test(s)) || null;
  out.programs = c._renderer.info.programs.length;
  // a frame draws after ready
  c._render(); const g = c._renderer.domElement.getContext('webgl2'); const px = new Uint8Array(4 * 64 * 64); g.readPixels(200, 150, 64, 64, g.RGBA, g.UNSIGNED_BYTE, px); let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i+1] + px[i+2] > 60) lit++; out.lit = lit / (px.length / 4);
  // a load superseded during set-up: the older one stops, the newer one completes alone
  const c2 = document.createElement('floor3dx-card'); c2.setConfig(Object.assign({}, window.card._config));
  let completions = 0; const req = c2._requestRender.bind(c2); c2._requestRender = (r) => { if (r === 'model_loaded') completions++; req(r); };
  host.appendChild(c2); c2.hass = HASS;
  const t1 = performance.now(); while (!(c2._loadTModel > 0) && performance.now() - t1 < 240000) await sleep(5);
  const seqBefore = c2._loadSeq; c2.rerender();
  const t2 = performance.now(); while (!c2._modelready && performance.now() - t2 < 240000) await sleep(50);
  await sleep(1500);
  out.superseded = {seqBumped: c2._loadSeq > seqBefore, completions, ready: c2._modelready};
  host.remove();
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
    L = r.get('labels') or []
    check('the loading box walks through the stages', all(x in L for x in ['preparing the 3D scene', 'placing lights and objects', 'finishing the scene']))
    check('the page runs other tasks between the stages', r.get('ticks', 0) > 3)
    check('the loading box stays over the canvas while the shaders compile, then goes', r.get('boxOverCanvasWhileCompiling') is True and r.get('boxGone') is True)
    check('one timing line names the model, scene and shader times and the program count', bool(r.get('timing')) and 'scene' in r['timing'] and 'shaders' in r['timing'] and r.get('programs', 0) > 0)
    check('ready means a frame draws', r.get('ready') is True and r.get('lit', 0) > 0.05)
    S = r.get('superseded') or {}
    check('a reload during the set-up supersedes the older load (one completion)', S.get('seqBumped') is True and S.get('completions') == 1 and S.get('ready') is True)
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
