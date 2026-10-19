"""Checks `wall_seal`: every wall of the model (its wall_<id>_<n> meshes together) is stretched by the
seal at each end along its length, its height and thickness unchanged, its parts moving with it; a
wall's geometry is touched once even when shared; without the option the geometry is the file's.
Also that a card rebuilt with another `look` (the editor's reload) rebuilds its edge lines: an
edge_skip added after the first build takes effect without a page reload."""
import json
from run import run

JS = r"""async () => {
  const mk=()=>({states:{},language:'en',themes:{},config:{},user:{},callService(){}});
  const make=async(extra)=>{
    const cfg=Object.assign({},window.card._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'no',entities:[]},extra||{});
    const c=document.createElement('floor3dx-card');c.setConfig(JSON.parse(JSON.stringify(cfg)));c.hass=mk();
    const h=document.createElement('div');h.style.cssText='width:400px;height:300px';document.body.appendChild(h);h.appendChild(c);
    await new Promise(r=>{const t=setInterval(()=>{if(c._modelready){clearInterval(t);r()}},50)});
    await new Promise(r=>setTimeout(r,400)); return c;};
  // bounding box of a wall in the model's own frame (its faces share one transform; the card re-centres
  // the model on its bounding box, which a sealed outer wall shifts by a fraction of the seal)
  const bounds=(c,id)=>{let min=[1e9,1e9,1e9],max=[-1e9,-1e9,-1e9];
    c._scene.traverse(o=>{ if(!o.isMesh||!o.name.startsWith(id+'_'))return; o.geometry.computeBoundingBox(); const bb=o.geometry.boundingBox;
      min=[Math.min(min[0],bb.min.x),Math.min(min[1],bb.min.y),Math.min(min[2],bb.min.z)]; max=[Math.max(max[0],bb.max.x),Math.max(max[1],bb.max.y),Math.max(max[2],bb.max.z)]; });
    return {min,max,size:[max[0]-min[0],max[1]-min[1],max[2]-min[2]]}; };
  const r2=(v)=>Math.round(v*100)/100;
  const out={};
  const plain=await make();
  const a0=bounds(plain,'wall_13'), b0=bounds(plain,'wall_14');  // wall_13 runs along x (615 x 40 x 7), wall_14 along z
  const faces0=[]; plain._scene.traverse(o=>{ if(o.isMesh&&/^wall_13_\d+$/.test(o.name)) faces0.push(o); });
  const faceSizes0=faces0.map(f=>{ f.geometry.computeBoundingBox(); const g=f.geometry.boundingBox; return [g.max.x-g.min.x,g.max.y-g.min.y,g.max.z-g.min.z]; });
  const geoms0=faces0.map(f=>f.geometry);
  const sealed=await make({wall_seal:0.5});
  const a1=bounds(sealed,'wall_13'), b1=bounds(sealed,'wall_14');
  out.alongX={dx:r2(a1.size[0]-a0.size[0]), dy:r2(a1.size[1]-a0.size[1]), dz:r2(a1.size[2]-a0.size[2]), centre:r2((a1.min[0]+a1.max[0])/2-(a0.min[0]+a0.max[0])/2)};
  out.alongZ={dx:r2(b1.size[0]-b0.size[0]), dy:r2(b1.size[1]-b0.size[1]), dz:r2(b1.size[2]-b0.size[2]), centre:r2((b1.min[2]+b1.max[2])/2-(b0.min[2]+b0.max[2])/2)};
  // every face of the wall moved with it: each mesh's own x extent grew by the same amount
  const faces=[]; sealed._scene.traverse(o=>{ if(o.isMesh&&/^wall_13_\d+$/.test(o.name)) faces.push(o); });
  out.facesGrew=faces.map((f,i)=>{ f.geometry.computeBoundingBox(); const g=f.geometry.boundingBox; return [r2((g.max.x-g.min.x)-faceSizes0[i][0]), r2((g.max.y-g.min.y)-faceSizes0[i][1]), r2((g.max.z-g.min.z)-faceSizes0[i][2])]; });
  out.sealedFlag=faces.every(f=>f.geometry.userData.f3dxSealed===true);
  // the other card's geometry (shared with this one before sealing) is untouched: own copies
  out.plainUntouched=faces0.every((f,i)=>f.geometry===geoms0[i] && !f.geometry.userData.f3dxSealed) && faceSizes0.every((sz,i)=>{ faces0[i].geometry.computeBoundingBox(); const g=faces0[i].geometry.boundingBox; return r2(g.max.x-g.min.x-sz[0])===0; });
  // the editor's reload: a look rebuilt on the same card picks up a new edge_skip
  const l=await make({look:{theme:'neon'}});
  const edge=(c,name)=>!!c._scene.getObjectByName('f3dx_edge_'+name);
  out.edgesBefore=[edge(l,'wall_13_3'), edge(l,'wall_14_3')];
  const cfg2=JSON.parse(JSON.stringify(l._config)); cfg2.look={theme:'neon',edge_skip:'wall_13_*'};
  l.setConfig(cfg2); l.rerender();
  await new Promise(r=>{const t=setInterval(()=>{if(l._modelready){clearInterval(t);r()}},50)});
  await new Promise(r=>setTimeout(r,400));
  out.edgesAfter=[edge(l,'wall_13_3'), edge(l,'wall_14_3')];
  out.oneLook=(()=>{let n=0; l._scene.traverse(o=>{ if(o.name==='f3dx_edge_wall_14_3') n++; }); return n;})();
  return out;
}"""

if __name__ == '__main__':
    result, errors = run(after=lambda page: page.evaluate(JS))
    print(json.dumps(result))
    r = result
    ok = True
    def check(name, cond):
        global ok
        print(('PASS ' if cond else 'FAIL ') + name)
        ok = ok and cond
    check('a wall along x grows by the seal at each end, height and thickness unchanged, centre fixed',
          r['alongX'] == {'dx': 1, 'dy': 0, 'dz': 0, 'centre': 0})
    check('a wall along z likewise', r['alongZ'] == {'dx': 0, 'dy': 0, 'dz': 1, 'centre': 0})
    check('every face of the wall grew along x only (a shorter inner face by its share of the uniform scale)',
          len(r['facesGrew']) == 6 and all(0.97 <= v[0] <= 1 and v[1] == 0 and v[2] == 0 for v in r['facesGrew']))
    check('sealed faces have their own, marked geometry; the card without the option keeps the file\'s', r['sealedFlag'] is True and r['plainUntouched'] is True)
    check('look: edge lines present before the reload', r['edgesBefore'] == [True, True])
    check('look: an edge_skip added before the reload takes effect, other lines rebuilt once', r['edgesAfter'] == [False, True] and r['oneLook'] == 1)
    check('no page errors', not errors)
    for e in errors:
        print('  ', e)
    raise SystemExit(0 if ok else 1)
