// look: - the NeonPlan 3D / NextFloor style on an imported model.
//
// Those projects draw their own geometry, so their look is baked in: dark stage, flat muted surfaces
// in a few blues, additive glowing edge lines along every wall, and "signal" colours (a lit lamp, an
// open window) kept saturated against the muted base. This module reproduces that on a Sweet Home 3D
// or glTF model the card has loaded, without touching the model file:
//
//   theme      neon | blueprint | day | paper | ember | pastel | custom | off (default: off, the model as it is)
//   custom     the colours of theme custom (see CustomTheme): dark, light, walls, floors, edges, stage,
//              stage_day as #rrggbb, hue 0..1
//   accent     the edge-line colour of the neon theme (default #37e0ff)
//   edges      yes | no: draw outline lines along mesh edges (default yes)
//   edge_angle degrees; an edge is drawn where two faces meet at more than this angle (default 40)
//   edge_opacity 0..1 (default 0.85)
//   keep       objects the look leaves as the model has them, materials and lines: object ids, *
//              patterns or <group>s (a list or comma-separated string; resolved by the card). Default: none
//   edge_skip  what gets no line (default: nothing). A list or a comma-separated string of:
//                images    the objects of type3d: image rows (pictures, screens) and nothing on them
//                texts     the objects of type3d: text rows (labels, readouts)
//                seams     the joint between two coplanar wall segments (one straight wall exported in parts)
//                floors    the joint between two coplanar floor objects (rooms with no wall between them)
//                coplanar  any joint between coplanar faces of two different objects (seams and floors, for all objects)
//                anything else: an object id, a * pattern or a <group>; those objects get no lines
//              The card resolves the object ids; the keywords are not case-sensitive.
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
//
// The flat faces of a wall (its bottom on the floor, its top under a ceiling) lie in the plane of
// the floor or ceiling they touch, and a Sweet Home 3D wall keeps its full footprint under a doorway,
// so the two surfaces fight for the same pixels. With the model's own materials both have the same
// look and the fight goes unnoticed; themed, a wall and a floor get different tints and the loser
// shows through as a broken line across the opening. The themed material of a flat wall face lowers
// it by a hair in the vertex shader (uDrop, a ten-thousandth of the model's size, 1 mm on a 10 m
// house), so the floor or ceiling always wins; the mesh itself is not moved, and its edge lines stay
// where they are.

import * as THREE from 'three';

export type Theme = 'neon' | 'blueprint' | 'day' | 'paper' | 'ember' | 'pastel' | 'custom' | 'off';

export interface LookConfig {
  theme?: Theme | string;
  accent?: string;
  edges?: string | boolean;
  edge_angle?: number | string;
  edge_opacity?: number | string;
  edge_skip?: string | string[];
  keep?: string | string[];
  flat?: string | boolean;
  keep_signal?: string | boolean;
  walls?: string | string[];
  floors?: string | string[];
  stage?: string | boolean;
  glow?: number | string;
  custom?: CustomTheme;
}

/** The colours of theme: custom, as #rrggbb. */
export interface CustomTheme {
  dark?: string; // the surface colour where the model is dark (default #1c2230)
  light?: string; // where it is bright (default #6c7a96)
  walls?: string; // bright colour of walls (default: light)
  floors?: string; // bright colour of floors (default: light)
  edges?: string; // edge lines (default #e8f0ff)
  stage?: string; // background at night, or always (default #10141c)
  stage_day?: string; // background by day with daylight (default: stage)
  hue?: number | string; // 0..1, how much of the model's own hue remains (default 0.15)
}

const CUSTOM_DEFAULTS = { dark: '#1c2230', light: '#6c7a96', edges: '#e8f0ff', stage: '#10141c', hue: 0.15 };

const THEMES: Theme[] = ['neon', 'blueprint', 'day', 'paper', 'ember', 'pastel', 'custom'];
/** Themes on a light stage: edge lines blend normally (additive glow would vanish on a light background). */
const LIGHT_STAGE: Theme[] = ['day', 'paper', 'pastel'];

/** Background per theme (sky), from NextFloor's STAGE table, at night and by day. */
export const STAGE: Record<Exclude<Theme, 'off'>, { night: number[]; day: number[] }> = {
  neon: { night: [11, 17, 32], day: [26, 44, 78] },
  blueprint: { night: [26, 70, 130], day: [34, 86, 150] },
  day: { night: [214, 224, 238], day: [242, 246, 251] },
  paper: { night: [196, 184, 160], day: [240, 232, 212] },
  ember: { night: [20, 16, 18], day: [58, 46, 42] },
  pastel: { night: [196, 200, 220], day: [240, 242, 250] },
  custom: { night: [16, 20, 28], day: [16, 20, 28] }, // replaced by look.custom.stage / stage_day
};

/** Edge line colour per theme. */
const EDGE: Record<Exclude<Theme, 'off'>, number> = { neon: 0x37e0ff, blueprint: 0xcce6ff, day: 0x142b61, paper: 0x4a3826, ember: 0xff9a3c, pastel: 0x6a6e96, custom: 0xe8f0ff };

// Fragment function: a material colour -> the themed colour. 0 neon, 1 blueprint, 2 day, 3 paper, 4 ember, 5 pastel. Adapted from
// NextFloor (viewer/theme.ts); isWall / isFloor pick the surface tints of the neon look, keepSignal
// leaves bright saturated colours alone in every theme.
const LOOK_FUNCTION = /* glsl */ `
uniform int uTheme;
uniform vec3 uAccent;
uniform int uKeepSignal;
uniform int uSurface; // 0 generic, 1 wall, 2 floor
uniform vec3 uCustomDark;
uniform vec3 uCustomLight;
uniform vec3 uCustomWall;
uniform vec3 uCustomFloor;
uniform float uCustomHue;
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
  vec3 hue = c / max(strongest, 0.001);
  if (uTheme == 3) {
    // paper: an architect's drawing, cream card with ink lines; walls a shade warmer, floors parchment
    vec3 light = uSurface == 1 ? vec3(0.90, 0.84, 0.72) : uSurface == 2 ? vec3(0.87, 0.80, 0.66) : vec3(0.93, 0.89, 0.80);
    vec3 shade = vec3(0.55, 0.47, 0.36);
    vec3 m = mix(shade, light, clamp(0.35 + luma * 0.8, 0.0, 1.0));
    return mix(m, m * hue, 0.08);
  }
  if (uTheme == 4) {
    // ember: charcoal surfaces with a warm cast, amber lines; walls lighter, floors darkest
    vec3 base = uSurface == 1 ? vec3(0.15, 0.125, 0.115) : uSurface == 2 ? vec3(0.095, 0.08, 0.075) : vec3(0.17, 0.145, 0.13);
    vec3 lit = vec3(0.36, 0.28, 0.22);
    vec3 m = mix(base, lit, clamp(luma * 1.3, 0.0, 1.0));
    return mix(m, m * hue * 1.4, 0.15);
  }
  if (uTheme == 6) {
    // custom: the user's colours; dark where the model is dark, light (per surface) where it is bright
    vec3 light = uSurface == 1 ? uCustomWall : uSurface == 2 ? uCustomFloor : uCustomLight;
    vec3 m = mix(uCustomDark, light, clamp(luma * 1.3, 0.0, 1.0));
    return mix(m, m * hue, uCustomHue);
  }
  if (uTheme == 5) {
    // pastel: the model's own colours, lightened and softened, on a pale stage
    vec3 grey = vec3(clamp(0.70 + luma * 0.27, 0.0, 0.97));
    return clamp(grey * mix(vec3(1.0), hue, 0.45), 0.0, 0.97);
  }
  // day: light surfaces with a trace of their hue
  vec3 grey = vec3(clamp(0.62 + luma * 0.36, 0.0, 0.97));
  return mix(grey, grey * hue, 0.12);
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
  private themedFlat = new Map<THREE.Material, Themed>(); // the lowered variant, for the flat faces of walls
  private span = 0; // the model's largest dimension, in model units (set on the first applyMaterials)
  private drop = { value: 0 }; // uDrop: how far a flat wall face is lowered, a ten-thousandth of span
  private edgeLines: THREE.LineSegments[] = [];
  private edgeMaterial: THREE.LineBasicMaterial | null = null;
  private themeIndex = 0;
  private accent = new THREE.Vector3(0.22, 0.88, 1);
  private wallPrefixes: string[];
  private floorPrefixes: string[];
  private custom: { dark: THREE.Vector3; light: THREE.Vector3; walls: THREE.Vector3; floors: THREE.Vector3; hue: number; edges: number; stage: number[]; stageDay: number[] };

  constructor(cfg: LookConfig, scene: THREE.Scene) {
    this.cfg = cfg || {};
    this.scene = scene;
    this.custom = Look.customColours(this.cfg.custom);
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

  /** Themed materials for every mesh. Idempotent. Call before any code that clones materials. */
  applyMaterials(meshes: THREE.Mesh[]): void {
    if (!this.active) return;
    if (!this.drop.value) {
      // a ten-thousandth of the model: 1 mm on a 10 m house, far above the depth resolution and far
      // below anything the eye picks up
      const box = new THREE.Box3();
      meshes.forEach((mesh) => {
        if (!mesh.geometry || !(mesh.geometry as THREE.BufferGeometry).attributes) return;
        mesh.updateWorldMatrix(true, false);
        box.expandByObject(mesh);
      });
      this.span = box.isEmpty() ? 0 : Math.max(...box.getSize(new THREE.Vector3()).toArray());
      this.drop.value = this.span / 10000 || 0.01;
    }
    meshes.forEach((mesh) => this.applyMesh(mesh));
  }

  /** Edge lines for every mesh, from its current geometry. Call after any code that re-centres
   *  geometry (door hinges, shade pivots): the lines are children of the mesh and share its transform. */
  applyEdges(meshes: THREE.Mesh[], skipNames?: Set<string>): void {
    if (!this.active || !yes(this.cfg.edges, true)) return;
    if (this.edgeLines.length) return; // already built
    this.buildEdges(meshes, skipNames || new Set());
  }

  /** The entries of edge_skip, lower-cased. The keywords (images, seams, floors, coplanar) are read
   *  here and by the card; the rest are object ids the card resolves to names. */
  edgeSkip(): string[] {
    const v = this.cfg.edge_skip;
    if (v === undefined || v === null || v === '') return [];
    const arr = Array.isArray(v) ? v : String(v).split(',');
    return arr.map((x) => String(x).trim()).filter((x) => x);
  }

  /** Both, for callers with no re-centring step. */
  apply(meshes: THREE.Mesh[]): void {
    this.applyMaterials(meshes);
    this.applyEdges(meshes);
  }

  /** Theme one mesh's material(s). Called at setup and again whenever a mesh gets a new material. */
  applyMesh(mesh: THREE.Mesh): void {
    if (!this.active || !mesh.material) return;
    const surface = this.surfaceOf(mesh.name);
    const flat = surface === 1 && this.isFlat(mesh);
    const pool = flat ? this.themedFlat : this.themed;
    const wrap = (m: THREE.Material): THREE.Material => {
      if ((m as any).userData && (m as any).userData.f3dxThemedOf) return m; // already a themed copy
      const existing = pool.get(m);
      if (existing) return existing.material;
      return this.themeMaterial(m, surface, flat).material;
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
    this.themedFlat.forEach((t) => (t.uniforms.uTheme.value = this.themeIndex));
    if (this.edgeMaterial) {
      this.edgeMaterial.color.set(this.edgeColour(theme));
      this.edgeMaterial.blending = this.lightStage(theme) ? THREE.NormalBlending : THREE.AdditiveBlending;
      this.edgeMaterial.needsUpdate = true;
    }
  }

  /** Background colour for the current theme, blended between night and day by `daylight` 0..1. */
  stageColor(daylight = 0): THREE.Color | null {
    const theme = this.theme();
    if (theme === 'off' || !yes(this.cfg.stage, true)) return null;
    const s = theme === 'custom' ? { night: this.custom.stage, day: this.custom.stageDay } : STAGE[theme];
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
      if (l.parent) l.parent.remove(l);
      l.geometry.dispose();
    });
    this.edgeLines = [];
    if (this.edgeMaterial) this.edgeMaterial.dispose();
    this.themed.forEach((t) => t.material.dispose());
    this.themed.clear();
    this.themedFlat.forEach((t) => t.material.dispose());
    this.themedFlat.clear();
  }

  // ---- internals ------------------------------------------------------------------------------

  private edgeColour(theme: Theme): number {
    if (theme === 'neon') return this.accentHex();
    if (theme === 'custom') return this.custom.edges;
    return EDGE[theme as Exclude<Theme, 'off'>];
  }

  // lines blend normally on a light stage, where additive glow would vanish
  private lightStage(theme: Theme): boolean {
    if (theme === 'custom') {
      const [r, g, b] = this.custom.stage;
      return 0.299 * r + 0.587 * g + 0.114 * b > 128;
    }
    return LIGHT_STAGE.includes(theme);
  }

  /** The colours of theme: custom from its block, with defaults for what is missing. */
  static customColours(cfg?: CustomTheme): { dark: THREE.Vector3; light: THREE.Vector3; walls: THREE.Vector3; floors: THREE.Vector3; hue: number; edges: number; stage: number[]; stageDay: number[] } {
    const c = cfg || {};
    const vec = (hex: any, dflt: string): THREE.Vector3 => {
      const v = parseHex(hex) || (parseHex(dflt) as [number, number, number]);
      return new THREE.Vector3(v[0], v[1], v[2]);
    };
    const bytes = (hex: any, dflt: string): number[] => (parseHex(hex) || (parseHex(dflt) as number[])).map((x) => Math.round(x * 255));
    const hex = (h: any, dflt: string): number => {
      const v = parseHex(h) || (parseHex(dflt) as number[]);
      return (Math.round(v[0] * 255) << 16) | (Math.round(v[1] * 255) << 8) | Math.round(v[2] * 255);
    };
    const light = vec(c.light, CUSTOM_DEFAULTS.light);
    const hue = Number(c.hue);
    return {
      dark: vec(c.dark, CUSTOM_DEFAULTS.dark),
      light,
      walls: parseHex(c.walls) ? vec(c.walls, CUSTOM_DEFAULTS.light) : light.clone(),
      floors: parseHex(c.floors) ? vec(c.floors, CUSTOM_DEFAULTS.light) : light.clone(),
      hue: isNaN(hue) ? CUSTOM_DEFAULTS.hue : Math.max(0, Math.min(1, hue)),
      edges: hex(c.edges, CUSTOM_DEFAULTS.edges),
      stage: bytes(c.stage, CUSTOM_DEFAULTS.stage),
      stageDay: parseHex(c.stage_day) ? bytes(c.stage_day, CUSTOM_DEFAULTS.stage) : bytes(c.stage, CUSTOM_DEFAULTS.stage),
    };
  }

  private accentHex(): number {
    return (Math.round(this.accent.x * 255) << 16) | (Math.round(this.accent.y * 255) << 8) | Math.round(this.accent.z * 255);
  }

  private surfaceOf(name: string): number {
    const n = (name || '').toLowerCase();
    if (this.wallPrefixes.some((p) => n.startsWith(p))) return 1;
    if (this.floorPrefixes.some((p) => n.startsWith(p))) return 2;
    return 0;
  }

  /** A mesh with no height: the bottom or top face of a wall, lying in the plane of a floor or ceiling. */
  private isFlat(mesh: THREE.Mesh): boolean {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    if (!geometry || !geometry.attributes || !geometry.attributes.position) return false;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    mesh.updateWorldMatrix(true, false);
    const box = geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    return box.max.y - box.min.y < (this.span || 1000) / 2000; // under 1 cm on a 20 m house
  }

  private themeMaterial(original: THREE.Material, surface: number, flat = false): Themed {
    const material = original.clone();
    (material as any).userData = { ...(material as any).userData, f3dxThemedOf: original, f3dxFlatWall: flat };
    const uniforms = {
      uTheme: { value: this.themeIndex },
      uAccent: { value: this.accent },
      uKeepSignal: { value: yes(this.cfg.keep_signal, true) ? 1 : 0 },
      uSurface: { value: surface },
      uDrop: this.drop,
      uCustomDark: { value: this.custom.dark },
      uCustomLight: { value: this.custom.light },
      uCustomWall: { value: this.custom.walls },
      uCustomFloor: { value: this.custom.floors },
      uCustomHue: { value: this.custom.hue },
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
      if (flat) {
        // lowered by uDrop along the model's up axis, so the floor or ceiling in the same plane wins
        // the depth test (a depth offset would not: with the logarithmic depth buffer the fragment
        // shader writes the depth itself, and polygon offset does not apply to it)
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uDrop;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y -= uDrop;');
      }
    };
    material.customProgramCacheKey = () => 'f3dx-look-' + surface + (flat ? '-flat' : '');
    material.needsUpdate = true;
    const entry = { material, original, uniforms };
    (flat ? this.themedFlat : this.themed).set(original, entry);
    return entry;
  }

  private buildEdges(meshes: THREE.Mesh[], skipNames: Set<string>): void {
    const theme = this.theme();
    if (theme === 'off') return;
    const angle = Number(this.cfg.edge_angle) > 0 ? Number(this.cfg.edge_angle) : 40;
    const thresholdDot = Math.cos(THREE.MathUtils.degToRad(angle));
    const opacity = this.cfg.edge_opacity !== undefined ? Math.max(0, Math.min(1, Number(this.cfg.edge_opacity))) : 0.85;
    const skip = this.edgeSkip().map((x) => x.toLowerCase());
    const mergeAll = skip.includes('coplanar');
    const mergeWalls = mergeAll || skip.includes('seams');
    const mergeFloors = mergeAll || skip.includes('floors');
    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: this.edgeColour(theme),
      transparent: true,
      opacity,
      depthWrite: false,
      blending: this.lightStage(theme) ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    // pass 1: each mesh's edges in its own frame; open edges are kept aside to be matched against
    // the faces of the other objects
    interface Item { mesh: THREE.Mesh; cls: number; edges: MeshEdges }
    const items: Item[] = [];
    const scene = new THREE.Box3();
    meshes.forEach((mesh) => {
      if (!mesh.geometry || !(mesh.geometry as THREE.BufferGeometry).attributes) return;
      if (skipNames.has(mesh.name)) return;
      // tiny or transparent objects (glass, hardware) get no lines: they would only add noise
      const mat: any = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const orig: any = this.originalOf(mat);
      if (orig && orig.transparent && orig.opacity < 0.99) return;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const box = geometry.boundingBox || (geometry.computeBoundingBox(), geometry.boundingBox);
      const size = box.getSize(new THREE.Vector3());
      if (Math.max(size.x, size.y, size.z) < 8) return;
      const edges = creaseEdges(geometry, angle);
      if (!edges) return;
      mesh.updateWorldMatrix(true, false);
      scene.union(box.clone().applyMatrix4(mesh.matrixWorld));
      items.push({ mesh, cls: this.surfaceOf(mesh.name), edges });
    });
    // pass 2: a line is a joint, not an outline, where the surface continues on both sides of it:
    // the next segment of a straight wall, the piece of wall under a window sill, the floor of the
    // next room. A Sweet Home 3D wall with windows is exported as overlapping closed pieces, often
    // inside one mesh, so the test looks at the triangles of the object itself as well as those of
    // the other objects of an allowed class, in world space. One edge can be a joint on part of its
    // length and an outline on the rest (the end of a full-height piece: buried under the sill,
    // exposed up the window jamb, buried again above the lintel), so edges are first cut where
    // other vertices lie on them, and each part is judged on its own: for each plane of the edge,
    // two probe points a little to either side of the part's midpoint; a coplanar surface at both
    // means the surface continues and the part gets no line. A face meeting the edge at an angle is
    // not coplanar, so corners, openings and object contours keep theirs.
    const merging = mergeAll || mergeWalls || mergeFloors;
    const candidate = (cls: number): boolean => mergeAll || (mergeWalls && cls === 1) || (mergeFloors && cls === 2);
    const pairs = (a: number, b: number): boolean => mergeAll || (mergeWalls && a === 1 && b === 1) || (mergeFloors && a === 2 && b === 2);
    const extent = scene.getSize(new THREE.Vector3());
    const span = Math.max(extent.x, extent.y, extent.z) || 1;
    // Two rooms drawn by hand rarely share a border to the millimetre: one polygon stops short of
    // the other, or overlaps it, by a few millimetres. Along the surface the search is loose (2.5 cm
    // on a 20 m house); across it, tight (2.5 mm), so a parallel face a little behind does not pass
    // for a continuation.
    const along = span / 800;
    const across = span / 8000;
    const probe = span / 4000; // how far to either side of an edge the surface is sampled: 5 mm
    const cell = span / 40;
    interface Tri { tri: THREE.Triangle; n: THREE.Vector3; mesh: number }
    const grid = new Map<string, Tri[]>();
    const vertexGrid = new Map<string, THREE.Vector3[]>();
    const cellKey = (x: number, y: number, z: number): string => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
    const bucketsIn = <T>(map: Map<string, T[]>, bb: THREE.Box3, add: (bucket: T[]) => void): void => {
      for (let x = Math.floor(bb.min.x / cell); x <= Math.floor(bb.max.x / cell); x++)
        for (let y = Math.floor(bb.min.y / cell); y <= Math.floor(bb.max.y / cell); y++)
          for (let z = Math.floor(bb.min.z / cell); z <= Math.floor(bb.max.z / cell); z++) {
            const k = x + ',' + y + ',' + z;
            let bucket = map.get(k);
            if (!bucket) map.set(k, (bucket = []));
            add(bucket);
          }
    };
    if (merging) {
      items.forEach((item, m) => {
        if (!candidate(item.cls)) return;
        const geometry = item.mesh.geometry as THREE.BufferGeometry;
        const pos = geometry.attributes.position;
        const index = geometry.index;
        const count = index ? index.count / 3 : pos.count / 3;
        const bb = new THREE.Box3();
        const seen = new Set<string>();
        for (let i = 0; i < pos.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(item.mesh.matrixWorld);
          const k = Math.round(v.x / across) + ',' + Math.round(v.y / across) + ',' + Math.round(v.z / across);
          if (seen.has(k)) continue;
          seen.add(k);
          bb.min.copy(v).subScalar(along);
          bb.max.copy(v).addScalar(along);
          bucketsIn(vertexGrid, bb, (bucket) => bucket.push(v));
        }
        for (let t = 0; t < count; t++) {
          const i0 = index ? index.getX(t * 3) : t * 3, i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1, i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
          const tri = new THREE.Triangle(
            new THREE.Vector3().fromBufferAttribute(pos, i0).applyMatrix4(item.mesh.matrixWorld),
            new THREE.Vector3().fromBufferAttribute(pos, i1).applyMatrix4(item.mesh.matrixWorld),
            new THREE.Vector3().fromBufferAttribute(pos, i2).applyMatrix4(item.mesh.matrixWorld),
          );
          const n = tri.getNormal(new THREE.Vector3());
          if (n.lengthSq() < 0.5) continue; // degenerate
          const entry: Tri = { tri, n, mesh: m };
          bb.setFromPoints([tri.a, tri.b, tri.c]).expandByScalar(along);
          bucketsIn(grid, bb, (bucket) => bucket.push(entry));
        }
      });
    }
    const wp = new THREE.Vector3(), closest = new THREE.Vector3(), nm = new THREE.Matrix3();
    const wa = new THREE.Vector3(), wb = new THREE.Vector3(), dir = new THREE.Vector3(), lateral = new THREE.Vector3();
    const side = [new THREE.Vector3(), new THREE.Vector3()];
    const foot = new THREE.Vector3(), delta = new THREE.Vector3();
    // The coplanar surface at world point p (normal n), of this object or of another object of an
    // allowed class: `own` when a face adjacent to the edge (one holding both its ends) covers the
    // point, `other` when any other coplanar face does. A face of another piece lying on the face
    // of this edge means the face is buried, pressed against that piece.
    const near = (v: THREE.Vector3, w: THREE.Vector3): boolean => v.distanceToSquared(w) <= across * across;
    // Only surface on the probe's side of the edge counts (`away` is the unit direction from the
    // edge to the probe): the face of the edge itself must not pass for a continuation on the far side.
    // `own`: a face of this edge (same object, holding both its ends) is here. `other`: some other
    // coplanar surface is within reach along the plane (a continuation). `buried`: the point is
    // covered by more coplanar faces than one surface has, so a face of another piece or object is
    // pressed against the face of this edge (an end cap against the next segment's end cap).
    const surfaceAt = (p: THREE.Vector3, n: THREE.Vector3, away: THREE.Vector3, item: Item, m: number): { own: boolean; other: boolean; buried: boolean } => {
      const r = { own: false, other: false, buried: false };
      const bucket = grid.get(cellKey(p.x, p.y, p.z));
      if (!bucket) return r;
      let covering = 0;
      const expected = item.edges.doubleSided ? 2 : 1;
      for (const t of bucket) {
        if (t.mesh !== m && !pairs(item.cls, items[t.mesh].cls)) continue;
        if (Math.abs(t.n.dot(n)) < 0.999) continue; // not the same plane: a corner, kept
        t.tri.closestPointToPoint(p, closest);
        delta.copy(closest).sub(p);
        const off = Math.abs(delta.dot(t.n)); // across the surface
        if (off > across) continue;
        const inPlane = delta.lengthSq() - off * off;
        if (inPlane > along * along) continue;
        if (delta.copy(closest).sub(wp).dot(away) <= across) continue; // on the edge or beyond it, not on this side
        const covers = inPlane <= across * across;
        const holdsEdge = t.mesh === m && (near(t.tri.a, wa) || near(t.tri.b, wa) || near(t.tri.c, wa)) && (near(t.tri.a, wb) || near(t.tri.b, wb) || near(t.tri.c, wb));
        if (holdsEdge) {
          r.own = true;
          if (covers) covering++;
        } else {
          r.other = true;
          if (covers) r.buried = true;
        }
      }
      if (covering > expected) r.buried = true;
      return r;
    };
    items.forEach((item, m) => {
      const out: number[] = [];
      const merge = merging && candidate(item.cls);
      if (merge) nm.getNormalMatrix(item.mesh.matrixWorld);
      item.edges.edges.forEach((edge) => {
        if (!merge) {
          out.push(edge.a.x, edge.a.y, edge.a.z, edge.b.x, edge.b.y, edge.b.z);
          return;
        }
        wa.copy(edge.a).applyMatrix4(item.mesh.matrixWorld);
        wb.copy(edge.b).applyMatrix4(item.mesh.matrixWorld);
        dir.copy(wb).sub(wa);
        const length = dir.length();
        if (length <= across) return;
        dir.divideScalar(length);
        const normals = edge.planes.map((pl) => pl.n.clone().applyMatrix3(nm).normalize());
        // cut where other vertices lie on the edge (T-junctions)
        const cuts = [0, length];
        const bb = new THREE.Box3().setFromPoints([wa, wb]);
        const seenCuts = new Set<number>();
        for (let x = Math.floor(bb.min.x / cell); x <= Math.floor(bb.max.x / cell); x++)
          for (let y = Math.floor(bb.min.y / cell); y <= Math.floor(bb.max.y / cell); y++)
            for (let z = Math.floor(bb.min.z / cell); z <= Math.floor(bb.max.z / cell); z++) {
              const bucket = vertexGrid.get(x + ',' + y + ',' + z);
              if (!bucket) continue;
              bucket.forEach((v) => {
                delta.copy(v).sub(wa);
                const t = delta.dot(dir);
                if (t <= probe || t >= length - probe) return;
                foot.copy(wa).addScaledVector(dir, t);
                if (foot.distanceToSquared(v) > across * across) return;
                const key = Math.round(t / across);
                if (seenCuts.has(key)) return;
                seenCuts.add(key);
                cuts.push(t);
              });
            }
        cuts.sort((p, q) => p - q);
        for (let i = 1; i < cuts.length; i++) {
          const t0 = cuts[i - 1], t1 = cuts[i];
          if (t1 - t0 <= across) continue;
          wp.copy(wa).addScaledVector(dir, (t0 + t1) / 2);
          const reach = Math.min(probe, (t1 - t0) / 4);
          // for each plane: which side its face is on, whether that face is buried there, and
          // whether a coplanar surface continues on the far side
          const exposed: THREE.Vector3[] = [];
          let continues = false;
          normals.forEach((n) => {
            lateral.crossVectors(dir, n).normalize();
            side[0].copy(wp).addScaledVector(lateral, reach);
            side[1].copy(wp).addScaledVector(lateral, -reach);
            const s0 = surfaceAt(side[0], n, lateral, item, m);
            lateral.negate();
            const s1 = surfaceAt(side[1], n, lateral, item, m);
            const faceSide = s0.own ? s0 : s1.own ? s1 : null;
            const farSide = faceSide === s0 ? s1 : s0;
            if (!faceSide) return; // no face of this edge found at the probe (a sliver): ignore the plane
            if (faceSide.buried) return; // pressed against another piece: not a visible face here
            exposed.push(n);
            if (farSide.own || farSide.other) continues = true;
          });
          let draw: boolean;
          if (exposed.length >= 2) draw = creaseBetween(exposed, thresholdDot); // a visible fold
          else if (exposed.length === 1) draw = !continues; // an outline, unless the surface goes on
          else draw = false; // every face here is buried
          if (!draw) continue;
          // back to the mesh's frame: the line is a child of the mesh
          const a = edge.a.clone().lerp(edge.b, t0 / length), b = edge.a.clone().lerp(edge.b, t1 / length);
          out.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      });
      if (!out.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      const line = new THREE.LineSegments(g, this.edgeMaterial);
      line.name = 'f3dx_edge_' + item.mesh.name;
      // Drawn in the transparent pass in depth order like any other translucent thing, not after
      // everything: the lines of what stands behind a glass dome or a see-through wall are then
      // covered by it as the model itself is, instead of showing through at full strength. Lines
      // on their own surface still pass the depth test (less-or-equal) against it.
      line.renderOrder = 0;
      line.layers.mask = item.mesh.layers.mask;
      // follow the mesh: same parent, same transform, so doors and shades carry their lines along
      item.mesh.add(line);
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
interface MeshEdges {
  // the edges that may get a line, in the mesh's frame: an open edge (one plane) or a crease (two or
  // more distinct planes meeting at more than the angle)
  edges: { a: THREE.Vector3; b: THREE.Vector3; planes: { n: THREE.Vector3 }[] }[];
  doubleSided: boolean; // most faces come with a flipped copy (a Sweet Home 3D export)
}

function creaseEdges(geometry: THREE.BufferGeometry, angle: number): MeshEdges | null {
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
  const tris: number[][] = [];
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
    tris.push(v);
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
  const out: MeshEdges['edges'] = [];
  let flipped = 0;
  edges.forEach((edge) => {
    const faces = edge.faces;
    const ia = first[edge.a], ib = first[edge.b];
    // distinct face planes around this edge (flipped duplicates collapse to one)
    const planes: MeshEdges['edges'][0]['planes'] = [];
    faces.forEach((f) => {
      const nf = normals[f];
      if (!planes.some((p) => Math.abs(p.n.dot(nf)) > 0.9999)) planes.push({ n: nf });
    });
    const pair = faces.length === 2 && isFlippedPair(tris[faces[0]], tris[faces[1]]);
    if (pair) flipped += 2 / 3; // two faces, three edges each
    const open = faces.length === 1 || pair;
    if (!open && planes.length < 2) return; // inside a flat surface
    if (!open && !creaseBetween(planes.map((p) => p.n), thresholdDot)) return; // a fold too shallow to draw
    out.push({ a: new THREE.Vector3().fromBufferAttribute(pos, ia), b: new THREE.Vector3().fromBufferAttribute(pos, ib), planes });
  });
  if (!out.length) return null;
  return { edges: out, doubleSided: flipped * 2 > tris.length };
}

/** Some two of these planes meet at more than the angle (dot below the threshold). */
function creaseBetween(normals: THREE.Vector3[], thresholdDot: number): boolean {
  for (let i = 0; i < normals.length; i++)
    for (let j = i + 1; j < normals.length; j++) if (Math.abs(normals[i].dot(normals[j])) <= thresholdDot) return true;
  return false;
}

// the same three merged vertices in both triangles: a face and its back copy
function isFlippedPair(a: number[], b: number[]): boolean {
  return a.includes(b[0]) && a.includes(b[1]) && a.includes(b[2]);
}

function yes(v: any, dflt: boolean): boolean {
  if (v === undefined || v === null || v === '') return dflt;
  return v === true || String(v).toLowerCase() === 'yes' || String(v).toLowerCase() === 'true';
}

export function list(v: any, dflt: string[]): string[] {
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
