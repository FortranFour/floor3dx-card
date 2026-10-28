"""Rendering effects: depth of field (`bokeh: yes`) and ambient occlusion (`ao: yes`) through the composer, SMAA
with them. The frame still renders (no errors, the model visible), a strong setting changes the picture more than a
weak one, AO darkens the model where surfaces meet without touching the background, and switching every effect off
releases the composer and gives the plain frame back. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const card = window.card;
  const grab = () => { card._render(); const c = card._renderer.domElement; const g = c.getContext('webgl2') || c.getContext('webgl'); const w = g.drawingBufferWidth, h = g.drawingBufferHeight; const px = new Uint8Array(w * h * 4); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px); return {w, h, px}; };
  const diff = (a, b) => { let d = 0, n = 0; for (let i = 0; i < a.px.length; i += 16) { d += Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i+1] - b.px[i+1]) + Math.abs(a.px[i+2] - b.px[i+2]); n++; } return d / n; };
  const lit = (a) => { let n = 0; for (let i = 0; i < a.px.length; i += 16) if (a.px[i] + a.px[i+1] + a.px[i+2] > 60) n++; return n / (a.px.length / 16); };
  const out = {};
  card._config.ao = 'no'; const plain = grab(); out.plainLit = lit(plain); out.linearDepth = !card._renderer.capabilities.logarithmicDepthBuffer;
  card._config.bokeh = 'yes'; card._config.bokeh_strength = 10; card._config.bokeh_blur = 0.03;
  const strong = grab(); out.strongLit = lit(strong); out.hasComposer = !!card._fx; out.strongDiff = diff(plain, strong);
  card._config.bokeh_strength = 1; card._config.bokeh_blur = 0.002;
  const weak = grab(); out.weakDiff = diff(plain, weak);
  card._config.bokeh = 'no';
  const back = grab(); out.released = !card._fx; out.backDiff = diff(plain, back);
  // ambient occlusion: the model gets darker where surfaces meet, the background stays
  card._config.ao = 'yes'; card._config.ao_strength = 2;
  const ao = grab(); out.aoComposer = !!card._fx; out.aoDiff = diff(plain, ao);
  const sum = (a) => { let m = 0, b = 0, n = 0; for (let i = 0; i < a.px.length; i += 16) { const l = a.px[i] + a.px[i+1] + a.px[i+2]; if (l > 60) { m += l; n++; } } return {model: n ? m / n : 0}; };
  out.plainModel = sum(plain).model; out.aoModel = sum(ao).model;
  // the background pixel (top-left corner) is untouched by AO
  out.bgPlain = [plain.px[0], plain.px[1], plain.px[2]]; out.bgAo = [ao.px[0], ao.px[1], ao.px[2]];
  card._config.ao_quality = 'low'; const aoLow = grab(); out.aoLowDiff = diff(plain, aoLow);
  card._config.ao = 'no'; const back2 = grab(); out.released2 = !card._fx; out.back2Diff = diff(plain, back2);
  return out;
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        results.update(page.evaluate(JS))
    result, errors = run(query='ao=yes', after=after, timeout_ms=400000)
    print(json.dumps(results))
    r = results; fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    check('bokeh on: the composer renders and the model is still there', r.get('hasComposer') and r.get('strongLit', 0) > 0.5 * r.get('plainLit', 1))
    check('a strong setting changes the picture', r.get('strongDiff', 0) > 2)
    check('a weak setting changes it much less', r.get('weakDiff', 99) < r.get('strongDiff', 0) * 0.5)
    check('bokeh off: composer released, the plain frame is back', r.get('released') and r.get('backDiff', 99) < 0.5)
    check('ao on: the composer renders and the model is darker where surfaces meet', r.get('aoComposer') and r.get('aoDiff', 0) > 1 and r.get('aoModel', 999) < r.get('plainModel', 0))
    check('ao leaves the background colour alone', all(abs(a - b) <= 2 for a, b in zip(r.get('bgPlain', [0,0,0]), r.get('bgAo', [9,9,9]))))
    check('ao low quality renders too', r.get('aoLowDiff', 0) > 1)
    check('ao off: composer released', r.get('released2') and r.get('back2Diff', 99) < 0.5)
    check('with ao configured the renderer uses a linear depth buffer', r.get('linearDepth'))
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
