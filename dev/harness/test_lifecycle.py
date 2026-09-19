"""Regression test: doors and windows must be in the same place on every visit to a view.

The card caches the loaded model and builds a new card from the cache each time a view is opened.
Upstream shared geometry between those cards while the door setup re-centred it in place, so from the
second visit on every door part was displaced. This test builds 8 three-part windows (pane outside
the group, gesture entries ahead of them, as in a real config), then: first visit, open two windows,
leave, return as a new card, close, detach/re-attach the same card, third visit. World-space boxes of
all 24 parts must match the first visit, open and closed.
"""
import sys
from run import run

JS = """async ()=>{
  const names=[];window.card._scene.traverse(o=>{if(o.isMesh&&o.name)names.push(o.name)});
  // 8 "windows": 3-part sash group + a separate pane object that is NOT in the group (his pattern)
  const groups=[],ents=[];let k=10;
  // gesture entries (no entity) placed BEFORE the doors, as in his YAML
  ents.push({entity:'switch.a',type3d:'color',object_id:names[0],colorcondition:[{state:'on',color:'Gold'}]});
  ents.push({type3d:'gesture',object_id:names[1],gesture:{domain:'script',service:'x'}});
  ents.push({entity:'switch.a',type3d:'light',object_id:names[2],light:{shadow:'no',lumens:'500',distance:'200',decay:'1',light_direction:{x:0,y:-5,z:0}}});
  ents.push({type3d:'gesture',object_id:names[3],gesture:{domain:'script',service:'y'}});
  for(let w=0;w<8;w++){const g=names.slice(k,k+3),pane=names[k+3];k+=4;
    groups.push({object_group:'w'+w,objects:g.map(n=>({object_id:n}))});
    ents.push({entity:'binary_sensor.w'+(w%4),type3d:'door',object_id:'<w'+w+'>',door:{doortype:'swing',side:w%2?'right':'left',direction:w%2?'outer':'inner',degrees:'30',pane}});}
  const doorObjs=groups.flatMap(g=>g.objects.map(o=>o.object_id));
  const cfg=Object.assign({},window.card._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'no',object_groups:groups,entities:ents});
  const mk=(open)=>{const s={'switch.a':{entity_id:'switch.a',state:'on',attributes:{}}};for(let i=0;i<4;i++)s['binary_sensor.w'+i]={entity_id:'binary_sensor.w'+i,state:open.includes(i)?'on':'off',attributes:{}};
    return {states:s,language:'en',themes:{},config:{},user:{},callService(){}}};
  const snap=(c)=>JSON.stringify(doorObjs.map(n=>{const o=c._scene.getObjectByName(n);o.updateWorldMatrix(true,false);o.geometry.computeBoundingBox();const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);return [b.min.x,b.min.y,b.min.z,b.max.x,b.max.y,b.max.z].map(v=>Math.round(v))}));
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  const make=async(open)=>{const c=document.createElement('floor3dx-card');c.setConfig(JSON.parse(JSON.stringify(cfg)));c.hass=mk(open);
    const h=document.createElement('div');h.style.cssText='width:500px;height:350px';document.body.appendChild(h);h.appendChild(c);
    await new Promise(r=>{const t=setInterval(()=>{if(c._modelready){clearInterval(t);r()}},50)});c.hass=mk(open);await wait(1800);return [c,h]};
  const out={};
  // reference poses from a first, cold visit
  const [c1,h1]=await make([]);      out.ref_closed=snap(c1);
  c1.hass=mk([1,2]); await wait(1800); out.ref_open12=snap(c1);
  h1.remove();                                                   // leave while windows 1,2 are open
  const [c2,h2]=await make([1,2]);   out.v2_open12=snap(c2);     // return (new card, cached model), still open
  c2.hass=mk([]); await wait(1800);  out.v2_closed=snap(c2);
  // same card kept by the dashboard's view cache: detach, state changes while away, re-attach
  const par=h2.parentNode; h2.remove(); await wait(300); par.appendChild(h2); c2.hass=mk([1,2]); await wait(1800); out.v2_reattach_open12=snap(c2);
  h2.remove();
  const [c3,h3]=await make([]);      out.v3_closed=snap(c3);     // third visit
  return {v2_open_ok: out.v2_open12===out.ref_open12, v2_closed_ok: out.v2_closed===out.ref_closed, reattach_ok: out.v2_reattach_open12===out.ref_open12, v3_closed_ok: out.v3_closed===out.ref_closed, open_differs_from_closed: out.ref_open12!==out.ref_closed, doorObjects: doorObjs.length};
}"""

if __name__ == '__main__':
    result, errors = run(after=lambda page: page.evaluate(JS))
    print(result)
    checks = ['v2_open_ok', 'v2_closed_ok', 'reattach_ok', 'v3_closed_ok', 'open_differs_from_closed']
    failed = [c for c in checks if not result.get(c)] + (['console errors: ' + '; '.join(errors[:3])] if errors else [])
    print('PASS' if not failed else 'FAIL: ' + ', '.join(failed))
    sys.exit(1 if failed else 0)
