/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Compressed glTF support
 *
 * Loads .glb / .gltf models, including the compressed variants:
 *   - KHR_draco_mesh_compression   (Draco geometry)
 *   - EXT_meshopt_compression      (Meshopt geometry / animation)
 *   - KHR_mesh_quantization        (handled natively by GLTFLoader)
 *   - KHR_texture_basisu           (KTX2 / Basis GPU textures)
 *   - EXT_texture_webp             (handled natively by GLTFLoader)
 *
 * The file is downloaded once, its header is inspected, and only the decoders the
 * model actually declares are set up. Plain models pay no extra cost.
 */
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const EXT_DRACO = 'KHR_draco_mesh_compression';
const EXT_MESHOPT = 'EXT_meshopt_compression';
const EXT_BASISU = 'KHR_texture_basisu';

// Same decoder builds that ship with the bundled three.js release.
const CDN_DRACO = `https://cdn.jsdelivr.net/npm/three@0.${THREE.REVISION}.1/examples/js/libs/draco/gltf/`;
const CDN_BASIS = `https://cdn.jsdelivr.net/npm/three@0.${THREE.REVISION}.1/examples/js/libs/basis/`;

export interface CompressedModelOptions {
  /** Folder holding draco_wasm_wrapper.js + draco_decoder.wasm (+ draco_decoder.js). */
  dracoPath?: string;
  /** Folder holding basis_transcoder.js + basis_transcoder.wasm. */
  basisPath?: string;
  /** Needed to pick the right GPU texture format for KTX2 textures. */
  renderer?: THREE.WebGLRenderer;
  onProgress?: (event: ProgressEvent) => void;
  log?: (message: string) => void;
}

// Decoders are shared by every card instance: one worker pool, one WASM compile.
let sharedDraco: DRACOLoader | undefined;
let sharedDracoPath: string | undefined;
let sharedKtx2: KTX2Loader | undefined;
let sharedKtx2Path: string | undefined;

const resolvedPaths: Map<string, Promise<string>> = new Map();

function withSlash(path: string): string {
  return path.charAt(path.length - 1) === '/' ? path : path + '/';
}

/** Folder this card's JS file was served from (works for /local/... and /hacsfiles/...). */
function moduleBase(): string {
  try {
    return new URL('./', import.meta.url).href;
  } catch (e) {
    return '';
  }
}

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
    return res.ok;
  } catch (e) {
    return false;
  }
}

/**
 * Pick the decoder folder: explicit config > folder next to the card > CDN.
 * "Next to the card" means the card's own folder first, then a draco/ or basis/ sub-folder.
 * An explicit path is trusted as-is so a wrong path gives a clear error instead of a silent CDN hit.
 */
function resolveDecoderPath(
  kind: 'draco' | 'basis',
  configured: string | undefined,
  probeFile: string,
  cdn: string,
  log: (m: string) => void,
): Promise<string> {
  if (configured && configured !== '') {
    return Promise.resolve(withSlash(configured));
  }

  if (!resolvedPaths.has(kind)) {
    resolvedPaths.set(
      kind,
      (async () => {
        const base = moduleBase();
        if (base) {
          // 1) same folder as the card (HACS only downloads files directly inside dist/)
          // 2) a draco/ or basis/ sub-folder (manual installs)
          for (const local of [base, `${base}${kind}/`]) {
            if (await probe(local + probeFile)) {
              log(`${kind} decoder: local (${local})`);
              return local;
            }
          }
        }
        log(`${kind} decoder: not found next to the card, using CDN (${cdn})`);
        return cdn;
      })(),
    );
  }
  return resolvedPaths.get(kind);
}

/** Read the glTF JSON out of a .glb container (or a plain .gltf) without parsing the geometry. */
function readGltfJson(data: ArrayBuffer): any {
  try {
    const head = new DataView(data, 0, Math.min(20, data.byteLength));
    const isBinary = data.byteLength >= 20 && head.getUint32(0, true) === 0x46546c67; // 'glTF'

    if (!isBinary) {
      return JSON.parse(new TextDecoder().decode(data));
    }

    const chunkLength = head.getUint32(12, true);
    const chunkType = head.getUint32(16, true);
    if (chunkType !== 0x4e4f534a) return {}; // 'JSON'

    return JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, chunkLength)));
  } catch (e) {
    return {};
  }
}

function fetchModel(url: string, onProgress?: (event: ProgressEvent) => void): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fileLoader = new THREE.FileLoader();
    fileLoader.setResponseType('arraybuffer');
    fileLoader.load(
      url,
      (data) => resolve(data as unknown as ArrayBuffer),
      onProgress,
      (err: any) => reject(new Error(`Unable to download ${url}${err && err.message ? ': ' + err.message : ''}`)),
    );
  });
}

export async function loadCompressedGLTF(
  path: string,
  file: string,
  options: CompressedModelOptions = {},
): Promise<GLTF> {
  const log = options.log || (() => undefined);
  const t0 = performance.now();

  const data = await fetchModel(path + file, options.onProgress);
  const t1 = performance.now();

  const json = readGltfJson(data);
  const used: string[] = [].concat(json.extensionsUsed || [], json.extensionsRequired || []);

  const loader = new GLTFLoader();

  if (used.indexOf(EXT_DRACO) >= 0) {
    const dracoPath = await resolveDecoderPath('draco', options.dracoPath, 'draco_wasm_wrapper.js', CDN_DRACO, log);
    if (!sharedDraco || sharedDracoPath !== dracoPath) {
      if (sharedDraco) sharedDraco.dispose();
      sharedDraco = new DRACOLoader();
      sharedDraco.setDecoderPath(dracoPath);
      sharedDraco.setWorkerLimit(Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)));
      sharedDracoPath = dracoPath;
    }
    loader.setDRACOLoader(sharedDraco);
  }

  if (used.indexOf(EXT_MESHOPT) >= 0) {
    loader.setMeshoptDecoder(MeshoptDecoder);
  }

  if (used.indexOf(EXT_BASISU) >= 0) {
    if (!options.renderer) {
      throw new Error('KTX2 textures need a renderer to detect the supported GPU texture formats');
    }
    const basisPath = await resolveDecoderPath('basis', options.basisPath, 'basis_transcoder.js', CDN_BASIS, log);
    if (!sharedKtx2 || sharedKtx2Path !== basisPath) {
      if (sharedKtx2) sharedKtx2.dispose();
      sharedKtx2 = new KTX2Loader();
      sharedKtx2.setTranscoderPath(basisPath);
      sharedKtx2.detectSupport(options.renderer);
      sharedKtx2Path = basisPath;
    }
    loader.setKTX2Loader(sharedKtx2);
  }

  const gltf = await new Promise<GLTF>((resolve, reject) => {
    loader.parse(data, path, resolve, (err: any) => {
      const message = err && err.message ? err.message : String(err);
      reject(
        new Error(
          used.indexOf(EXT_DRACO) >= 0 || used.indexOf(EXT_BASISU) >= 0
            ? `${message} (model uses ${used.join(', ')}; check draco_path / basis_path)`
            : message,
        ),
      );
    });
  });

  const t2 = performance.now();
  log(
    `${file}: ${(data.byteLength / 1048576).toFixed(2)} MB | download ${Math.round(t1 - t0)} ms | decode ${Math.round(
      t2 - t1,
    )} ms | extensions: ${used.length ? Array.from(new Set(used)).join(', ') : 'none'}`,
  );

  return gltf;
}

/**
 * Sharper textures at grazing angles (floors, long walls) for a negligible GPU cost.
 * Without this, mip-mapped floor textures look like a low-resolution render.
 */
export function applyTextureQuality(root: THREE.Object3D, renderer: THREE.WebGLRenderer, maxAnisotropy = 8): void {
  const anisotropy = Math.min(maxAnisotropy, renderer.capabilities.getMaxAnisotropy());
  if (anisotropy <= 1) return;

  const seen = new Set<THREE.Texture>();
  root.traverse((node: any) => {
    if (!node.isMesh || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material: any) => {
      ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap'].forEach((slot) => {
        const texture: THREE.Texture = material[slot];
        if (texture && !seen.has(texture)) {
          seen.add(texture);
          if (texture.anisotropy < anisotropy) {
            texture.anisotropy = anisotropy;
            // Textures still downloading (OBJ/MTL) pick the value up on their first upload.
            if (texture.version > 0) texture.needsUpdate = true;
          }
        }
      });
    });
  });
}
