"""Checks the `daylight` option: ambient level and colour, background, weather factor, window sun spot
direction, exterior layer, glass glow and the time override, all driven by fake sun/weather states."""
import json
from run import run

JS = r"""async () => {
  const names=[];window.card._scene.traverse(o=>{if(o.isMesh&&o.name){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;if(b.max.y-b.min.y>20)names.push(o.name)}});
  const cfg=Object.assign({},window.card._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'no',globalLightPower:'0.8',backgroundColor:'#848C8F',object_groups:[{object_group:'ext',objects:[{object_id:names[2]}]}],
    entities:[],north:{x:0,z:-1},
    daylight:{colors:{dawn:'#ff6a3a'},weather_entity:'weather.w',time_entity:'input_number.hour',ambient:{day:0.8,night:0.1},windows:[{object_id:names[0],lumens:2000}],exterior:['<ext>'],glow:[{object_id:names[1],entity:'light.g'}]}});
  const mk=(el,az,wx,hour,g)=>({states:{'sun.sun':{state:el>0?'above_horizon':'below_horizon',attributes:{elevation:el,azimuth:az}},'weather.w':{state:wx,attributes:{}},
     'input_number.hour':{state:hour,attributes:{}},'light.g':{state:g,attributes:{}}},language:'en',themes:{},config:{},user:{},callService(){}});
  const c=document.createElement('floor3dx-card');c.setConfig(JSON.parse(JSON.stringify(cfg)));c.hass=mk(50,180,'sunny','unavailable','off');
  const h=document.createElement('div');h.style.cssText='width:500px;height:350px';document.body.appendChild(h);h.appendChild(c);
  await new Promise(r=>{const t=setInterval(()=>{if(c._modelready){clearInterval(t);r()}},50)});
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms)); await wait(400);
  const spot=c._scene.getObjectByName('daylight_'+names[0]); const out={};
  const read=()=>({amb:+c._ambient_light.intensity.toFixed(3), col:'#'+c._ambient_light.color.getHexString(), bg:'#'+c._scene.background.getHexString(), spot:+spot.intensity.toFixed(2),
     ext:+c._daylight.exteriorAmbient.intensity.toFixed(3), glow:'#'+c._scene.getObjectByName(names[1]).material.emissive.getHexString()});
  out.noon=read(); out.outward=[spot? c._daylight.spots[0].outward.x:0, c._daylight.spots[0].outward.z];
  c.hass=mk(50,180,'rainy','unavailable','off'); await wait(300); out.rain=read();
  c.hass=mk(-30,10,'sunny','unavailable','on'); await wait(300); out.night=read();
  c.hass=mk(-30,10,'sunny','unavailable','off'); await wait(300); out.nightOff=read();
  // sun spot: face the window toward the sun and away from it
  const ow=c._daylight.spots[0].outward; const az=Math.round((Math.atan2(ow.x,-ow.z)*180/Math.PI+360)%360); // azimuth the window faces
  c.hass=mk(30,az,'sunny','unavailable','off'); await wait(300); out.sunFacing=read().spot;
  c.hass=mk(30,(az+180)%360,'sunny','unavailable','off'); await wait(300); out.sunBehind=read().spot;
  // time override: 12 = noon, 0 = midnight, whatever the real sun says
  c.hass=mk(-30,10,'sunny','12','off'); await wait(300); out.override12=read().amb;
  c.hass=mk(50,180,'sunny','0','off'); await wait(300); out.override0=read().amb;
  out.extLayer=c._scene.getObjectByName(names[2]).layers.mask; out.camLayers=c._camera.layers.mask;
  // gradient: horizon colour at 0 degrees, blends on both sides, dawn differs from dusk when given
  const colAt=async(el,rising)=>{const st=mk(el,180,'sunny','unavailable','off'); st.states['sun.sun'].attributes.rising=rising; c.hass=st; await wait(200); return '#'+c._ambient_light.color.getHexString();};
  out.dusk0=await colAt(0,false); out.dusk4=await colAt(4,false); out.duskm4=await colAt(-4,false); out.dawn0=await colAt(0,true);
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
    check('noon: full ambient (halved for the hemisphere), day colour, sky background', r['noon']['amb'] == 0.4 and r['noon']['col'] == '#e9f0ff' and r['noon']['bg'] in ('#9fc4e8', '#9fc5e8'))
    check('rain: dimmer and greyer than noon', r['rain']['amb'] < r['noon']['amb'] * 0.6 and r['rain']['bg'] != r['noon']['bg'])
    check('night: night level, blue tint, dark background, exterior nearly off', r['night']['amb'] == 0.05 and r['night']['col'] == '#8a9bc4' and r['night']['bg'] == '#1c2438' and r['night']['ext'] < 0.1)
    check('glow: glass lit at night only while the light is on', r['night']['glow'] != '#000000' and r['nightOff']['glow'] == '#000000' and r['noon']['glow'] == '#000000')
    check('sun spot: on when the sun faces the window, off behind it', r['sunFacing'] > 1 and r['sunBehind'] == 0)
    check('sun spot: off at night', r['night']['spot'] == 0)
    check('time override wins over the real sun', r['override12'] == 0.4 and r['override0'] == 0.05)
    check('exterior object on its own layer, camera sees both', r['extLayer'] == 2 and r['camLayers'] == 3)
    check('gradient: full horizon colour at 0 degrees, partial either side, dawn colour when rising',
          r['dusk0'] == '#ff9a4a' and r['dusk4'] not in ('#ff9a4a', '#e9f0ff') and r['duskm4'] not in ('#ff9a4a', '#8a9bc4') and r['dawn0'] == '#ff6a39')
    check('no page errors', not errors)
    for e in errors:
        print('  ', e)
    raise SystemExit(0 if ok else 1)
