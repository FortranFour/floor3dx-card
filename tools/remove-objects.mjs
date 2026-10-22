// Usage: node remove-objects.mjs <in.glb> <out.glb> <object> [<object> ...]
// Removes named objects from a model, re-encoding it as it was (Draco, WebP textures, names and
// node transforms untouched). An object is a node name as the card shows it (34_1, Frame7_1_9).
//   within:<object>   every object whose centre lies inside that object's box (grown by a tenth),
//                     the object itself excluded
//   keep:<object>     taken out of the removal list again (keep:35_1 after within:1_9)
// Prints what it removed. Use it for the parts of a fixture that can never be seen (the dial
// behind a frosted meter glass) or for placeholders a model carries.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS, KHRDracoMeshCompression} from '@gltf-transform/extensions';
import {prune} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import {MeshoptEncoder, MeshoptDecoder} from 'meshoptimizer';
await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder':await draco3d.createEncoderModule(),'draco3d.decoder':await draco3d.createDecoderModule(),
  'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const [src,out,...specs]=process.argv.slice(2);
if(!src||!out||!specs.length){console.error('usage: node remove-objects.mjs <in.glb> <out.glb> <object|within:<object>|keep:<object>> ...');process.exit(1);}
const doc=await io.read(src);
const hadDraco=doc.getRoot().listExtensionsUsed().some(e=>e.extensionName==='KHR_draco_mesh_compression');
const nodes=doc.getRoot().listNodes();
const byName=new Map(nodes.map(n=>[n.getName(),n]));
// world boxes from the mesh positions and the node's world matrix
const mul=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const boxOf=(node)=>{const mesh=node.getMesh(); if(!mesh) return null; const m=node.getWorldMatrix(); let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const prim of mesh.listPrimitives()){const pos=prim.getAttribute('POSITION'); if(!pos) continue; const v=[0,0,0]; for(let i=0;i<pos.getCount();i++){pos.getElement(i,v); const w=mul(m,v); for(let k=0;k<3;k++){min[k]=Math.min(min[k],w[k]);max[k]=Math.max(max[k],w[k]);}}}
  return isFinite(min[0])?{min,max}:null;};
const remove=new Set();
for(const spec of specs){
  const within=/^within:(.+)$/i.exec(spec), keep=/^keep:(.+)$/i.exec(spec);
  if(keep){remove.delete(keep[1].trim()); continue;}
  if(within){const c=byName.get(within[1].trim()); if(!c){console.warn('no object named '+within[1]); continue;} const b=boxOf(c); if(!b){console.warn(within[1]+' has no geometry'); continue;}
    const span=Math.max(...[0,1,2].map(k=>b.max[k]-b.min[k])), g=span*0.1;
    for(const n of nodes){ if(n===c||!n.getName()) continue; const nb=boxOf(n); if(!nb) continue; const ctr=[0,1,2].map(k=>(nb.min[k]+nb.max[k])/2);
      if(ctr.every((x,k)=>x>=b.min[k]-g&&x<=b.max[k]+g)) remove.add(n.getName()); }
    continue;}
  if(!byName.has(spec)){console.warn('no object named '+spec); continue;}
  remove.add(spec);
}
for(const name of remove){const n=byName.get(name); if(n) n.dispose();}
// keepAttributes: prune() would otherwise drop the UVs of meshes whose material has no texture, and the
// card draws text and pictures onto exactly such panels (2.0.4: garage readouts went blank)
await doc.transform(prune({keepAttributes:true, keepLeaves:true}));
if(hadDraco) doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
  method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, encodeSpeed:0, decodeSpeed:5,
  quantizationBits:{POSITION:14,NORMAL:10,COLOR:8,TEX_COORD:12,GENERIC:12}, quantizationVolume:'mesh'});
await io.write(out, doc);
console.log('removed '+remove.size+' object(s): '+Array.from(remove).join(', '));
console.log('objects left: '+doc.getRoot().listNodes().filter(n=>n.getMesh()).length);
