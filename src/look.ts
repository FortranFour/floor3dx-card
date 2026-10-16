// look: - the NeonPlan 3D / NextFloor style on an imported model.
//
// Those projects draw their own geometry, so their look is baked in: dark stage, flat muted surfaces
// in a few blues, additive glowing edge lines along every wall, and "signal" colours (a lit lamp, an
// open window) kept saturated against the muted base. This module reproduces that on a Sweet Home 3D
// or glTF model the card has loaded, without touching the model file:
//
//   theme      neon | blueprint | day | off (default: off, the model as it is)
//   accent     the edge-line colour of the neon theme (default #37e0ff)
//   edges      yes | no: draw outline lines along mesh edges (default yes)
//   edge_angle degrees; an edge is drawn where two faces meet at more than this angle (default 40)
//   edge_opacity 0..1 (default 0.85)
//   flat       yes | no: flat shading, no specular (default yes)
//   keep_signal yes | no: leave saturated bright colours as they are (default yes)
//   walls      object name prefix(es) whose meshes count as walls (default: wall); walls get the wall tint
//   floors     object name prefix(es) for floors (default: room, floor)
//   stage      yes | no: set the background to the theme's stage colour (default yes)
//   glow       0..2: emissive glow of a lit lamp object in its light colour (default 0.9)
//
// How it works. Every mesh keeps its original material; a themed copy is made with a small fragment
// shader patch (adapted from NextFloor's viewer/theme.ts, MIT) that maps the material's colour to the
// theme per pixel, so textures still show through as pattern and the model is not rebuilt. Edges are
// line segments along creases and boundaries (see creaseEdges) drawn additively (normal blending in the day theme, where
// additive glow vanishes on a light background). Switching the theme is a uniform change.
//
// Colour-condition and image entries replace a mesh's material at runtime; the card re-themes a
// material it has not seen, so those entries keep working: a "Gold" lamp shade stays gold because it
// is a signal colour, LightSteelBlue goes to the muted base.

import * as THREE from 'three';

export type Theme = 'neon' | 'blueprint' | 'day' | 'off';

export interface LookConfig {
  theme?: Theme | string;
  accent?: string;
  edges?: string | boolean;
  edge_angle?: number | string;
  edge_opacity?: number | string;
  flat?: string | boolean;
  keep_signal?: string | boolean;
  walls?: string | string[];
  floors?: string | string[];
  stage?: string | boolean;
  glow?: number | string;
}

const THEMES: Theme[] = ['neon', 'blueprint', 'day'];

/** Background per theme (sky), from NextFloor's STAGE table, at night and by day. */
export const STAGE: Record<Exclude<Theme, 'off'>, { night: number[]; day: number[] }> = {
  neon: { night: [11, 17, 32], day: [26, 44, 78] },
  blueprint: { night: [26, 70, 130], day: [34, 86, 150] },
  day: { night: [214, 224, 238], day: [242, 246, 251] },
};

/** Edge line colour per theme. */
const EDGE: Record<Exclude<Theme, 'off'>, number> = { neon: 0x37e0ff, blueprint: 0xcce6ff, day: 0x142b61 };

// Fragment function: a material colour -> the themed colour. 0 neon, 1 blueprint, 2 day. Adapted from
// NextFloor (viewer/theme.ts); isWall / isFloor pick the surface tints of the neon look, keepSignal
// leaves bright saturated colours alone in every theme.
const LOOK_FUNCTION = /* glsl */ `
uniform int uTheme;
uniform vec3 uAccent;
uniform int uKeepSignal;
uniform int uSurface; // 0 generic, 1 wall, 2 floor
vec3 f3dxThemed(vec3 c) {
  float strongest = max(c.r, max(c.g, c.b));
  float weakest = min(c.r, min(c.g, c.b));
  float saturation = strongest > 0.0 ? (strongest - weakest) / strongest : 0.0;
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  bool signal = uKeepSignal == 1 && strongest > 0.45 && saturation > 0.45;
  if (uTheme == 0) {
    if (signal) return c;
    // neon: dark blue surfaces; walls a touch lighter and greener, floors darker; brightness keeps a trace
    vec3 base = uSurface == 1 ? vec3(0.075, 0.114, 0.19) : uSurface == 2 ? vec3(0.055, 0.086, 0.16) : vec3(0.09, 0.12, 0.2);
    vec3 lit = uSurface == 1 ? vec3(0.08, 0.19, 0.25) : vec3(0.16, 0.22, 0.36);
    vec3 m = mix(base, lit, clamp(luma * 1.4, 0.0, 1.0));
    // a hint of the original hue so textures and coloured furniture still read
    return mix(m, m * (c / max(strongest, 0.001)) * 1.6, 0.18);
  }
  if (signal) return c;
  if (uTheme == 1) {
    // blueprint: shades of blue, lighter where the model was lighter
    return mix(vec3(0.04, 0.13, 0.3), vec3(0.2, 0.42, 0.75), clamp(luma * 1.6, 0.0, 1.0));
  }
  // day: light surfaces with a trace of their hue
  vec3 grey = vec3(clamp(0.62 + luma * 0.36, 0.0, 0.97));
  return mix(grey, grey * (c / max(strongest, 0.001)), 0.12);
}
`;

interface Themed {
  material: THREE.Material;
  original: THREE.Material;
  uniforms: { uTheme: { value: number }; uAccent: { value: THREE.Vector3 }; uKeepSignal: { value: number }; uSurface: { value: number } };
}

export class Look {
  readonly cfg: LookConfig;
  private scene: THREE.Scene;
  private themed = new Map<THREE.Material, Themed>();
  private edgeLines: THREE.LineSegments[] = [];
  private edgeMaterial: THREE.LineBasicMaterial | null = null;
  private themeIndex = 0;
  private accent = new THREE.Vector3(0.22, 0.88, 1);
  private wallPrefixes: string[];
  private floorPrefixes: string[];

  constructor(cfg: LookConfig, scene: THREE.Scene) {
    this.cfg = cfg || {};
    this.scene = scene;
    this.wallPrefixes = list(this.cfg.walls, ['wall']);
    this.floorPrefixes = list(this.cfg.floors, ['room', 'floor']);
    const theme = this.theme();
    this.themeIndex = Math.max(0, THEMES.indexOf(theme));
    const accent = parseHex(this.cfg.accent);
    if (accent) this.accent.set(accent[0], accent[1], accent[2]);
  }

  theme(): Theme {
    const t = String(this.cfg.theme || 'off').toLowerCase();
    return (THEMES as string[]).includes(t) ? (t as Theme) : 'off';
  }

  get active(): boolean {
    return this.theme() !== 'off';
  }

  /** Apply to every mesh in the scene: themed materials, edge lines. Idempotent. */
  apply(meshes: THREE.Mesh[]): void {
    if (!this.active) return;
    meshes.forEach((mesh) => this.applyMesh(mesh));
    if (yes(this.cfg.edges, true)) this.buildEdges(meshes);
  }

  /** Theme one mesh's material(s). Called at setup and again whenever a mesh gets a new material. */
  applyMesh(mesh: THREE.Mesh): void {
    if (!this.active || !mesh.material) return;
    const surface = this.surfaceOf(mesh.name);
    const wrap = (m: THREE.Material): THREE.Material => {
      if ((m as any).userData && (m as any).userData.f3dxThemedOf) return m; // already a themed copy
      const existing = this.themed.get(m);
      if (existing) return existing.material;
      return this.themeMaterial(m, surface).material;
    };
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(wrap);
    else mesh.material = wrap(mesh.material);
  }

  /** The material the model came with, for code that reads original colours. */
  originalOf(m: THREE.Material): THREE.Material {
    const of = (m as any).userData && (m as any).userData.f3dxThemedOf;
    return of || m;
  }

  setTheme(theme: Theme): void {
    this.cfg.theme = theme;
    if (theme === 'off') return;
    this.themeIndex = THEMES.indexOf(theme);
    this.themed.forEach((t) => (t.uniforms.uTheme.value = this.themeIndex));
    if (this.edgeMaterial) {
      this.edgeMaterial.color.set(theme === 'neon' ? this.accentHex() : EDGE[theme]);
      this.edgeMaterial.blending = theme === 'day' ? THREE.NormalBlending : THREE.AdditiveBlending;
      this.edgeMaterial.needsUpdate = true;
    }
  }

  /** Background colour for the current theme, blended between night and day by `daylight` 0..1. */
  stageColor(daylight = 0): THREE.Color | null {
    const theme = this.theme();
    if (theme === 'off' || !yes(this.cfg.stage, true)) return null;
    const s = STAGE[theme];
    const k = Math.max(0, Math.min(1, daylight));
    return new THREE.Color(
      (s.night[0] + (s.day[0] - s.night[0]) * k) / 255,
      (s.night[1] + (s.day[1] - s.night[1]) * k) / 255,
      (s.night[2] + (s.day[2] - s.night[2]) * k) / 255,
    );
  }

  /** Emissive glow on a lamp object: its light colour while on, nothing while off. The glow strength
   *  follows look.glow (default 0.9) times the lamp's brightness. */
  setGlow(mesh: THREE.Mesh, color: THREE.Color | null, k = 1): void {
    if (!this.active) return;
    const strength = this.cfg.glow !== undefined ? Number(this.cfg.glow) : 0.9;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m: any) => {
      if (!m || !m.emissive) return;
      if (!m.userData.f3dxOwnGlow) {
        // the themed material may be shared between objects of one original; give this mesh its own
        const own = m.clone();
        own.userData = { ...m.userData, f3dxOwnGlow: true };
        own.onBeforeCompile = m.onBeforeCompile;
        own.customProgramCacheKey = m.customProgramCacheKey;
        if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((x) => (x === m ? own : x));
        else mesh.material = own;
        m = own;
      }
      if (color) m.emissive.copy(color).multiplyScalar(strength * k);
      else m.emissive.setRGB(0, 0, 0);
    });
  }

  dispose(): void {
    this.edgeLines.forEach((l) => {
      this.scene.remove(l);
      l.geometry.dispose();
    });
    this.edgeLines = [];
    if (this.edgeMaterial) this.edgeMaterial.dispose();
    this.themed.forEach((t) => t.material.dispose());
    this.themed.clear();
  }

  // ---- internals ------------------------------------------------------------------------------

  private accentHex(): number {
    return (Math.round(this.accent.x * 255) << 16) | (Math.round(this.accent.y * 255) << 8) | Math.round(this.accent.z * 255);
  }

  private surfaceOf(name: string): number {
    const n = (name || '').toLowerCase();
    if (this.wallPrefixes.some((p) => n.startsWith(p))) return 1;
    if (this.floorPrefixes.some((p) => n.startsWith(p))) return 2;
    return 0;
  }

  private themeMaterial(original: THREE.Material, surface: number): Themed {
    const material = original.clone();
    (material as any).userData = { ...(material as any).userData, f3dxThemedOf: original };
    const uniforms = {
      uTheme: { value: this.themeIndex },
      uAccent: { value: this.accent },
      uKeepSignal: { value: yes(this.cfg.keep_signal, true) ? 1 : 0 },
      uSurface: { value: surface },
    };
    if (yes(this.cfg.flat, true)) {
      (material as any).flatShading = true;
      if ((material as any).shininess !== undefined) (material as any).shininess = 0;
      if ((material as any).specular) (material as any).specular.setRGB(0, 0, 0);
      if ((material as any).roughness !== undefined) (material as any).roughness = 1;
      if ((material as any).metalness !== undefined) (material as any).metalness = 0;
    }
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      if (previous) previous.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + LOOK_FUNCTION)
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = f3dxThemed(diffuseColor.rgb);');
    };
    material.customProgramCacheKey = () => 'f3dx-look-' + surface;
    material.needsUpdate = true;
    const entry = { material, original, uniforms };
    this.themed.set(original, entry);
    return entry;
  }

  private buildEdges(meshes: THREE.Mesh[]): void {
    const theme = this.theme();
    if (theme === 'off') return;
    const angle = Number(this.cfg.edge_angle) > 0 ? Number(this.cfg.edge_angle) : 40;
    const opacity = this.cfg.edge_opacity !== undefined ? Math.max(0, Math.min(1, Number(this.cfg.edge_opacity))) : 0.85;
    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: theme === 'neon' ? this.accentHex() : EDGE[theme],
      transparent: true,
      opacity,
      depthWrite: false,
      blending: theme === 'day' ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    meshes.forEach((mesh) => {
      if (!mesh.geometry || !(mesh.geometry as THREE.BufferGeometry).attributes) return;
      // tiny or transparent objects (glass, hardware) get no lines: they would only add noise
      const mat: any = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const orig: any = this.originalOf(mat);
      if (orig && orig.transparent && orig.opacity < 0.99) return;
      const box = (mesh.geometry as THREE.BufferGeometry).boundingBox || ((mesh.geometry as THREE.BufferGeometry).computeBoundingBox(), (mesh.geometry as THREE.BufferGeometry).boundingBox);
      const size = box.getSize(new THREE.Vector3());
      if (Math.max(size.x, size.y, size.z) < 8) return;
      const edges = creaseEdges(mesh.geometry as THREE.BufferGeometry, angle);
      if (!edges) return;
      const line = new THREE.LineSegments(edges, this.edgeMaterial);
      line.name = 'f3dx_edge_' + mesh.name;
      line.renderOrder = 10;
      line.layers.mask = mesh.layers.mask;
      // follow the mesh: same parent, same transform, so doors and shades carry their lines along
      mesh.add(line);
      this.edgeLines.push(line);
    });
  }
}

// Edge lines where faces meet at a crease. three.js's EdgesGeometry pairs the faces around an edge in
// encounter order and compares their normals with a signed dot product; on a double-sided mesh (Sweet
// Home 3D exports every surface twice, once per winding) a front triangle gets paired with the back
// copy of its neighbour, reads as a 180-degree fold, and every flat quad shows its diagonal. Here all
// faces around an edge are compared with an unsigned dot product, so flipped duplicates count as
// coplanar, and an edge is drawn only where two faces really meet at more than `angle` degrees, or
// where it belongs to a single face (a boundary).
function creaseEdges(geometry: THREE.BufferGeometry, angle: number): THREE.BufferGeometry | null {
  const pos = geometry.attributes.position;
  if (!pos) return null;
  const index = geometry.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  if (triCount === 0 || triCount > 200000) return null;
  const thresholdDot = Math.cos(THREE.MathUtils.degToRad(angle));
  // vertices merged by rounded position, so unwelded triangles still share edges
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const q = Math.max(size.x, size.y, size.z) / 4000 || 1e-4; // quantum: 1/4000 of the object
  const keyOf = (i: number): string =>
    Math.round(pos.getX(i) / q) + ',' + Math.round(pos.getY(i) / q) + ',' + Math.round(pos.getZ(i) / q);
  const vertexId = new Map<string, number>();
  const ids = new Int32Array(pos.count);
  const first: number[] = []; // representative vertex index per merged id
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(i);
    let id = vertexId.get(k);
    if (id === undefined) {
      id = first.length;
      vertexId.set(k, id);
      first.push(i);
    }
    ids[i] = id;
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const normals: THREE.Vector3[] = [];
  const edges = new Map<string, { a: number; b: number; faces: number[] }>();
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const v = [ids[i0], ids[i1], ids[i2]];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue; // degenerate
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    n.copy(b).sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-12) continue;
    normals.push(n.clone().normalize());
    const f = normals.length - 1;
    for (let e = 0; e < 3; e++) {
      const p = v[e], r = v[(e + 1) % 3];
      const key = p < r ? p + '_' + r : r + '_' + p;
      let entry = edges.get(key);
      if (!entry) {
        entry = { a: p, b: r, faces: [] };
        edges.set(key, entry);
      }
      entry.faces.push(f);
    }
  }
  const out: number[] = [];
  edges.forEach((edge) => {
    const faces = edge.faces;
    let draw = false;
    if (faces.length === 1) {
      draw = true; // boundary of an open surface
    } else {
      // distinct face planes around this edge (flipped duplicates collapse to one)
      const planes: THREE.Vector3[] = [];
      faces.forEach((f) => {
        const nf = normals[f];
        if (!planes.some((p) => Math.abs(p.dot(nf)) > 0.9999)) planes.push(nf);
      });
      if (planes.length >= 2) {
        for (let i = 0; i < planes.length && !draw; i++) {
          for (let j = i + 1; j < planes.length; j++) {
            if (Math.abs(planes[i].dot(planes[j])) <= thresholdDot) {
              draw = true;
              break;
            }
          }
        }
      }
    }
    if (!draw) return;
    const ia = first[edge.a], ib = first[edge.b];
    out.push(pos.getX(ia), pos.getY(ia), pos.getZ(ia), pos.getX(ib), pos.getY(ib), pos.getZ(ib));
  });
  if (!out.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

function yes(v: any, dflt: boolean): boolean {
  if (v === undefined || v === null || v === '') return dflt;
  return v === true || String(v).toLowerCase() === 'yes' || String(v).toLowerCase() === 'true';
}

function list(v: any, dflt: string[]): string[] {
  if (v === undefined || v === null || v === '') return dflt;
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map((s) => String(s).trim().toLowerCase()).filter((s) => s);
}

function parseHex(hex: any): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
