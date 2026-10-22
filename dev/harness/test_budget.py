"""Draw-call budget, on the fake WebGL context (fakegl.js): no GPU, a couple of seconds.

The demo model costs one draw call per mesh; with merge_static most of them fold into one per level
and material. A change that quietly undoes the merging, or adds a draw call per object somewhere,
fails here."""
import json
from run import run

JS = r"""() => { const c = window.card; c._render(); const i = c._renderer.info;
  let meshes = 0; c._scene.traverse(o => { if (o.isMesh) meshes++; });
  return {calls: i.render.calls, meshes, programs: i.programs.length, fakeDraws: window.__fakegl.draws}; }"""

if __name__ == '__main__':
    off, e1 = run(query='fakegl=1', after=lambda page: page.evaluate(JS))
    on, e2 = run(query='fakegl=1&merge=yes', after=lambda page: page.evaluate(JS))
    print('merge off', json.dumps(off)); print('merge on ', json.dumps(on))
    ok = True
    def check(name, cond):
        global ok
        print(('PASS ' if cond else 'FAIL ') + name)
        ok = ok and cond
    check('fake context counts what three.js reports', off['fakeDraws'] > 0 and off['calls'] > 0)
    check('without merging: about one draw call per mesh', off['calls'] >= off['meshes'] * 0.9)
    check('with merging: under a third of the draw calls', on['calls'] < off['calls'] / 3)
    check('merging adds no shader programs', on['programs'] <= off['programs'] + 1)
    check('no page errors', not e1 and not e2)
    raise SystemExit(0 if ok else 1)
