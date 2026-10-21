"""Checks the `look` option: off leaves materials and background untouched; a theme wraps every mesh
material in a themed copy with the original kept, draws edge lines, sets the stage background, keeps
colour conditions working, glows a lit lamp object, and the day theme uses normal line blending."""
import json
from run import run

JS = r"""async () => {
  const names=[];window.card._scene.traverse(o=>{if(o.isMesh&&o.name){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;if(b.max.y-b.min.y>20)names.push(o.name)}});
  const hass={states:{'light.x':{state:'on',attributes:{brightness:255}}},language:'en',themes:{},config:{},user:{},callService(){}};
  const make=async(look)=>{
    const ents=[{entity:'light.x',type3d:'door',object_id:names[5],door:{doortype:'swing',side:'left',direction:'inner',degrees:'30'}},
                {entity:'light.x',type3d:'light',object_id:names[0],light:{shadow:'no',lumens:'800',color:'#FFB830',distance:'200',decay:'1'}},
                {entity:'light.x',type3d:'color',object_id:names[1],colorcondition:[{state:'on',color:'Gold'},{state:'off',color:'LightSteelBlue'}]}];
    const cfg=Object.assign({},window.card._config,{type:'custom:floor3dx-card',pro_skill:'mobile',shadow:'no',backgroundColor:'#848c8f',object_groups:[],entities:ents});
    if(look)cfg.look=look;
    const c=document.createElement('floor3dx-card');c.setConfig(JSON.parse(JSON.stringify(cfg)));c.hass=hass;
    const h=document.createElement('div');h.style.cssText='width:400px;height:300px';document.body.appendChild(h);h.appendChild(c);
    await new Promise(r=>{const t=setInterval(()=>{if(c._modelready){clearInterval(t);r()}},50)});
    await new Promise(r=>setTimeout(r,500)); return c;};
  const out={};
  const plain=await make(null);
  out.plainBg='#'+plain._scene.background.getHexString(); out.plainLook=!!plain._look; out.plainEdges=0; plain._scene.traverse(o=>{if(o.name&&o.name.startsWith('f3dx_edge_'))out.plainEdges++;});
  const neon=await make({theme:'neon'});
  out.neonBg='#'+neon._scene.background.getHexString(); out.edges=neon._look.edgeLines.length; out.themed=neon._look.themed.size;
  const m0=neon._scene.getObjectByName(names[2]).material; out.wrapped=!!(m0.userData&&m0.userData.f3dxThemedOf); out.originalKept=neon._look.originalOf(m0)!==m0;
  out.blendAdditive=neon._look.edgeMaterial.blending===2; // THREE.AdditiveBlending
  const dl=neon._look.edgeLines.find(l=>l.parent&&l.parent.name===names[5]); const v=(o)=>{const p=neon._camera.position.clone(); return o.getWorldPosition(p);};
  // the door mesh's geometry was re-centred on its hinge and the mesh moved: the line geometry must match, so the
  // line's bounding box in world space must overlap the mesh's
  dl.geometry.computeBoundingBox(); const lb=dl.geometry.boundingBox.clone().applyMatrix4(dl.matrixWorld); dl.parent.geometry.computeBoundingBox(); const mb=dl.parent.geometry.boundingBox.clone().applyMatrix4(dl.parent.matrixWorld);
  out.doorLineOnMesh=lb.getCenter(v(dl)).distanceTo(mb.getCenter(v(dl.parent)))<2;
  // colour condition still applies: Gold on, LightSteelBlue off, on the themed material
  const cm=()=>'#'+neon._scene.getObjectByName(names[1]).material.color.getHexString();
  out.condOn=cm(); neon.hass={...hass,states:{'light.x':{state:'off',attributes:{}}}}; await new Promise(r=>setTimeout(r,300)); out.condOff=cm();
  const lampMat=()=>{const m=neon._scene.getObjectByName(names[0]).material; return m.emissive?'#'+m.emissive.getHexString():null;};
  out.glowOff=lampMat(); neon.hass=hass; await new Promise(r=>setTimeout(r,300)); out.glowOn=lampMat();
  const day=await make({theme:'day',edges:'yes'}); out.dayBg='#'+day._scene.background.getHexString(); out.dayBlendNormal=day._look.edgeMaterial.blending===1;
  const custom=await make({theme:'custom',custom:{dark:'#102030',light:'#80a0c0',walls:'#a0b0c0',edges:'#ff8800',stage:'#f0f0f0',stage_day:'#ffffff',hue:0.3}});
  out.customBg='#'+custom._scene.background.getHexString(); out.customEdge='#'+custom._look.edgeMaterial.color.getHexString(); out.customBlendNormal=custom._look.edgeMaterial.blending===1;
  const cm2=custom._scene.getObjectByName(names[2]).material; const u=(cm2.userData&&cm2.userData.f3dxThemedOf)?custom._look.themed.get(cm2.userData.f3dxThemedOf):null; out.customUniforms=u?[u.uniforms.uTheme.value,+u.uniforms.uCustomHue.value.toFixed(2),'#'+new (custom._scene.background.constructor)(u.uniforms.uCustomWall.value.x,u.uniforms.uCustomWall.value.y,u.uniforms.uCustomWall.value.z).getHexString()]:null;
  const noEdges=await make({theme:'blueprint',edges:'no'}); out.noEdges=noEdges._look.edgeLines.length; out.bpBg='#'+noEdges._scene.background.getHexString();
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
    check('no look: background as configured, no look object, no edge lines', r['plainBg'] == '#848c8f' and not r['plainLook'] and r['plainEdges'] == 0)
    check('neon: stage background, edge lines drawn, materials wrapped with originals kept',
          r['neonBg'] != '#848c8f' and r['edges'] > 0 and r['themed'] > 0 and r['wrapped'] and r['originalKept'])
    check('neon edges additive, day edges normal', r['blendAdditive'] and r['dayBlendNormal'])
    check('edge lines of a swing door stay on the door after its hinge re-centring', r['doorLineOnMesh'])
    check('colour condition still works on the themed material', r['condOn'] == '#ffd700' and r['condOff'] == '#b0c4de')
    check('lit lamp object glows in its light colour, dark when off', r['glowOff'] == '#000000' and r['glowOn'] not in (None, '#000000'))
    check('day and blueprint stage colours differ from neon', len({r['neonBg'], r['dayBg'], r['bpBg']}) == 3)
    check('custom theme: stage midway between stage and stage_day, edge colour and normal blending on a light stage, uniforms set',
          r['customBg'] in ('#f7f7f7', '#f8f8f8') and r['customEdge'] == '#ff8800' and r['customBlendNormal'] and r['customUniforms'] == [6, 0.3, '#a0b0c0'])
    check('edges: no draws none', r['noEdges'] == 0)
    check('no page errors', not errors)
    for e in errors:
        print('  ', e)
    raise SystemExit(0 if ok else 1)
