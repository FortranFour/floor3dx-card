"""Checks type3d: shade: the fabric's bottom edge rises with the entity's position, the top edge
descends with shade.top_entity, the object keeps its width, and it snaps back when closed."""
import json
from run import run

JS = r"""async () => {
  const names=[];window.card._scene.traverse(o=>{if(o.isMesh&&o.name){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;if(b.max.y-b.min.y>20&&b.max.x-b.min.x>5&&b.max.z-b.min.z>5)names.push(o.name)}});
  const ents=[{entity:'cover.b',type3d:'shade',object_id:names[0],shade:{top_entity:'cover.t'}},
              {entity:'cover.inv',type3d:'shade',object_id:names[1],shade:{invert:'yes'}}];
  const cfg=Object.assign({},window.card._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'no',object_groups:[],entities:ents});
  const cov=(p)=>({state:p>0?'open':'closed',attributes:{current_position:p}});
  const mk=(b,t,inv)=>({states:{'cover.b':cov(b),'cover.t':cov(t),'cover.inv':cov(inv)},language:'en',themes:{},config:{},user:{},callService(){}});
  const c=document.createElement('floor3dx-card');c.setConfig(JSON.parse(JSON.stringify(cfg)));c.hass=mk(0,0,100);
  const h=document.createElement('div');h.style.cssText='width:500px;height:350px';document.body.appendChild(h);h.appendChild(c);
  await new Promise(r=>{const t=setInterval(()=>{if(c._modelready){clearInterval(t);r()}},50)});
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms)); await wait(500);
  const box=(n)=>{const o=c._scene.getObjectByName(n); o.updateWorldMatrix(true,false); o.geometry.computeBoundingBox(); const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); return {y0:b.min.y,y1:b.max.y,w:b.max.x-b.min.x,d:b.max.z-b.min.z};};
  const full=box(names[0]); const fullInv=box(names[1]);
  const rel=(b,f)=>({bottom:+((b.y0-f.y0)/(f.y1-f.y0)).toFixed(2), top:+((f.y1-b.y1)/(f.y1-f.y0)).toFixed(2), w:+(b.w/f.w).toFixed(2), d:+(b.d/f.d).toFixed(2)});
  const out={full:rel(full,full), fullInv:rel(fullInv,fullInv)};
  c.hass=mk(25,0,100); await wait(2200); out.up25=rel(box(names[0]),full);
  c.hass=mk(25,40,100); await wait(2200); out.up25down40=rel(box(names[0]),full);
  c.hass=mk(100,0,100); await wait(2200); out.open=rel(box(names[0]),full);
  c.hass=mk(0,0,0); await wait(2200); out.closedAgain=rel(box(names[0]),full); out.invAt0=rel(box(names[1]),fullInv);
  out.loopOff=!c._to_animate;
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
    check('closed: fabric spans the full height', r['full'] == {'bottom': 0, 'top': 0, 'w': 1, 'd': 1})
    check('bottom 25: bottom edge up a quarter, width kept', r['up25']['bottom'] == 0.25 and r['up25']['top'] == 0 and r['up25']['w'] == 1)
    check('top 40 as well: top edge down 40%', r['up25down40']['bottom'] == 0.25 and r['up25down40']['top'] == 0.4)
    check('open: nearly gone at the top', r['open']['bottom'] >= 0.98 and r['open']['top'] >= -0.02)
    check('closed again: full span restored', r['closedAgain'] == {'bottom': 0, 'top': 0, 'w': 1, 'd': 1})
    check('invert: position 100 is closed, 0 is open', r['fullInv']['bottom'] == 0 and r['invAt0']['bottom'] >= 0.98)
    check('animation loop stops after the tween', r['loopOff'])
    check('no page errors', not errors)
    for e in errors:
        print('  ', e)
    raise SystemExit(0 if ok else 1)
