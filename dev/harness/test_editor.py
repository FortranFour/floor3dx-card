"""Checks the editor/preview protocol: a preview card answers the object list and camera requests,
highlights objects, picks an object on tap; the editor element falls back to the classic editor when
Home Assistant's form components are missing (as in this harness); wildcard object ids expand."""
import json
from run import run

JS = r"""async () => {
  const names=[];window.card._scene.traverse(o=>{if(o.isMesh&&o.name)names.push(o.name)});
  const EV_EDITOR='floor3dx-card-editor', EV_PREVIEW='floor3dx-card-preview';
  const got=[]; window.addEventListener(EV_PREVIEW,(e)=>got.push(e.detail));
  const send=(d)=>window.dispatchEvent(new CustomEvent(EV_EDITOR,{detail:d}));
  const prefix=names[0].replace(/[^_]*$/,'');  // e.g. "room_1_" -> wildcard room_1_*
  const cfg=Object.assign({},window.card._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'no',object_groups:[{object_group:'g',objects:[names[1],{object_id:names[2]}]}],
    entities:[{entity:'light.x',type3d:'color',object_id:prefix+'*',colorcondition:[{state:'on',color:'red'}]}], click:true});
  const c=document.createElement('floor3dx-card'); c.preview=true; c.setConfig(JSON.parse(JSON.stringify(cfg)));
  const hass={states:{'light.x':{state:'on',attributes:{}}},language:'en',resources:{en:{}},localize:()=>'',themes:{},config:{},user:{},callService(){}}; c.hass=hass;
  const h=document.createElement('div');h.style.cssText='width:500px;height:350px';document.body.appendChild(h);h.appendChild(c);
  await new Promise(r=>{const t=setInterval(()=>{if(c._modelready){clearInterval(t);r()}},50)});
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms)); await wait(300);
  const out={};
  out.autoObjects=got.some(d=>Array.isArray(d.objects)&&d.objects.length>5);
  got.length=0; send({request:'objects'}); await wait(50); out.objectsOnRequest=got.some(d=>Array.isArray(d.objects));
  got.length=0; send({request:'camera'}); await wait(50); out.camera=got.some(d=>d.camera&&d.camera.camera_position&&typeof d.camera.camera_position.x==='number');
  send({highlight:[names[1],'<g>']}); await wait(50); out.highlightHelpers=c._highlightHelpers.length; // names[1] + group (names[1], names[2]) -> 2 distinct
  send({highlight:[]}); await wait(50); out.highlightCleared=c._highlightHelpers.length;
  // pick: simulate a short click at the canvas centre
  send({pick:true}); await wait(50); out.cursor=c._renderer.domElement.style.cursor;
  const el=c._content; const r=el.getBoundingClientRect(); const x=r.width/2, y=r.height/2;
  got.length=0; el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:r.left+x,clientY:r.top+y})); await wait(30);
  const up=new MouseEvent('mouseup',{bubbles:true,clientX:r.left+x,clientY:r.top+y}); Object.defineProperty(up,'offsetX',{value:x}); Object.defineProperty(up,'offsetY',{value:y}); el.dispatchEvent(up); await wait(50);
  out.picked=got.find(d=>d.picked); send({pick:false});
  // click normalised: click:true -> 'yes'; group objects normalised; wildcard expanded
  out.clickNorm=c._config.click; out.groupNorm=c._config.object_groups[0].objects.every(o=>typeof o==='object'&&o.object_id);
  out.wildcard=c._object_ids[0].objects.length;
  // editor element: classic fallback here (no ha-form)
  const ed=document.createElement('floor3dx-card-editor'); ed.hass=hass; ed.setConfig(JSON.parse(JSON.stringify(cfg))); document.body.appendChild(ed);
  await wait(6000); out.editorMode=ed._mode; out.classicPresent=!!ed.shadowRoot.querySelector('floor3dx-card-editor-classic');
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
    check('preview sends its object list when the model is ready and on request', r['autoObjects'] and r['objectsOnRequest'])
    check('camera request answered with position/target/rotation', r['camera'])
    check('highlight draws one box per distinct object, cleared on empty', r['highlightHelpers'] == 2 and r['highlightCleared'] == 0)
    check('pick mode: crosshair cursor and a tap reports the object', r['cursor'] == 'crosshair' and bool(r['picked']))
    check('config normalised: true -> yes, plain group ids -> objects', r['clickNorm'] == 'yes' and r['groupNorm'])
    check('wildcard object id expands to several objects', r['wildcard'] > 1)
    check('editor falls back to the classic editor without ha-form', r['editorMode'] == 'classic' and r['classicPresent'])
    check('no page errors', not errors)
    for e in errors:
        print('  ', e)
    raise SystemExit(0 if ok else 1)
