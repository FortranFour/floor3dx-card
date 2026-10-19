"""Unit test of the look's edge lines on a hand-built scene (dev/harness/unit): open quads standing
in for Sweet Home 3D wall faces and room floors. Checks the crease/boundary rule, the double-sided
boundary, and edge_skip: seams between coplanar wall segments vanish, floors between rooms vanish,
corners stay, named objects get no lines."""
import json, os, subprocess
from run import run, ROOT

JS = r"""() => {
  const T=window.THREE, Look=window.Look;
  const quad=(name,pts,doubleSided)=>{ // pts: 4 corners in order
    const p=[]; const tri=(a,b,c)=>p.push(...pts[a],...pts[b],...pts[c]);
    tri(0,1,2); tri(0,2,3); if(doubleSided){tri(0,2,1); tri(0,3,2);}
    const g=new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(p,3)); g.computeVertexNormals();
    const m=new T.Mesh(g,new T.MeshStandardMaterial({color:0x888888})); m.name=name; return m; };
  const build=(skip)=>{
    const scene=new T.Scene();
    const meshes=[
      quad('wall_a',[[0,0,0],[200,0,0],[200,250,0],[0,250,0]]),          // XY plane, x 0..200
      quad('wall_b',[[200,0,0],[400,0,0],[400,250,0],[200,250,0]]),      // continues it: seam at x=200
      quad('wall_c',[[400,0,0],[400,0,300],[400,250,300],[400,250,0]]),  // perpendicular at x=400: a corner
      quad('wall_d',[[0,0,500],[200,0,500],[200,250,500],[0,250,500]],true), // double-sided copy
      quad('room_1',[[0,0,0],[200,0,0],[200,0,300],[0,0,300]]),          // floors, XZ plane
      quad('room_2',[[200,0,0],[400,0,0],[400,0,300],[200,0,300]]),
      quad('screen_1',[[50,100,1],[150,100,1],[150,160,1],[50,160,1]]),
    ];
    meshes.forEach(m=>scene.add(m)); scene.updateMatrixWorld(true);
    const look=new Look({theme:'neon',edge_skip:skip},scene);
    const names=new Set(); if((skip||[]).includes('screen_1')) names.add('screen_1');
    look.applyEdges(meshes,names);
    const out={}; meshes.forEach(m=>{const l=m.children.find(c=>c.name.startsWith('f3dx_edge_')); out[m.name]=l?l.geometry.attributes.position.count/2:0;});
    return out; };
  return {plain:build([]), seams:build(['seams']), floors:build(['floors']), coplanar:build(['coplanar']), named:build(['Screen_1'.toLowerCase()]), mixed:build(['seams','floors','screen_1'])};
}"""

if __name__ == '__main__':
    subprocess.run(['npx', 'rollup', '-c', 'dev/harness/unit/rollup.config.js'], cwd=ROOT, check=True, capture_output=True)
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://127.0.0.1:8765/dev/harness/unit/look-edges.html'); page.wait_for_function('() => !!window.Look')
        r = page.evaluate(JS); b.close()
    print(json.dumps(r))
    ok = True
    def check(name, cond):
        global ok
        print(('PASS ' if cond else 'FAIL ') + name)
        ok = ok and cond
    check('no skip: every open quad outlines its 4 edges, double-sided quad too, no diagonals',
          all(r['plain'][k] == 4 for k in ['wall_a', 'wall_b', 'wall_c', 'wall_d', 'room_1', 'room_2', 'screen_1']))
    check('seams: the joint of two coplanar wall segments vanishes, the corner with wall_c stays',
          r['seams']['wall_a'] == 3 and r['seams']['wall_b'] == 3 and r['seams']['wall_c'] == 4 and r['seams']['room_1'] == 4)
    check('floors: the joint of two room floors vanishes, walls untouched',
          r['floors']['room_1'] == 3 and r['floors']['room_2'] == 3 and r['floors']['wall_a'] == 4)
    check('coplanar: both; the floor edge along the wall base (90 degrees) stays',
          r['coplanar']['wall_a'] == 3 and r['coplanar']['room_1'] == 3 and r['coplanar']['room_2'] == 3)
    check('named object: no lines on it, others unchanged', r['named']['screen_1'] == 0 and r['named']['wall_a'] == 4)
    check('mixed list', r['mixed'] == {'wall_a': 3, 'wall_b': 3, 'wall_c': 4, 'wall_d': 4, 'room_1': 3, 'room_2': 3, 'screen_1': 0})
    check('no page errors', not errors)
    for e in errors: print('  ', e)
    raise SystemExit(0 if ok else 1)
