"""Checks of the three.js r186 engine setup that the pixel comparison of render_views.py cannot see,
because it draws a second card on a page where the first has already run.

- the first card on a fresh page keeps its hex colours as given (colour management is off from module
  load, not from the first renderer; 2.0.2 turned `#224` into `04040f` on a refresh)
- a type3d: image picture shows on the model (the texture's GPU storage is re-allocated when the
  canvas grows from its 2x2 placeholder; 2.0.2 kept the empty placeholder and the panel stayed blank)
"""
import json
import numpy as np
from PIL import Image
from run import run

OUT = 'dev/out/test_engine.png'

JS = r"""async () => {
  const first = window.card;
  const out = {bgConfig: first._config.backgroundColor, bgScene: first._scene.background && '#' + first._scene.background.getHexString()};
  const names=[];first._scene.traverse(o=>{if(o.isMesh&&o.name&&o.name.startsWith('wall'))names.push(o.name)});
  const ents=names.slice(0,40).map(n=>({entity:'sun.sun',type3d:'image',object_id:n,image:{url:'/dev/harness/assets/red.png',fit:'stretch',aspect:'1'}}));
  const cfg=Object.assign({},first._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'no',object_groups:[],entities:ents});
  const c=document.createElement('floor3dx-card');c.setConfig(JSON.parse(JSON.stringify(cfg)));
  c.hass={states:{'sun.sun':{entity_id:'sun.sun',state:'above_horizon',attributes:{}}},language:'en',themes:{},config:{},user:{},callService(){}};
  const h=document.createElement('div');h.style.cssText='position:fixed;left:0;top:0;width:800px;height:560px;z-index:99;background:#000';document.body.appendChild(h);h.appendChild(c);
  await new Promise(r=>{const t=setInterval(()=>{if(c._modelready){clearInterval(t);r()}},50)});
  await new Promise(r=>setTimeout(r,3000)); c._render(); await new Promise(r=>setTimeout(r,500)); c._render();
  out.bound = ents.length;
  return out;
}"""

if __name__ == '__main__':
    def after(page):
        out = page.evaluate(JS)
        page.wait_for_timeout(500)
        page.screenshot(path=OUT, clip={'x': 0, 'y': 0, 'width': 800, 'height': 560})
        a = np.asarray(Image.open(OUT).convert('RGB')).astype(int)
        out['redPixels'] = int(((a[:, :, 0] > 150) & (a[:, :, 1] < 80) & (a[:, :, 2] < 80)).sum())
        return out
    result, errors = run(after=after, timeout_ms=200000)
    print(json.dumps(result))
    r = result
    ok = True
    def check(name, cond):
        global ok
        print(('PASS ' if cond else 'FAIL ') + name)
        ok = ok and cond
    expected = r['bgConfig']
    if len(expected) == 4:  # #rgb -> #rrggbb
        expected = '#' + ''.join(ch * 2 for ch in expected[1:])
    check('first card on a fresh page: background colour as configured', r['bgScene'] == expected.lower())
    check('image panels drawn (red pixels on the walls)', r['redPixels'] > 0)
    check('no page errors', not errors)
    raise SystemExit(0 if ok else 1)
