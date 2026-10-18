"""Checks `transparent`: a card-level rule makes the walls it names see-through by a fixed amount while
other objects sharing the material stay solid; a type3d transparent row follows a boolean entity
(on -> transparency, off -> transparency_off) and a numeric one (its value, invertible); 100 hides the
mesh; back at 0 the material is exactly as it was; the look's themed materials are the ones faded."""
import json
from run import run

JS = r"""async () => {
  const names=[];window.card._scene.traverse(o=>{if(o.isMesh&&o.name){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;if(b.max.y-b.min.y>20)names.push(o.name)}});
  // two meshes sharing one material: the first is in the rule, the second is not
  const shared=window.card._scene.getObjectByName(names[0]).material; window.card._scene.getObjectByName(names[1]).material=shared;
  const mk=(sw,num)=>({states:{'input_boolean.x':{state:sw,attributes:{}},'input_number.t':{state:String(num),attributes:{min:0,max:100}},'sensor.f':{state:'0.25',attributes:{}}},language:'en',themes:{},config:{},user:{},callService(){}});
  const make=async(extra)=>{
    const ents=[{entity:'input_boolean.x',type3d:'transparent',object_id:names[2],transparent:{transparency:80,transparency_off:20}},
                {entity:'input_number.t',type3d:'transparent',object_id:names[3],transparent:{invert:'yes'}},
                {entity:'sensor.f',type3d:'transparent',object_id:names[4]}];
    const cfg=Object.assign({},window.card._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'no',object_groups:[{object_group:'g',objects:[{object_id:names[6]}]}],entities:ents,
      transparent:[{objects:[names[0],'<g>'],transparency:50},{objects:names[5],transparency:100}]},extra||{});
    const c=document.createElement('floor3dx-card');c.setConfig(JSON.parse(JSON.stringify(cfg)));c.hass=mk('off',30);
    const h=document.createElement('div');h.style.cssText='width:400px;height:300px';document.body.appendChild(h);h.appendChild(c);
    await new Promise(r=>{const t=setInterval(()=>{if(c._modelready){clearInterval(t);r()}},50)});
    await new Promise(r=>setTimeout(r,400)); return c;};
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  const c=await make();
  const mat=(k)=>{const m=c._scene.getObjectByName(names[k]).material;return Array.isArray(m)?m[0]:m;};
  const op=(k)=>+mat(k).opacity.toFixed(2);
  const out={};
  out.fixed=[op(0),mat(0).transparent,mat(0).depthWrite, op(6)];
  out.sharedSolid=[op(1),mat(1).transparent, mat(1)!==mat(0)];
  out.hidden=[c._scene.getObjectByName(names[5]).visible, op(5)];
  out.boolOff=op(2); out.numInv30=op(3); out.fraction=op(4);
  const before={transparent:mat(2).transparent,depthWrite:mat(2).depthWrite};
  c.hass=mk('on',100); await wait(300); out.boolOn=op(2); out.numInv100=[op(3),c._scene.getObjectByName(names[3]).visible];
  c.hass=mk('off',0); await wait(300); out.numInv0=[op(3),c._scene.getObjectByName(names[3]).visible, mat(3).transparent, mat(3).depthWrite];
  c.hass=mk('off',100); await wait(300); out.restored=[op(3),c._scene.getObjectByName(names[3]).visible, mat(3).transparent, mat(3).depthWrite];
  out.rowsBound=c._transparency.bound.length;
  // overlapping rules: an "all" rule then a "subset" rule on the same mesh; the later rule wins whichever changed
  const ov=await make({transparent:[{objects:[names[7],names[8]],transparency:60,entity:'input_boolean.x'},{objects:names[8],transparency:10,entity:'input_number.t'}],entities:[]});
  const om=(k)=>+((Array.isArray(ov._scene.getObjectByName(names[k]).material)?ov._scene.getObjectByName(names[k]).material[0]:ov._scene.getObjectByName(names[k]).material).opacity).toFixed(2);
  ov.hass=mk('on',10); await wait(300); out.overlapBoth=[om(7),om(8)];          // all 60, subset says 10 -> 0.4 / 0.9
  ov.hass=mk('off',10); await wait(300); out.overlapAllOff=[om(7),om(8)];       // all 0 (changed), subset unchanged 10 but re-applied -> 1 / 0.9
  ov.hass=mk('on',0); await wait(300); out.overlapSubsetZero=[om(7),om(8)];     // all 60, subset 0 -> 0.4 / 1
  // with a look: the faded material is the themed one
  const l=await make({look:{theme:'neon'}}); const lm=l._scene.getObjectByName(names[0]).material; out.lookThemedFaded=[!!(lm.userData&&lm.userData.f3dxThemedOf), +lm.opacity.toFixed(2)];
  // no option: nothing bound, no material touched
  const p=await make({transparent:undefined,entities:[]}); out.plain=[p._transparency, p._scene.getObjectByName(names[0]).material.transparent];
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
    check('card-level rule: 50% -> opacity 0.5, transparent, no depth write; <group> resolved', r['fixed'] == [0.5, True, False, 0.5])
    check('mesh sharing the material but outside the rules stays solid (material cloned)', r['sharedSolid'] == [1, False, True])
    check('100 hides the mesh', r['hidden'][0] is False)
    check('boolean entity off: transparency_off 20', r['boolOff'] == 0.8)
    check('boolean entity on: 80', r['boolOn'] == 0.2)
    check('numeric 30 inverted: 70 -> opacity 0.3', r['numInv30'] == 0.3)
    check('fraction sensor 0.25 -> 25%', r['fraction'] == 0.75)
    check('numeric 100 inverted: 0 -> solid, visible', r['numInv100'] == [1, True])
    check('numeric 0 inverted: 100 -> opacity 0, hidden', r['numInv0'] == [0, False, True, False])
    check('back to 0: visible, material flags exactly restored', r['restored'] == [1, True, False, True])
    check('rules bound: 2 card-level + 3 rows', r['rowsBound'] == 5)
    check('overlapping rules: the later rule wins on the shared mesh', r['overlapBoth'] == [0.4, 0.9])
    check('overlapping rules: an unchanged later rule is re-applied when the earlier one changes', r['overlapAllOff'] == [1, 0.9])
    check('overlapping rules: later rule at 0 makes the shared mesh solid', r['overlapSubsetZero'] == [0.4, 1])
    check('with a look, the themed material is the one faded', r['lookThemedFaded'] == [True, 0.5])
    check('no option: nothing bound, material untouched', r['plain'] == [None, False])
    check('no page errors', not errors)
    for e in errors:
        print('  ', e)
    raise SystemExit(0 if ok else 1)
