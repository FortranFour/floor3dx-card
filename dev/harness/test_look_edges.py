"""Unit test of the look's edge lines on a hand-built scene (dev/harness/unit): open quads standing
in for Sweet Home 3D wall faces and room floors. Checks the crease/boundary rule, the double-sided
boundary, and edge_skip: seams between coplanar wall segments vanish, floors between rooms vanish
(also where the two floors overlap or stop short by a few millimetres), corners stay, named objects
get no lines. Also the themed materials: the flat faces of a wall get the lowered variant."""
import json, os, subprocess
from run import run, ROOT

JS = r"""() => {
  const T=window.THREE, Look=window.Look;
  const quad=(name,pts,doubleSided)=>{ // pts: 4 corners in order
    const p=[]; const tri=(a,b,c)=>p.push(...pts[a],...pts[b],...pts[c]);
    tri(0,1,2); tri(0,2,3); if(doubleSided){tri(0,2,1); tri(0,3,2);}
    const g=new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(p,3)); g.computeVertexNormals();
    const m=new T.Mesh(g,new T.MeshStandardMaterial({color:0x888888})); m.name=name; return m; };
  const box=(name,x,y,z,w,h,d)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color:0x888888})); m.name=name; m.position.set(x,y,z); return m;};
  // one mesh made of overlapping closed pieces, as Sweet Home 3D exports a wall with a window:
  // full-height pieces left and right, a piece under the sill and one over the lintel
  const pieces=(name,list)=>{const ps=[];list.forEach(([x,y,z,w,h,d])=>{const g=new T.BoxGeometry(w,h,d).toNonIndexed();g.translate(x,y,z);ps.push(...g.attributes.position.array);});
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.computeVertexNormals();const m=new T.Mesh(g,new T.MeshStandardMaterial({color:0x888888}));m.name=name;return m;};
  const build=(skip)=>{
    const scene=new T.Scene();
    const meshes=[
      quad('wall_a',[[0,0,0],[200,0,0],[200,250,0],[0,250,0]]),          // XY plane, x 0..200
      quad('wall_b',[[200,0,0],[400,0,0],[400,250,0],[200,250,0]]),      // continues it: seam at x=200
      quad('wall_c',[[400,0,0],[400,0,300],[400,250,300],[400,250,0]]),  // perpendicular at x=400: a corner
      quad('wall_d',[[0,0,500],[200,0,500],[200,250,500],[0,250,500]],true), // double-sided copy
      quad('room_1',[[0,0,0],[200,0,0],[200,0,300],[0,0,300]]),          // floors, XZ plane
      quad('room_2',[[200,0,0],[400,0,0],[400,0,300],[200,0,300]]),
      quad('room_3a',[[0,0,300],[100,0,300],[100,0,500],[0,0,500]]),   // next to room_1 along z, its edge split in two
      quad('room_3b',[[100,0,300],[200,0,300],[200,0,500],[100,0,500]]),
      quad('screen_1',[[50,100,1],[150,100,1],[150,160,1],[50,160,1]]),
      box('wall_e',700,125,1000,200,250,10), box('wall_f',900,125,1000,200,250,10),  // closed wall segments: end caps pressed together at x=800
      box('wall_g',1000+5,125,1000+105,10,250,200),                                // a perpendicular segment on wall_f's end: a corner
      quad('room_4',[[600,0,0],[800,0,0],[800,0,300.4],[600,0,300.4]]),    // floors drawn by hand: room_5 overlaps room_4 by 4 mm,
      quad('room_5',[[600,0,300],[800,0,300],[800,0,600],[600,0,600]]),    // room_6 stops 6 mm short of room_5
      quad('room_6',[[800.6,0,300],[1000,0,300],[1000,0,600],[800.6,0,600]]),
      pieces('wall_w',[[50,125,2000,100,250,10],[150,40,2000,100,80,10],[150,225,2000,100,50,10],[250,125,2000,100,250,10]]), // window x 100..200, y 80..200
    ];
    meshes.forEach(m=>scene.add(m)); scene.updateMatrixWorld(true);
    const look=new Look({theme:'neon',edge_skip:skip},scene);
    const names=new Set(); if((skip||[]).includes('screen_1')) names.add('screen_1');
    look.applyEdges(meshes,names);
    const out={}; meshes.forEach(m=>{const l=m.children.find(c=>c.name.startsWith('f3dx_edge_')); out[m.name]=l?l.geometry.attributes.position.count/2:0;});
    const w=meshes.find(m=>m.name==='wall_w'); const l=w.children.find(c=>c.name.startsWith('f3dx_edge_'));
    if(l){const p=l.geometry.attributes.position; const segs=[]; for(let i=0;i<p.count;i+=2) segs.push([[p.getX(i),p.getY(i),p.getZ(i)],[p.getX(i+1),p.getY(i+1),p.getZ(i+1)]]);
      const r=(v)=>Math.round(v*10)/10; out.wall_w_segments=segs.map(s=>s.map(q=>q.map(r)));}
    return out; };
  const flat=()=>{ // themed materials: the bottom and top faces of a wall get the lowered variant, its sides and a floor do not
    const scene=new T.Scene();
    const meshes=[
      quad('wall_1_1',[[0,0,0],[200,0,0],[200,0,10],[0,0,10]]),            // bottom face, y=0
      quad('wall_1_5',[[0,250,0],[200,250,0],[200,250,10],[0,250,10]]),    // top face, y=250
      quad('wall_1_3',[[0,0,0],[200,0,0],[200,250,0],[0,250,0]]),          // side face
      quad('room_1',[[0,0,0],[200,0,0],[200,0,300],[0,0,300]]),
    ];
    const paint=new T.MeshStandardMaterial({color:0xcccccc}); meshes.slice(0,3).forEach(m=>m.material=paint); // one wall material, as exported
    meshes.forEach(m=>scene.add(m)); scene.updateMatrixWorld(true);
    const look=new Look({theme:'neon'},scene); look.applyMaterials(meshes);
    const out={}; meshes.forEach(m=>out[m.name]=!!m.material.userData.f3dxFlatWall);
    out.oneCopyPerVariant = meshes[0].material===meshes[1].material && meshes[0].material!==meshes[2].material; // bottom and top share the lowered copy, the side has the plain one
    return out; };
  return {plain:build([]), seams:build(['seams']), floors:build(['floors']), coplanar:build(['coplanar']), named:build(['Screen_1'.toLowerCase()]), mixed:build(['seams','floors','screen_1']), flat:flat()};
}"""

if __name__ == '__main__':
    subprocess.run(['npx', 'rollup', '-c', 'dev/harness/unit/rollup.config.js'], cwd=ROOT, check=True, capture_output=True)
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://127.0.0.1:8765/dev/harness/unit/look-edges.html'); page.wait_for_function('() => !!window.Look')
        r = page.evaluate(JS); b.close()
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != 'wall_w_segments'} for k, v in r.items()}))
    ok = True
    def check(name, cond):
        global ok
        print(('PASS ' if cond else 'FAIL ') + name)
        ok = ok and cond
    check('no skip: every open quad outlines its 4 edges, double-sided quad too, no diagonals',
          all(r['plain'][k] == 4 for k in ['wall_a', 'wall_b', 'wall_c', 'wall_d', 'room_1', 'room_2', 'room_3a', 'room_3b', 'screen_1']))
    check('seams: the joint of two coplanar wall segments vanishes, the corner with wall_c stays',
          r['seams']['wall_a'] == 3 and r['seams']['wall_b'] == 3 and r['seams']['wall_c'] == 4 and r['seams']['room_1'] == 4)
    check('floors: the joints of room floors vanish, including a border split differently on each side; walls untouched',
          r['floors']['room_1'] == 2 and r['floors']['room_2'] == 3 and r['floors']['room_3a'] == 2 and r['floors']['room_3b'] == 2 and r['floors']['wall_a'] == 4)
    check('coplanar: both; the floor edge along the wall base (90 degrees) stays; a room corner on the double-sided wall cuts its edge in two (4 -> 5)',
          r['coplanar']['wall_a'] == 3 and r['coplanar']['room_1'] == 2 and r['coplanar']['room_2'] == 3 and r['coplanar']['wall_d'] == 5)
    check('closed segments: 12 box edges each without skip', r['plain']['wall_e'] == 12 and r['plain']['wall_f'] == 12 and r['plain']['wall_g'] == 12)
    check('seams: the 4 edges around the pressed-together end caps vanish, the corner with wall_g keeps its edges',
          r['seams']['wall_e'] == 8 and r['seams']['wall_f'] == 8 and r['seams']['wall_g'] == 12)
    check('floors: a border where one floor overlaps the other by 4 mm, or stops 6 mm short, vanishes too',
          r['plain']['room_4'] == 4 and r['plain']['room_5'] == 4 and r['plain']['room_6'] == 4
          and r['floors']['room_4'] == 3 and r['floors']['room_5'] == 2 and r['floors']['room_6'] == 3)
    def segs(mode):
        return [tuple(map(tuple, s)) for s in r[mode].get('wall_w_segments', [])]
    def vertical_at(mode, x, lo, hi):  # a vertical segment on the skins at x covering [lo, hi]
        return any(a[0] == x and b[0] == x and a[2] == b[2] and min(a[1], b[1]) <= lo + 0.1 and max(a[1], b[1]) >= hi - 0.1 for a, b in segs(mode))
    def seam_part(mode, x, lo, hi):  # any vertical segment at x lying within [lo, hi] on the skins
        return any(a[0] == x and b[0] == x and a[2] == b[2] and min(a[1], b[1]) >= lo - 0.1 and max(a[1], b[1]) <= hi + 0.1 and abs(a[1] - b[1]) > 0.5 for a, b in segs(mode))
    check('windowed wall, no skip: the piece seams show below the sill and above the lintel',
          seam_part('plain', 100, 0, 80) and seam_part('plain', 100, 200, 250) and seam_part('plain', 200, 0, 80))
    check('windowed wall, seams: the seams below the sill and above the lintel are gone',
          not seam_part('seams', 100, 0, 80) and not seam_part('seams', 100, 200, 250) and not seam_part('seams', 200, 0, 80) and not seam_part('seams', 200, 200, 250))
    check('windowed wall, seams: the jambs (x 100 and 200, y 80..200) are still drawn', vertical_at('seams', 100, 80, 200) and vertical_at('seams', 200, 80, 200))
    check('windowed wall, seams: outer corners (x 0 and 300) still drawn full height', vertical_at('seams', 0, 0, 250) and vertical_at('seams', 300, 0, 250))
    check('windowed wall, seams: sill and lintel lines still drawn',
          any(a[1] == 80 and b[1] == 80 and a[2] == b[2] and abs(a[0] - b[0]) > 50 for a, b in segs('seams')) and any(a[1] == 200 and b[1] == 200 and a[2] == b[2] and abs(a[0] - b[0]) > 50 for a, b in segs('seams')))
    check('windowed wall, seams: the reveal edges (along the thickness at the sill and jamb corners) still drawn',
          any(a[0] == 100 and b[0] == 100 and a[1] == 80 and b[1] == 80 and a[2] != b[2] for a, b in segs('seams')))
    check('named object: no lines on it, others unchanged', r['named']['screen_1'] == 0 and r['named']['wall_a'] == 4)
    check('mixed list', {k: v for k, v in r['mixed'].items() if k not in ('wall_w', 'wall_w_segments')} == {'wall_a': 3, 'wall_b': 3, 'wall_c': 4, 'wall_d': 5, 'room_1': 2, 'room_2': 3, 'room_3a': 2, 'room_3b': 2, 'screen_1': 0, 'wall_e': 8, 'wall_f': 8, 'wall_g': 12, 'room_4': 3, 'room_5': 2, 'room_6': 3})
    check('themed materials: the flat faces of a wall are lowered, its side and a floor are not',
          r['flat'] == {'wall_1_1': True, 'wall_1_5': True, 'wall_1_3': False, 'room_1': False, 'oneCopyPerVariant': True})
    check('no page errors', not errors)
    for e in errors: print('  ', e)
    raise SystemExit(0 if ok else 1)
