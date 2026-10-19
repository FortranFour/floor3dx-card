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

export type Theme = 'neon' | 'blueprint' | 'day' | 'off';

export interface LookConfig {
  theme?: Theme | string;
  accent?: string;
  edges?: string | boolean;
  edge_angle?: number | string;
  edge_opacity?: number | string;
  edge_skip?: string | string[];
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
  private themedFlat = new Map<THREE.Material, Themed>(); // the lowered variant, for the flat faces of walls
  private span = 0; // the model's largest dimension, in model units (set on the first applyMaterials)
  private drop = { value: 0 }; // uDrop: how far a flat wall face is lowered, a ten-thousandth of span
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
      color: theme === 'neon' ? this.accentHex() : EDGE[theme],
      transparent: true,
      opacity,
      depthWrite: false,
      blending: theme === 'day' ? THREE.NormalBlending : THREE.AdditiveBlending,
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
    // pass 2: an open edge of one object that lies on a coplanar face of another object is a joint,
    // not a boundary: the next segment of a straight wall, the floor of the next room. The test is
    // geometric (the edge's midpoint lies on the other face, to a tolerance), so rooms drawn with
    // different corner points and walls split at different places still match. A face that meets
    // ours at an angle does not count, so corners stay.
    const merging = mergeAll || mergeWalls || mergeFloors;
    const candidate = (cls: number): boolean => mergeAll || (mergeWalls && cls === 1) || (mergeFloors && cls === 2);
    const pairs = (a: number, b: number): boolean => mergeAll || (mergeWalls && a === 1 && b === 1) || (mergeFloors && a === 2 && b === 2);
    const extent = scene.getSize(new THREE.Vector3());
    const span = Math.max(extent.x, extent.y, extent.z) || 1;
    // Two rooms drawn by hand rarely share a border to the millimetre: one polygon stops short of
    // the other, or overlaps it, by a few millimetres, and a joint test tighter than that leaves a
    // line along the border. 2.5 cm on a 20 m house is still far below anything else in a model.
    const eps = span / 800;
    const cell = span / 40;
    interface Tri { tri: THREE.Triangle; n: THREE.Vector3; mesh: number }
    const grid = new Map<string, Tri[]>();
    const cellKey = (x: number, y: number, z: number): string => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
    if (merging) {
      items.forEach((item, m) => {
        if (!candidate(item.cls)) return;
        const geometry = item.mesh.geometry as THREE.BufferGeometry;
        const pos = geometry.attributes.position;
        const index = geometry.index;
        const count = index ? index.count / 3 : pos.count / 3;
        const bb = new THREE.Box3();
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
          bb.setFromPoints([tri.a, tri.b, tri.c]);
          for (let x = Math.floor(bb.min.x / cell); x <= Math.floor(bb.max.x / cell); x++)
            for (let y = Math.floor(bb.min.y / cell); y <= Math.floor(bb.max.y / cell); y++)
              for (let z = Math.floor(bb.min.z / cell); z <= Math.floor(bb.max.z / cell); z++) {
                const k = x + ',' + y + ',' + z;
                let bucket = grid.get(k);
                if (!bucket) grid.set(k, (bucket = []));
                bucket.push(entry);
              }
        }
      });
    }
    const wp = new THREE.Vector3(), wn = new THREE.Vector3(), closest = new THREE.Vector3(), nm = new THREE.Matrix3();
    // is the world point `wp` on a face of another object that is coplanar with the world normal `wn`?
    const onForeignFace = (item: Item, m: number): boolean => {
      // the point's cell, and the neighbouring cells it is within eps of (a face just across a cell
      // boundary is registered there, not here)
      const keys = new Set<string>();
      for (const dx of [-eps, 0, eps]) for (const dy of [-eps, 0, eps]) for (const dz of [-eps, 0, eps]) keys.add(cellKey(wp.x + dx, wp.y + dy, wp.z + dz));
      for (const key of keys) {
        const bucket = grid.get(key);
        if (!bucket) continue;
        const hit = bucket.some((t) => {
          if (t.mesh === m || !pairs(item.cls, items[t.mesh].cls)) return false;
          if (Math.abs(t.n.dot(wn)) < 0.999) return false; // not the same plane: a corner, kept
          t.tri.closestPointToPoint(wp, closest);
          return closest.distanceTo(wp) <= eps;
        });
        if (hit) return true;
      }
      return false;
    };
    items.forEach((item, m) => {
      const out: number[] = [];
      const merge = merging && candidate(item.cls);
      if (merge) nm.getNormalMatrix(item.mesh.matrixWorld);
      item.edges.edges.forEach((edge) => {
        let draw = true;
        if (merge) {
          // planes whose face is not buried in another object: the end face of a wall segment pressed
          // against the next segment's end face does not count, nor a bottom face on the floor
          const planes = edge.planes.filter((p) => {
            wp.copy(p.centroid).applyMatrix4(item.mesh.matrixWorld);
            wn.copy(p.n).applyMatrix3(nm).normalize();
            return !onForeignFace(item, m);
          });
          if (planes.length === 0) draw = false;
          else if (planes.length === 1) {
            // open, or a crease whose other face is buried: a joint if the midpoint lies on a face of
            // another object that continues this one, a boundary otherwise
            wp.copy(edge.a).add(edge.b).multiplyScalar(0.5).applyMatrix4(item.mesh.matrixWorld);
            wn.copy(planes[0].n).applyMatrix3(nm).normalize();
            draw = !onForeignFace(item, m);
          } else draw = creaseBetween(planes.map((p) => p.n), thresholdDot);
        }
        if (draw) out.push(edge.a.x, edge.a.y, edge.a.z, edge.b.x, edge.b.y, edge.b.z);
      });
      if (!out.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      const line = new THREE.LineSegments(g, this.edgeMaterial);
      line.name = 'f3dx_edge_' + item.mesh.name;
      line.renderOrder = 10;
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
  // more distinct planes meeting at more than the angle). Each plane carries the centroid of one of
  // its faces, for the test of a face buried inside another object.
  edges: { a: THREE.Vector3; b: THREE.Vector3; planes: { n: THREE.Vector3; centroid: THREE.Vector3 }[] }[];
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
  edges.forEach((edge) => {
    const faces = edge.faces;
    const ia = first[edge.a], ib = first[edge.b];
    // distinct face planes around this edge (flipped duplicates collapse to one), each with the
    // centroid of one of its faces, for the buried-face test
    const planes: MeshEdges['edges'][0]['planes'] = [];
    faces.forEach((f) => {
      const nf = normals[f];
      if (planes.some((p) => Math.abs(p.n.dot(nf)) > 0.9999)) return;
      const t = tris[f];
      const centroid = new THREE.Vector3()
        .fromBufferAttribute(pos, first[t[0]])
        .add(new THREE.Vector3().fromBufferAttribute(pos, first[t[1]]))
        .add(new THREE.Vector3().fromBufferAttribute(pos, first[t[2]]))
        .multiplyScalar(1 / 3);
      planes.push({ n: nf, centroid });
    });
    const open = faces.length === 1 || (faces.length === 2 && isFlippedPair(tris[faces[0]], tris[faces[1]]));
    if (!open && planes.length < 2) return; // inside a flat surface
    if (!open && !creaseBetween(planes.map((p) => p.n), thresholdDot)) return; // a fold too shallow to draw
    out.push({ a: new THREE.Vector3().fromBufferAttribute(pos, ia), b: new THREE.Vector3().fromBufferAttribute(pos, ib), planes });
  });
  if (!out.length) return null;
  return { edges: out };
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
