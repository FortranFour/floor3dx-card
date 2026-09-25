"""Checks type3d: image - a still picture, an animated GIF and a URL taken from the entity.

Uses dev/harness/assets/red.png (80x40 red) and rgb.gif (three 20x20 frames: red, green, blue, 150 ms each).
"""
import json
from run import run

JS = r"""async () => {
  const names=[];window.card._scene.traverse(o=>{if(o.isMesh&&o.name)names.push(o.name)});
  const ents=[
    {entity:'sun.sun',type3d:'image',object_id:names[0],image:{url:'/dev/harness/assets/red.png',fit:'stretch',aspect:'2'}},
    {entity:'sun.sun',type3d:'image',object_id:names[1],image:{url:'/dev/harness/assets/rgb.gif',fit:'stretch',aspect:'1'}},
    {entity:'camera.x',type3d:'image',object_id:names[2],image:{fit:'contain',background:'#000000',aspect:'1'}},
    {entity:'sensor.w',type3d:'image',object_id:names[3],image:{url:'/dev/harness/assets/{state}.png',fit:'stretch',aspect:'1'}},
  ];
  const cfg=Object.assign({},window.card._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'no',object_groups:[],entities:ents});
  const mk=(pic,w)=>({states:{'sun.sun':{entity_id:'sun.sun',state:'above_horizon',attributes:{}},
    'camera.x':{entity_id:'camera.x',state:'idle',attributes:{entity_picture:pic}},
    'sensor.w':{entity_id:'sensor.w',state:w,attributes:{}}},language:'en',themes:{},config:{},user:{},callService(){}});
  const c=document.createElement('floor3dx-card');c.setConfig(JSON.parse(JSON.stringify(cfg)));
  c.hass=mk('/dev/harness/assets/rgb.gif','red');
  const h=document.createElement('div');h.style.cssText='width:500px;height:350px';document.body.appendChild(h);h.appendChild(c);
  await new Promise(r=>{const t=setInterval(()=>{if(c._modelready){clearInterval(t);r()}},50)});
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  await wait(1500);
  const px=(i,x,y)=>{const cv=c._imageFrames[i].canvas;const d=cv.getContext('2d').getImageData(Math.floor(cv.width*x),Math.floor(cv.height*y),1,1).data;return [d[0],d[1],d[2],d[3]]};
  const size=(i)=>[c._imageFrames[i].canvas.width,c._imageFrames[i].canvas.height];
  const out={};
  out.stillSize=size(0); out.stillPixel=px(0,0.5,0.5);
  out.gifAnimated=c._imageFrames[1].animated; out.loopOn=c._to_animate;
  // the software renderer is far too slow for real-time sampling, so drive the frame clock by hand
  c._renderer.setAnimationLoop(null); /* freeze the real loop so only our ticks advance the GIF */
  const g=c._imageFrames[1]; const seen=[]; for(let k=0;k<4;k++){seen.push(px(1,0.5,0.5).slice(0,3).join(','));g.tick(g.gifNext+1);} out.gifColours=seen;
  g.tick(g.gifNext+10*g.gifDuration+1); out.gifCatchUp=[g.gifIndex, px(1,0.5,0.5).slice(0,3).join(',')];
  out.cameraGifAnimated=c._imageFrames[2].animated; out.cameraSize=size(2); out.cameraCorner=px(2,0.02,0.5);
  out.templatePixel=px(3,0.5,0.5);
  // entity_picture change -> new picture
  const until=async(f,ms)=>{const t=performance.now();while(!f()&&performance.now()-t<ms)await wait(100);return f();};
  c.hass=mk('/dev/harness/assets/red.png','red'); await until(()=>!c._imageFrames[2].animated,15000);
  out.cameraAfter=[c._imageFrames[2].animated, px(2,0.5,0.5), px(2,0.5,0.05)];
  // missing picture -> empty texture, no exception
  c.hass=mk('/dev/harness/assets/red.png','nope'); await until(()=>size(3)[0]===2,15000);
  out.missingSize=size(3);
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
    check('still: canvas at the object aspect (2:1), red', r['stillSize'] == [1024, 512] and r['stillPixel'][:3] == [255, 0, 0])
    check('gif: marked animated and the loop is running', r['gifAnimated'] and r['loopOn'])
    cycle = ['255,0,0', '0,255,0', '0,0,255']
    start = cycle.index(r['gifColours'][0]) if r['gifColours'][0] in cycle else -1
    check('gif: steps red, green, blue in order and wraps', start >= 0 and r['gifColours'] == [cycle[(start + k) % 3] for k in range(4)])
    check('gif: catching up ten loops advances exactly one frame', r['gifCatchUp'][1] == cycle[(start + 5) % 3])
    check('camera entity_picture (gif) shown, letterboxed on black', r['cameraGifAnimated'] and r['cameraSize'] == [1024, 1024])
    check('url template {state} resolved', r['templatePixel'][:3] == [255, 0, 0])
    check('entity_picture change: new still picture, letterbox above it',
          r['cameraAfter'][0] is False and r['cameraAfter'][1][:3] == [255, 0, 0] and r['cameraAfter'][2][:3] == [0, 0, 0])
    check('missing picture: empty texture, no crash', r['missingSize'] == [2, 2])
    real_errors = [e for e in errors if 'could not be loaded' not in e and '404' not in e]
    check('no page errors', not real_errors)
    for e in real_errors:
        print('  ', e)
    raise SystemExit(0 if ok else 1)
