// Usage: node compress-textures.mjs <in.glb> <out-base> [maxSize=2048]
// Writes <out-base>.draco-webp.glb : textures -> WebP (PNG sources lossless, JPEG sources q90),
// anything larger than maxSize scaled down, then the same Draco settings as compress.mjs.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS, KHRDracoMeshCompression, EXTTextureWebP} from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
const [src, base, maxArg] = process.argv.slice(2); const MAX = Number(maxArg || 2048);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder':await draco3d.createEncoderModule(),'draco3d.decoder':await draco3d.createDecoderModule()});
const d=await io.read(src);
let before=0, after=0;
for (const t of d.getRoot().listTextures()) {
  const img=t.getImage(); const mime=t.getMimeType(); const [w,h]=t.getSize(); before+=img.byteLength;
  let p=sharp(img);
  if ((await sharp(img).stats()).isOpaque) p=p.removeAlpha();
  if (Math.max(w,h)>MAX) p=p.resize({width:w>=h?MAX:undefined,height:h>w?MAX:undefined,kernel:'lanczos3'});
  const out=await (mime==='image/png' ? p.webp({lossless:true, effort:6}) : p.webp({quality:90, effort:6})).toBuffer();
  // never make a texture bigger than it was (unless it had to be resized anyway)
  if (out.byteLength < img.byteLength || Math.max(w,h)>MAX) { t.setImage(out).setMimeType('image/webp'); after+=out.byteLength;
    console.log(`${w}x${h} ${mime} ${(img.byteLength/1024)|0} KB -> ${t.getSize().join('x')} webp ${(out.byteLength/1024)|0} KB${mime==='image/png'&&Math.max(w,h)<=MAX?' (lossless)':''}`);
  } else { after+=img.byteLength; console.log(`${w}x${h} ${mime} kept (WebP would not be smaller)`); }
}
if (d.getRoot().listTextures().some(t=>t.getMimeType()==='image/webp')) d.createExtension(EXTTextureWebP).setRequired(true);
console.log(`textures: ${(before/1024)|0} KB -> ${(after/1024)|0} KB`);
d.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
  method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, encodeSpeed:0, decodeSpeed:5,
  quantizationBits:{POSITION:14,NORMAL:10,COLOR:8,TEX_COORD:12,GENERIC:12}, quantizationVolume:'mesh'});
await io.write(base+'.draco-webp.glb', d);
