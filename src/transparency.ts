/* eslint-disable @typescript-eslint/no-explicit-any */
// Transparent objects: walls (or anything else) drawn see-through, by a fixed amount or by an
// amount that follows a Home Assistant entity.
//
// Two ways to configure it, both handled here:
//
//   transparent:                       # card level, no entity needed
//     - objects: ['wall_*']            # object ids, patterns with *, <group> for an object group
//       transparency: 70               # 0 solid .. 100 invisible (as room.transparency)
//     - objects: wall_12
//       entity: input_boolean.xray     # optional: on -> transparency, off -> transparency_off
//
//   - entity: input_number.wall_transparency   # entity row, type3d: transparent
//     type3d: transparent
//     object_id: 'wall_*'
//     transparent:
//       transparency: 70               # used when the entity is in `state` (default on)
//       transparency_off: 0            # used otherwise (default 0, solid)
//       invert: 'no'                   # numeric entity: 100 - value
//
// A numeric entity state is the transparency itself: 0..100, or 0..1 when the entity's max is 1 or
// less (an input_number or sensor of either range works). Any other state is compared with `state`.
//
// How it works. The meshes of a rule keep their material; its opacity is lowered in place. A material
// shared with a mesh outside every rule is cloned first, so the other mesh stays solid. At 100 the mesh
// is hidden (so it stops casting shadows too); at 0 the material is restored exactly as it was.
import * as THREE from 'three';

export interface TransparentRule {
  objects: string[];
  transparency: number;
  transparency_off: number;
  state: string;
  invert: boolean;
  entity?: string;
}

interface Bound {
  rule: TransparentRule;
  meshes: THREE.Mesh[];
  current: number | null; // transparency applied, null before the first application
}

const ON_STATES = ['on', 'true', 'open', 'home', 'playing', 'active', 'occupied', 'detected', 'unlocked'];

const clamp = (v: number): number => Math.max(0, Math.min(100, v));

export class Transparency {
  private bound: Bound[] = [];

  /** `card`: the card-level `transparent` option (one rule or a list); `entities`: the entity rows,
   *  with `objects` the (expanded) object ids of each row of type3d transparent. */
  static rules(card: any, entities: { entity: string; type3d: string; transparent?: any; objects: string[] }[]): TransparentRule[] {
    const out: TransparentRule[] = [];
    const list = card == null ? [] : Array.isArray(card) ? card : [card];
    list.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const ids = item.objects !== undefined ? item.objects : item.object_id;
      const objects = (Array.isArray(ids) ? ids : [ids]).filter((id) => typeof id === 'string' && id !== '');
      if (objects.length === 0) return;
      out.push(Transparency.rule(item, objects, item.entity, item.transparency === undefined ? 70 : item.transparency));
    });
    entities.forEach((entity) => {
      if (entity.type3d !== 'transparent') return;
      const opt = entity.transparent || {};
      out.push(Transparency.rule(opt, entity.objects, entity.entity, opt.transparency === undefined ? 70 : opt.transparency));
    });
    return out;
  }

  private static rule(opt: any, objects: string[], entity: string | undefined, transparency: any): TransparentRule {
    return {
      objects,
      transparency: clamp(Number(transparency) || 0),
      transparency_off: clamp(Number(opt.transparency_off) || 0),
      state: opt.state === undefined || opt.state === null ? '' : String(opt.state),
      invert: opt.invert === 'yes' || opt.invert === true,
      entity: entity && String(entity) !== '' ? String(entity) : undefined,
    };
  }

  /** The transparency a rule asks for given its entity's state object (undefined without an entity
   *  or when the entity is unknown to Home Assistant). */
  static value(rule: TransparentRule, stateObj: any): number {
    if (!rule.entity) return rule.transparency;
    if (!stateObj || stateObj.state === 'unavailable' || stateObj.state === 'unknown') return rule.transparency_off;
    const state = String(stateObj.state);
    const n = Number(state);
    if (state.trim() !== '' && !isNaN(n)) {
      const attrs = stateObj.attributes || {};
      const max = Number(attrs.max);
      const fraction = (!isNaN(max) && max > 0 && max <= 1) || (isNaN(max) && n <= 1 && /\./.test(state));
      let v = clamp(fraction ? n * 100 : n);
      if (rule.invert) v = 100 - v;
      return v;
    }
    const on = rule.state !== '' ? state === rule.state : ON_STATES.includes(state.toLowerCase());
    return on ? rule.transparency : rule.transparency_off;
  }

  /** Resolve the meshes of every rule. `resolve` turns an object id (plain, pattern or <group>) into
   *  model object names. Materials shared with meshes outside the rules are cloned. */
  bind(rules: TransparentRule[], scene: THREE.Scene, resolve: (id: string) => string[]): void {
    this.bound = rules.map((rule) => {
      const names = new Set<string>();
      rule.objects.forEach((id) => resolve(id).forEach((name) => names.add(name)));
      const meshes: THREE.Mesh[] = [];
      names.forEach((name) => {
        const object: any = scene.getObjectByName(name);
        if (!object) {
          console.warn('floor3d-card: transparent: no object of the model is named <' + name + '>');
          return;
        }
        object.traverse((o: any) => {
          if (o.isMesh && o.material && !o.name.startsWith('f3dx_')) meshes.push(o);
        });
      });
      return { rule, meshes, current: null };
    });
    const ours = new Set<THREE.Mesh>();
    this.bound.forEach((b) => b.meshes.forEach((m) => ours.add(m)));
    const outside = new Set<THREE.Material>();
    scene.traverse((o: any) => {
      if (!o.isMesh || ours.has(o) || !o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => outside.add(m));
    });
    ours.forEach((mesh) => {
      const own = (m: THREE.Material): THREE.Material => (outside.has(m) ? Transparency.clone(m) : m);
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(own);
      else mesh.material = own(mesh.material);
    });
  }

  get active(): boolean {
    return this.bound.length > 0;
  }

  /** Apply the rules for this hass. True when something changed on screen. */
  update(hass: any): boolean {
    const states = hass && hass.states ? hass.states : {};
    let changed = false;
    this.bound.forEach((b) => {
      const value = Transparency.value(b.rule, b.rule.entity ? states[b.rule.entity] : undefined);
      if (b.current === value) return;
      b.current = value;
      b.meshes.forEach((mesh) => Transparency.setTransparency(mesh, value));
      changed = true;
    });
    return changed;
  }

  // a clone that keeps the look's shader hooks and the userData references (clone() would serialise them)
  private static clone(m: THREE.Material): THREE.Material {
    const userData = (m as any).userData;
    (m as any).userData = {};
    const own: any = m.clone();
    (m as any).userData = userData;
    own.userData = { ...userData };
    own.onBeforeCompile = (m as any).onBeforeCompile;
    own.customProgramCacheKey = (m as any).customProgramCacheKey;
    return own;
  }

  /** Set one mesh's transparency (0 solid .. 100 invisible). */
  static setTransparency(mesh: THREE.Mesh, transparency: number): void {
    const t = clamp(transparency);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m: any) => {
      if (!m) return;
      if (!m.userData.f3dxSolid) {
        m.userData.f3dxSolid = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
      }
      const solid = m.userData.f3dxSolid;
      if (t <= 0) {
        m.transparent = solid.transparent;
        m.opacity = solid.opacity;
        m.depthWrite = solid.depthWrite;
      } else {
        m.transparent = true;
        m.opacity = solid.opacity * (1 - t / 100);
        m.depthWrite = false; // what is behind must show through, whatever the draw order
      }
      m.needsUpdate = true;
    });
    const wasHidden = (mesh as any).userData.f3dxTransparentHidden === true;
    if (t >= 100) {
      mesh.visible = false;
      (mesh as any).userData.f3dxTransparentHidden = true;
    } else if (wasHidden) {
      mesh.visible = true;
      (mesh as any).userData.f3dxTransparentHidden = false;
    }
  }
}
