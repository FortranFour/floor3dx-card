// Usage: node compress.mjs <in.glb> <out-base>
// Writes <out-base>.draco.glb and <out-base>.meshopt.glb for floor3dx-card.
// Guarantees the card depends on: node and mesh names unchanged and in the same order,
// every node keeps an identity transform, nothing is merged, joined or pruned.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS, KHRDracoMeshCompression, EXTMeshoptCompression, KHRMeshQuantization} from '@gltf-transform/extensions';
import {reorder, quantize} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import {MeshoptEncoder, MeshoptDecoder} from 'meshoptimizer';
await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder':await draco3d.createEncoderModule(),'draco3d.decoder':await draco3d.createDecoderModule(),
  'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const src=process.argv[2], base=process.argv[3];

// Draco: geometry only. Quantisation lives inside the Draco stream, so nodes keep identity transforms.
{ const d=await io.read(src);
  d.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
    method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, encodeSpeed:0, decodeSpeed:5,
    quantizationBits:{POSITION:14,NORMAL:10,COLOR:8,TEX_COORD:12,GENERIC:12}, quantizationVolume:'mesh'});
  await io.write(base+'.draco.glb', d); }

// Meshopt: positions stay float32 on purpose. Quantising positions would move the de-quantisation
// transform onto every node, and the card's door/pivot code assumes identity node transforms.
{ const d=await io.read(src);
  await d.transform(reorder({encoder:MeshoptEncoder, level:'medium'}),
                    quantize({pattern:/^(NORMAL|TANGENT|TEXCOORD_\d+|COLOR_\d+)$/, quantizeNormal:8, quantizeTexcoord:12}));
  d.createExtension(KHRMeshQuantization).setRequired(true); // int8 normals must be declared
  d.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
  await io.write(base+'.meshopt.glb', d); }
