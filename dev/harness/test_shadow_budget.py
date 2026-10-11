"""Checks the shadow budget: with shadows on and more shadow-casting lights than the GPU has texture
units for, the card still renders (no shader failure) and grants shadows to at most the budget;
extralightmode re-grants them to the lights that are on; a shadow_budget override is honoured."""
import json
from run import run

JS = r"""async () => {
  const names=[];window.card._scene.traverse(o=>{if(o.isMesh&&o.name){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;if(b.max.y-b.min.y>20)names.push(o.name)}});
  const N=40;
  const ents=[]; for(let k=0;k<N;k++) ents.push({entity:'light.l'+k,type3d:'light',object_id:names[k%names.length],light:{shadow:'yes',lumens:'500',distance:'200',decay:'1'}});
  const mk=(onCount)=>{const st={};for(let k=0;k<N;k++)st['light.l'+k]={entity_id:'light.l'+k,state:k<onCount?'on':'off',attributes:{}};return {states:st,language:'en',themes:{},config:{},user:{},callService(){}};};
  const make=async(extra,budget)=>{
    const cfg=Object.assign({},window.card._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'yes',extralightmode:extra?'yes':'no',object_groups:[],entities:ents});
    if(budget)cfg.shadow_budget=budget;
    const c=document.createElement('floor3dx-card');c.setConfig(JSON.parse(JSON.stringify(cfg)));c.hass=mk(N);
    const h=document.createElement('div');h.style.cssText='width:400px;height:300px';document.body.appendChild(h);h.appendChild(c);
    await new Promise(r=>{const t=setInterval(()=>{if(c._modelready){clearInterval(t);r()}},50)});
    await new Promise(r=>setTimeout(r,800)); return c;};
  const casting=(c)=>c._shadowCandidates.filter(x=>x.light.castShadow).length;
  const rendered=(c)=>{ // a drawn frame leaves non-background pixels somewhere
    const gl=c._renderer.getContext(); const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight; const px=new Uint8Array(w*h*4); c._render(); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
    const colors=new Set(); for(let i=0;i<px.length;i+=4*97) colors.add(px[i]+','+px[i+1]+','+px[i+2]); return colors.size; };
  const out={};
  const a=await make(false,null); out.budget=a._shadowBudget; out.maxTex=a._maxtextureimage; out.castingPlain=casting(a); out.colorsPlain=rendered(a); out.glError=a._renderer.getContext().getError(); out.programs=a._renderer.info.programs.length;
  // extralightmode: only lights that are on hold a slot; turn most off and the rest must get shadows
  const b=await make(true,null); b.hass=mk(3); await new Promise(r=>setTimeout(r,600)); out.castingExtraOn3=casting(b); out.extraOnAreOn=b._shadowCandidates.filter(x=>x.light.castShadow).every(x=>x.light.intensity>0);
  const d=await make(false,2); out.castingBudget2=casting(d);
  // control: force a budget past the GPU limit; the shader must fail (that is the black screen the cap prevents)
  const errs=[]; const oe=console.error; console.error=(...a)=>{errs.push(a.join(' '));oe(...a)};
  const e=await make(false,40); try{rendered(e);}catch(x){errs.push(String(x));} out.overBudgetErrors=errs.filter(m=>/shader|program|uniform|sampler|texture/i.test(m)).length; console.error=oe;
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
    check('budget derived from the GPU texture units, below the light count', 0 < r['budget'] < 40 and r['budget'] <= r['maxTex'])
    check('shadows granted to exactly the budget, not to all 40 lights', r['castingPlain'] == r['budget'])
    check('scene renders with shadows on (no GL error, pixels drawn)', r['glError'] == 0 and r['colorsPlain'] > 1)
    check('extralightmode: with 3 lights on, those 3 cast and no others', r['castingExtraOn3'] == 3 and r['extraOnAreOn'])
    check('shadow_budget override honoured', r['castingBudget2'] == 2)
    real = [e for e in errors if 'shadow maps' not in e]
    check('control: a budget past the GPU limit breaks the shader (what the cap prevents)', r['overBudgetErrors'] > 0)
    real = [e for e in real if not any(k in e.lower() for k in ('shader', 'program', 'sampler', 'uniform', 'texture'))]
    check('no page errors (the budget warning and the control failure are expected)', not real)
    for e in real:
        print('  ', e)
    raise SystemExit(0 if ok else 1)
