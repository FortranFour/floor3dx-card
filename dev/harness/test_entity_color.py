"""Checks colorcondition colour values `entity` and `entity_color`: the mesh takes the light's colour,
and with `entity` its brightness too, and re-colours when only colour or brightness changes."""
import json
from run import run

JS = r"""async () => {
  const names=[];window.card._scene.traverse(o=>{if(o.isMesh&&o.name)names.push(o.name)});
  const ents=[
    {entity:'light.x',type3d:'color',object_id:names[0],colorcondition:[{state:'off',color:'LightSteelBlue'},{state:'on',color:'entity'}]},
    {entity:'light.x',type3d:'color',object_id:names[1],colorcondition:[{state:'off',color:'LightSteelBlue'},{state:'on',color:'entity_color'}]},
    {entity:'light.x',type3d:'color',object_id:names[2],colorcondition:[{state:'off',color:'LightSteelBlue'},{state:'on',color:'Gold'}]},
    {entity:'switch.s',color_entity:'light.bulb',type3d:'color',object_id:names[3],colorcondition:[{state:'off',color:'LightSteelBlue'},{state:'on',color:'entity'}]},
    {entity:'switch.s',color_entity:'light.bulb',type3d:'light',object_id:names[4],light:{shadow:'no',lumens:'1000',color:'#ff8000',distance:'200',decay:'1'}},
  ];
  const cfg=Object.assign({},window.card._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'no',object_groups:[],entities:ents});
  const mk=(st,attrs,sw,bulb)=>({states:{'light.x':{entity_id:'light.x',state:st,attributes:attrs},
      'switch.s':{entity_id:'switch.s',state:sw||'off',attributes:{}},
      'light.bulb':{entity_id:'light.bulb',state:bulb?'on':'unavailable',attributes:bulb||{}}},language:'en',themes:{},config:{},user:{},callService(){}});
  const c=document.createElement('floor3dx-card');c.setConfig(JSON.parse(JSON.stringify(cfg)));
  c.hass=mk('on',{brightness:255,rgb_color:[255,0,0]});
  const h=document.createElement('div');h.style.cssText='width:500px;height:350px';document.body.appendChild(h);h.appendChild(c);
  await new Promise(r=>{const t=setInterval(()=>{if(c._modelready){clearInterval(t);r()}},50)});
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  const col=(k)=>'#'+c._scene.getObjectByName(names[k]).material.color.getHexString();
  const read=()=>[col(0),col(1),col(2)];
  const out={};
  await wait(300); out.redFull=read();
  c.hass=mk('on',{brightness:255,rgb_color:[0,0,255]}); await wait(300); out.blueFull=read();   // colour change only, state unchanged
  c.hass=mk('on',{brightness:0,rgb_color:[0,0,255]}); await wait(300); out.blueDark=read();     // brightness change only
  c.hass=mk('on',{brightness:128,color_temp_kelvin:2700}); await wait(300); out.warmHalf=read(); // no rgb_color: colour temperature
  c.hass=mk('off',{}); await wait(300); out.off=read();
  const lamp=()=>{const l=c._scene.getObjectByName(names[4]+'_light');return [+l.intensity.toFixed(2),'#'+l.color.getHexString()]};
  c.hass=mk('off',{},'on',null); await wait(300); out.swOnBulbGone=[col(3),lamp()];              // switch on, bulb still unavailable: fallbacks
  c.hass=mk('off',{},'on',{brightness:255,rgb_color:[0,255,0]}); await wait(300); out.swOnGreen=[col(3),lamp()];
  c.hass=mk('off',{},'on',{brightness:64,rgb_color:[0,255,0]}); await wait(300); out.swOnGreenDim=[col(3),lamp()]; // bulb change only
  c.hass=mk('off',{},'off',null); await wait(300); out.swOff=[col(3),lamp()];
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
    check('red at full: entity and entity_color red, static entry gold', r['redFull'] == ['#ff0000', '#ff0000', '#ffd700'])
    check('colour change alone re-colours the entity entries', r['blueFull'][:2] == ['#0000ff', '#0000ff'])
    check('brightness 0: entity darkened to the floor, entity_color unchanged', r['blueDark'][0] == '#000033' and r['blueDark'][1] == '#0000ff')
    check('colour temperature without rgb_color gives a warm tint', r['warmHalf'][1].startswith('#ff') and r['warmHalf'][1] != '#ffffff')
    check('off: all three fall back to the off colour', r['off'] == ['#b0c4de'] * 3)
    check('switch on, bulb unavailable: configured colour and full lumens', r['swOnBulbGone'] == ['#ffffff', [3.0, '#ff8000']])
    check('bulb green: mesh green, light green', r['swOnGreen'] == ['#00ff00', [3.0, '#00ff00']])
    check('bulb dimmed alone: mesh darker, light quarter', r['swOnGreenDim'][0] == '#006600' and r['swOnGreenDim'][1] == [0.75, '#00ff00'])
    check('switch off: off colour, light dark', r['swOff'][0] == '#b0c4de' and r['swOff'][1][0] == 0)
    check('no page errors', not errors)
    for e in errors:
        print('  ', e)
    raise SystemExit(0 if ok else 1)
