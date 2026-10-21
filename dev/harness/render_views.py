"""Reference renders of a model for before/after comparison across card versions.

    python3 dev/harness/render_views.py <out-dir> [house|garage|all]

Renders a fixed set of views (plain, lights with shadows, daylight at a fixed sun, look themes) of the
private models in dev/private/ with the built card, and writes one PNG per view. Compare two
directories with compare_views.py. The views use fixed cameras and a fake hass, so two runs of the
same build give the same picture to within the software renderer's noise."""
import json, os, sys
from run import run

OUT = sys.argv[1] if len(sys.argv) > 1 else 'dev/out/views'
WHICH = sys.argv[2] if len(sys.argv) > 2 else 'all'
os.makedirs(OUT, exist_ok=True)

HOUSE = {
    'file': 'house.11.12.24.draco.glb',
    'camera': {'position': {'x': 782.7, 'y': 1349.8, 'z': -33.1}, 'target': {'x': 20.6, 'y': -15.4, 'z': -114.3}},
    'lights': [
        {'entity': 'light.a', 'type3d': 'light', 'object_id': '83_3', 'light': {'color': '#FFB830', 'decay': 0.7, 'distance': 250, 'lumens': 1000, 'shadow': 'no', 'light_direction': {'x': -2, 'y': 5, 'z': -1.5}}},
        {'entity': 'light.b', 'type3d': 'light', 'object_id': '141_1', 'light': {'color': '#FFB830', 'decay': 1.2, 'distance': 250, 'lumens': 800, 'shadow': 'yes', 'vertical_alignment': 'middle'}},
        {'entity': 'light.c', 'type3d': 'light', 'object_id': '1_4', 'light': {'color': '#FFB830', 'decay': 1.2, 'distance': 250, 'lumens': 1000, 'shadow': 'yes', 'vertical_alignment': 'middle'}},
        {'entity': 'light.d', 'type3d': 'light', 'object_id': '84_1', 'light': {'color': '#FFB830', 'decay': 1.4, 'distance': 300, 'lumens': 900, 'shadow': 'no', 'light_direction': {'x': 0.4, 'y': -5, 'z': 0}}},
        {'entity': 'light.e', 'type3d': 'light', 'object_id': '78_1', 'light': {'color': '#FFB830', 'decay': 1.6, 'distance': 110, 'lumens': 800, 'shadow': 'no', 'vertical_alignment': 'middle'}},
        {'entity': 'light.a', 'type3d': 'color', 'object_id': '83_3', 'colorcondition': [{'state': 'on', 'color': 'Gold'}, {'state': 'off', 'color': 'LightSteelBlue'}]},
    ],
}
GARAGE = {
    'file': 'garage.06.01.25.draco-webp.glb',
    'camera': None,  # the model's default view
    'lights': [],
}

VIEWS = [
    ('plain', {}),
    ('lights', {'lights': True, 'shadow': 'yes', 'globalLightPower': 0.77}),
    ('daylight', {'daylight': {'sun_entity': 'sun.sun'}, 'north': {'x': 0, 'z': -1}, 'globalLightPower': 0.77}),
    ('look-day', {'look': {'theme': 'day', 'edge_skip': 'seams, floors'}}),
    ('look-neon', {'look': {'theme': 'neon', 'edge_skip': 'seams, floors'}, 'lights': True}),
    # 2.0 opt-ins (ignored by a 1.x build, so these views only compare 2.x builds with each other)
    ('lights-physical', {'lights': True, 'shadow': 'yes', 'globalLightPower': 0.77, 'lights_mode': 'physical'}),
    ('managed', {'lights': True, 'shadow': 'yes', 'globalLightPower': 0.77, 'color_management': 'managed'}),
]

JS = r"""async ([model, view, extra]) => {
  const base=window.card;
  const cfg=Object.assign({},base._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'no',object_groups:[],entities:[],backgroundColor:'#848C8F',objfile:model.file});
  delete cfg.style; delete cfg.camera_rotate; delete cfg.look; delete cfg.daylight;
  if(model.camera){cfg.camera_position=model.camera.position;cfg.camera_target=model.camera.target;}
  Object.keys(extra).forEach(k=>{ if(k==='lights'){cfg.entities=model.lights;} else if(k==='lights_mode'){cfg.lights=extra[k];} else cfg[k]=extra[k]; });
  const states={'light.a':{state:'on',attributes:{}},'light.b':{state:'on',attributes:{}},'light.c':{state:'on',attributes:{}},'light.d':{state:'on',attributes:{}},'light.e':{state:'on',attributes:{}},
    'sun.sun':{state:'above_horizon',attributes:{elevation:35,azimuth:140,rising:true}}};
  const c=document.createElement('floor3dx-card');c.setConfig(JSON.parse(JSON.stringify(cfg)));c.hass={states,language:'en',themes:{},config:{},user:{},callService(){}};
  const h=document.createElement('div');h.id='shot';h.style.cssText='position:fixed;left:0;top:0;width:800px;height:560px;z-index:99;background:#000';document.body.appendChild(h);h.appendChild(c);
  const t0=performance.now(); while(!c._modelready && performance.now()-t0<240000) await new Promise(r=>setTimeout(r,200));
  await new Promise(r=>setTimeout(r,1500)); c._render(); window.shot=h; return c._modelready;
}"""

MODELS = {'house': HOUSE, 'garage': GARAGE}
todo = [WHICH] if WHICH in MODELS else list(MODELS)
for name in todo:
    model = MODELS[name]
    def after(page, model=model, name=name):
        for view, extra in VIEWS:
            if name == 'garage' and view in ('lights', 'lights-physical', 'managed'):
                continue
            ok = page.evaluate(JS, [model, view, extra])
            page.wait_for_timeout(500)
            page.screenshot(path=f'{OUT}/{name}-{view}.png', clip={'x': 0, 'y': 0, 'width': 800, 'height': 560}, timeout=120000)
            page.evaluate("()=>{window.shot.remove()}")
            print(name, view, 'ready' if ok else 'NOT READY', flush=True)
    result, errors = run(query=f'path=/dev/private/&model={model["file"]}', after=after, timeout_ms=240000)
    for e in errors[:5]:
        print('  error:', e[:200])
