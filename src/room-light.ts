// Lamps that stay in their room (`light_rooms: yes`).
//
// A point or spot light in three.js shines through walls: without a shadow map nothing occludes it,
// so a lamp against a wall lights the floor on the other side. Shadow maps fix that one lamp at a
// time, each costing a texture unit (a GPU has 16 or 32 for the whole material) and six scene passes.
// This module confines every lamp to its room instead, in the shader and for free: at load the floors
// (`room_N_1` of a Sweet Home 3D export) are drawn once from above into a small room-id map; while
// shading, each point or spot light's contribution is kept only where the fragment lies in the same
// room as the light (looked up by the world xz of both), or on no room at all but within `margin`
// of the light's room (wall faces, thresholds, the ground just outside). A lamp in no room (outside,
// or on a floor that is not a room) shines as before. Lamps with shadows keep them on top.
//
// What it does not do: light no longer spills through an open doorway into the next room. That is
// the trade: no leaks through walls, no spill through doors, at no cost on a phone.
//
// Mechanics: the mask is injected into three.js' point and spot light loops (a global shader chunk,
// like render-mode.ts) and reads shared uniforms that every lit material gets through a prototype
// `onBeforeCompile`; the card binds its own map and camera to those uniforms right before it renders,
// so several cards on a page each keep their rooms.
import * as THREE from 'three';

const CHUNK = THREE.ShaderChunk as unknown as { [name: string]: string };
const MAX_LEVELS = 4;

/** Shared uniform objects: one set per page, re-pointed by each card before it renders. */
const U = {
  f3dxRoomSet: { value: new THREE.Vector4(0, 25, 0, 0) }, // x: on, y: margin (model units), z: levels
  f3dxRoomInfo: { value: new THREE.Vector4(0, 0, 1, 1) }, // min x, min z, 1/size x, 1/size z
  f3dxRoomView: { value: new THREE.Matrix4() }, // view -> world (the camera's matrixWorld)
  f3dxRoomMap: { value: null as THREE.Texture | null },
  f3dxRoomLevels: { value: Array.from({ length: MAX_LEVELS }, () => new THREE.Vector4(-1e9, 1e9, 0, 1)) }, // y min, y max, v offset, v scale
};

export const ROOM_LIGHT_PARS = `
uniform vec4 f3dxRoomSet;
uniform vec4 f3dxRoomInfo;
uniform mat4 f3dxRoomView;
uniform sampler2D f3dxRoomMap;
uniform vec4 f3dxRoomLevels[ ${MAX_LEVELS} ];
float f3dxRoomId( const in vec3 w ) {
	vec2 uv = ( w.xz - f3dxRoomInfo.xy ) * f3dxRoomInfo.zw;
	if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) return 0.0;
	float off = 0.0, sc = 1.0;
	int n = int( f3dxRoomSet.z );
	for ( int l = 0; l < ${MAX_LEVELS}; l ++ ) {
		if ( l >= n ) break;
		vec4 L = f3dxRoomLevels[ l ];
		if ( w.y >= L.x && w.y < L.y ) { off = L.z; sc = L.w; }
	}
	vec4 t = texture2D( f3dxRoomMap, vec2( uv.x, off + uv.y * sc ) );
	return floor( t.r * 255.0 + 0.5 ) + 256.0 * floor( t.g * 255.0 + 0.5 );
}
// the fragment's own room and world position, once per fragment (f3dxRoomBegin in the light loop's prologue)
float f3dxFragRoom = 0.0;
vec3 f3dxFragWorld = vec3( 0.0 );
void f3dxRoomBegin( const in vec3 fragView ) {
	if ( f3dxRoomSet.x < 0.5 ) return;
	f3dxFragWorld = ( f3dxRoomView * vec4( fragView, 1.0 ) ).xyz;
	f3dxFragRoom = f3dxRoomId( f3dxFragWorld );
}
// 1 where a light at lightView (view space) may reach this fragment, 0 where a wall is in between
float f3dxRoomMask( const in vec3 lightView ) {
	if ( f3dxRoomSet.x < 0.5 ) return 1.0;
	vec3 lw = ( f3dxRoomView * vec4( lightView, 1.0 ) ).xyz;
	float rl = f3dxRoomId( lw );
	if ( rl < 0.5 || f3dxFragRoom == rl ) return 1.0;
	if ( f3dxFragRoom > 0.5 ) return 0.0;
	// on no room: a wall face, a threshold, the ground outside. Lit when the light's room is within margin.
	vec3 d = lw - f3dxFragWorld; d.y = 0.0;
	float len = length( d );
	if ( len < 1e-3 ) return 1.0;
	vec3 p = f3dxFragWorld + d * ( min( f3dxRoomSet.y, len ) / len );
	return f3dxRoomId( p ) == rl ? 1.0 : 0.0;
}
`;

let installed = false;
/** The shared uniforms, for the harness. */
export function roomLightUniforms(): typeof U { return U; }
/** Patches three.js once: the mask in the light loops, the uniforms on every lit material. */
export function installRoomLight(): void {
  if (installed) return;
  installed = true;
  const begin = CHUNK.lights_fragment_begin;
  CHUNK.lights_fragment_begin = begin
    .replace('vec3 geometryPosition = - vViewPosition;', 'vec3 geometryPosition = - vViewPosition;\nf3dxRoomBegin( geometryPosition );')
    .replace('getPointLightInfo( pointLight, geometryPosition, directLight );', 'getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\tif ( directLight.visible ) directLight.color *= f3dxRoomMask( pointLight.position );')
    .replace('getSpotLightInfo( spotLight, geometryPosition, directLight );', 'getSpotLightInfo( spotLight, geometryPosition, directLight );\n\t\tif ( directLight.visible ) directLight.color *= f3dxRoomMask( spotLight.position );');
  if (!/f3dxRoomBegin\( geometryPosition \)/.test(CHUNK.lights_fragment_begin)) console.warn('floor3d-card: light_rooms could not hook three.js\' light loop; the option will have no effect');
  const proto = THREE.Material.prototype as any;
  const previous = proto.onBeforeCompile;
  proto.onBeforeCompile = function f3dxRoomLightHook(shader: any, renderer: any) {
    if (previous) previous.call(this, shader, renderer);
    Object.keys(U).forEach((k) => { if (!shader.uniforms[k]) shader.uniforms[k] = (U as any)[k]; });
  };
}

export interface RoomLightConfig {
  margin?: number; // model units a no-room fragment may be from the light's room and still be lit; default 25
  floors?: string | string[]; // name patterns of the floors (`*` wildcard); default room_*_1
  join?: boolean | string; // floors that touch (an alcove, a bay, a threshold drawn as its own floor) count as one room; default yes
}

/** The room-id map of one card's model, built once from its floors. */
export class RoomLight {
  private map: THREE.DataTexture | null = null;
  private data: Uint8Array | null = null;
  private width = 0;
  private height = 0;
  private info = new THREE.Vector4();
  private levels: THREE.Vector4[] = [];
  private margin: number;
  readonly rooms: number;

  private root: THREE.Object3D;
  private toLocal = new THREE.Matrix4();

  /** `root` is the object the model hangs from (the card moves it to centre the model after loading);
   *  the map is kept in its coordinates, so it stays right wherever the model is placed. */
  constructor(renderer: THREE.WebGLRenderer, root: THREE.Object3D, meshes: THREE.Mesh[], cfg: RoomLightConfig | true | string) {
    this.root = root;
    root.updateWorldMatrix(true, false);
    this.toLocal.copy(root.matrixWorld).invert();
    const c: RoomLightConfig = cfg && typeof cfg === 'object' ? cfg : {};
    this.margin = c.margin !== undefined ? Number(c.margin) : 25;
    const patterns = (Array.isArray(c.floors) ? c.floors : String(c.floors || 'room_*_1').split(',')).map((p) => p.trim().toLowerCase()).filter(Boolean);
    const regs = patterns.map((p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
    const floors = meshes.filter((m) => m.isMesh && regs.some((r) => r.test((m.name || '').toLowerCase())));
    this.rooms = floors.length;
    if (!floors.length) return;
    // footprint and levels: floors grouped by their y (within 60 units), one row of the map per level
    const box = new THREE.Box3(), all = new THREE.Box3(), size = new THREE.Vector3();
    const localMatrix = (m: THREE.Mesh) => { m.updateWorldMatrix(true, false); return new THREE.Matrix4().multiplyMatrices(this.toLocal, m.matrixWorld); };
    const localBox = (m: THREE.Mesh) => { const g = m.geometry as THREE.BufferGeometry; if (!g.boundingBox) g.computeBoundingBox(); return box.copy(g.boundingBox!).applyMatrix4(localMatrix(m)); };
    const entries = floors.map((m) => { localBox(m); all.union(box); return { mesh: m, y: (box.min.y + box.max.y) / 2 }; }).sort((a, b) => a.y - b.y);
    const groups: { y: number; floors: THREE.Mesh[] }[] = [];
    entries.forEach((e) => { const g = groups[groups.length - 1]; if (g && Math.abs(e.y - g.y) < 60) g.floors.push(e.mesh); else groups.push({ y: e.y, floors: [e.mesh] }); });
    const used = groups.slice(0, MAX_LEVELS);
    all.getSize(size);
    const pad = Math.max(size.x, size.z) * 0.02 + 10;
    const minX = all.min.x - pad, minZ = all.min.z - pad, sx = size.x + 2 * pad, sz = size.z + 2 * pad;
    // u = (x - minX) / sx, v = (maxZ - z) / sz, as the camera below draws it (checked against the
    // pixels in dev/harness/test_room_light.py)
    this.info.set(minX, minZ + sz, 1 / sx, -1 / sz);
    const W = 1024, rowH = used.length > 1 ? 512 : 1024, H = rowH * used.length;
    const target = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: false, stencilBuffer: false });
    target.texture.colorSpace = THREE.NoColorSpace;
    // each floor drawn flat in its id colour, from above; later floors over earlier ones
    const scene = new THREE.Scene();
    const mats: THREE.Material[] = [];
    let id = 0;
    used.forEach((g, li) => {
      g.floors.forEach((f) => {
        id++;
        const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false });
        mat.color.setRGB((id & 255) / 255, ((id >> 8) & 255) / 255, 0, THREE.NoColorSpace);
        mats.push(mat);
        const m = new THREE.Mesh(f.geometry, mat);
        m.matrixAutoUpdate = false; m.matrix.copy(localMatrix(f)); m.renderOrder = id; m.userData.level = li;
        scene.add(m);
      });
    });
    // from above with up = -z: camera-local x is world x and local y is -z, so the frustum's top is
    // -minZ and its bottom -(minZ + sz): minZ at the top of the picture, v = 0 (the first row of the
    // readback, the bottom) at maxZ
    const cam = new THREE.OrthographicCamera(minX, minX + sx, -minZ, -(minZ + sz), 1, 1e6);
    cam.position.set(0, all.max.y + 5000, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate, prevClear = new THREE.Color(), prevAlpha = renderer.getClearAlpha(), prevScissor = renderer.getScissorTest();
    renderer.getClearColor(prevClear);
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    used.forEach((g, li) => {
      // the row of this level; the rows stack from the bottom of the texture
      renderer.setViewport(0, li * rowH, W, rowH);
      renderer.setScissor(0, li * rowH, W, rowH);
      renderer.setScissorTest(true);
      scene.children.forEach((m: any) => { m.visible = m.userData.level === li; });
      renderer.render(scene, cam);
      const ys = g.floors.map((f) => localBox(f).min.y);
      const yMin = Math.min(...ys) - 60;
      const next = used[li + 1];
      const yMax = next ? (Math.min(...next.floors.map((f) => localBox(f).min.y)) - 60) : 1e9;
      this.levels.push(new THREE.Vector4(li === 0 ? -1e9 : yMin, yMax, li / used.length, 1 / used.length));
    });
    renderer.setScissorTest(prevScissor);
    // read the ids back: floors that touch become one room (unless join: no), and the map lives on as
    // a plain texture the shader samples and roomAt() reads without the GPU
    const px = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, px);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.shadowMap.autoUpdate = prevAuto;
    mats.forEach((m) => m.dispose());
    target.dispose();
    const join = c.join === undefined || c.join === true || ['yes', 'true', 'on'].includes(String(c.join).toLowerCase());
    const idAt = (i: number) => px[i * 4] + 256 * px[i * 4 + 1];
    const parent = Array.from({ length: id + 1 }, (_, i) => i);
    const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    if (join) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x, a = idAt(i);
          if (!a) continue;
          if (x + 1 < W) { const b = idAt(i + 1); if (b && b !== a) { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); } }
          if (y + 1 < H && (y + 1) % rowH !== 0) { const b = idAt(i + W); if (b && b !== a) { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); } }
        }
      }
      for (let i = 0; i < W * H; i++) {
        const a = idAt(i); if (!a) continue;
        const r = find(a); px[i * 4] = r & 255; px[i * 4 + 1] = (r >> 8) & 255;
      }
    }
    this.joined = new Set(Array.from({ length: id }, (_, i) => find(i + 1))).size;
    this.data = px; this.width = W; this.height = H;
    this.map = new THREE.DataTexture(px, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.map.minFilter = THREE.NearestFilter; this.map.magFilter = THREE.NearestFilter; this.map.generateMipmaps = false;
    this.map.colorSpace = THREE.NoColorSpace; this.map.needsUpdate = true;
  }
  /** Rooms after touching floors were joined. */
  joined = 0;

  get active(): boolean { return !!this.map; }

  /** Point the shared uniforms at this card's map and camera; call right before rendering its scene. */
  bind(camera: THREE.Camera): void {
    if (!this.map) { RoomLight.unbind(); return; }
    U.f3dxRoomSet.value.set(1, this.margin, this.levels.length, 0);
    U.f3dxRoomInfo.value.copy(this.info);
    // view space -> world -> the model root's space, where the map was drawn
    this.root.updateWorldMatrix(true, false);
    U.f3dxRoomView.value.copy(this.root.matrixWorld).invert().multiply(camera.matrixWorld);
    U.f3dxRoomMap.value = this.map;
    this.levels.forEach((l, i) => U.f3dxRoomLevels.value[i].copy(l));
  }

  /** The mask off, for a card without the option (the uniforms are shared on the page). */
  static unbind(): void { U.f3dxRoomSet.value.x = 0; }

  /** The room id under a world point (tests and the console). 0 is no room. */
  roomAt(x: number, y: number, z: number): number {
    if (!this.data) return 0;
    this.root.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(x, y, z).applyMatrix4(new THREE.Matrix4().copy(this.root.matrixWorld).invert());
    x = p.x; y = p.y; z = p.z;
    const u = (x - this.info.x) * this.info.z, v = (z - this.info.y) * this.info.w;
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    let off = 0, sc = 1;
    this.levels.forEach((l) => { if (y >= l.x && y < l.y) { off = l.z; sc = l.w; } });
    const px = Math.min(this.width - 1, Math.floor(u * this.width)), py = Math.min(this.height - 1, Math.floor((off + v * sc) * this.height));
    const i = (py * this.width + px) * 4;
    return this.data[i] + 256 * this.data[i + 1];
  }

  dispose(): void { if (this.map) this.map.dispose(); this.map = null; }
}
