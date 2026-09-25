"""Checks light.follow_entity: what a virtual light takes from a dimmable / colour Home Assistant light.

Four light entries on the same object, one per follow_entity mode, driven by the same entity.
Also checks that a hass update that changes nothing does not re-light the scene (the upstream code
compared colour arrays by reference and re-rendered on every update).
"""
import json
from run import run

JS = r"""async () => {
  const names=[];window.card._scene.traverse(o=>{if(o.isMesh&&o.name)names.push(o.name)});
  const base={shadow:'no',lumens:'1000',color:'#ff8000',distance:'200',decay:'1'};
  const modes=['yes','brightness','color','no'];
  const ents=modes.map((m,k)=>({entity:'light.x',type3d:'light',object_id:names[k],light:Object.assign({follow_entity:m},base)}));
  ents.push({entity:'switch.s',type3d:'light',object_id:names[5],light:Object.assign({},base)}); // default mode, plain switch
  const cfg=Object.assign({},window.card._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'no',object_groups:[],entities:ents});
  const mk=(attrs,state)=>({states:{'light.x':{entity_id:'light.x',state:state||'on',attributes:attrs},
                                    'switch.s':{entity_id:'switch.s',state:'on',attributes:{}}},language:'en',themes:{},config:{},user:{},callService(){}});
  const c=document.createElement('floor3dx-card');c.setConfig(JSON.parse(JSON.stringify(cfg)));
  const full={brightness:255,color_mode:'rgb',rgb_color:[255,255,255]};
  c.hass=mk(full);
  const h=document.createElement('div');h.style.cssText='width:500px;height:350px';document.body.appendChild(h);h.appendChild(c);
  await new Promise(r=>{const t=setInterval(()=>{if(c._modelready){clearInterval(t);r()}},50)});
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  const read=()=>{const o={};modes.forEach((m,k)=>{const l=c._scene.getObjectByName(names[k]+'_light');o[m]=[+l.intensity.toFixed(3),'#'+l.color.getHexString()]});
    const l=c._scene.getObjectByName(names[5]+'_light');o.switch=[+l.intensity.toFixed(3),'#'+l.color.getHexString()];return o;};
  const out={};
  c.hass=mk(full); await wait(300); out.full=read();
  c.hass=mk({brightness:64,color_mode:'rgb',rgb_color:[0,0,255]}); await wait(300); out.dimBlue=read();
  c.hass=mk({brightness:128,color_mode:'color_temp',color_temp_kelvin:2700,color_temp:370,rgb_color:[255,170,100]}); await wait(300); out.warm=read();
  c.hass=mk({brightness:128,color_mode:'color_temp',color_temp_kelvin:2700,color_temp:370}); await wait(300); out.warmNoRgb=read();
  // no-op update must not trigger a light update
  const before=c._updatelight.length; let calls=0; const orig=c._updatelight.bind(c); c._updatelight=(...a)=>{calls++;return orig(...a)};
  c.hass=mk({brightness:128,color_mode:'color_temp',color_temp_kelvin:2700,color_temp:370}); await wait(300); out.noopCalls=calls;
  c.hass=mk({brightness:128,color_mode:'color_temp',color_temp_kelvin:2700,color_temp:370},'off'); await wait(300); out.off=read();
  return out;
}"""

if __name__ == '__main__':
    result, errors = run(after=lambda page: page.evaluate(JS))
    print(json.dumps(result, indent=1))
    lumens = 0.003 * 1000
    ok = True
    def check(name, cond):
        global ok
        print(('PASS ' if cond else 'FAIL ') + name)
        ok = ok and cond
    r = result
    check('full: every mode at full intensity, white where colour is followed',
          r['full']['yes'] == [3.0, '#ffffff'] and r['full']['color'] == [3.0, '#ffffff'] and
          r['full']['brightness'] == [3.0, '#ff8000'] and r['full']['no'] == [3.0, '#ff8000'])
    check('dim blue: yes -> quarter intensity, blue', r['dimBlue']['yes'] == [round(3.0 * 64 / 255, 3), '#0000ff'])
    check('dim blue: brightness -> quarter intensity, config colour', r['dimBlue']['brightness'] == [round(3.0 * 64 / 255, 3), '#ff8000'])
    check('dim blue: color -> full intensity, blue', r['dimBlue']['color'] == [3.0, '#0000ff'])
    check('dim blue: no -> unchanged', r['dimBlue']['no'] == [3.0, '#ff8000'])
    check('colour temperature uses rgb_color from Home Assistant', r['warm']['yes'] == [round(3.0 * 128 / 255, 3), '#ffaa64'])
    check('colour temperature without rgb_color is converted from kelvin', r['warmNoRgb']['yes'][1] != '#ff8000' and r['warmNoRgb']['yes'][1] != '#ffffff')
    check('unchanged hass update does not re-light', r['noopCalls'] == 0)
    check('off: every light on the entity dark, switch untouched', all(r['off'][m][0] == 0 for m in ('yes', 'brightness', 'color', 'no')) and r['off']['switch'][0] == 3.0)
    check('plain switch: lumens and config colour', r['full']['switch'] == [3.0, '#ff8000'])
    check('no page errors', not errors)
    for e in errors:
        print('  ', e)
    raise SystemExit(0 if ok else 1)
