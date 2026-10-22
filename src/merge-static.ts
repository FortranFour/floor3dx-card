// merge_static: fewer draw calls for the parts of the model nothing ever touches.
//
// A Sweet Home 3D export is one mesh per wall, panel, chair leg or picture frame: a house is two to
// three thousand meshes, and three.js issues one draw call for each, every frame. Only the objects a
// configuration names (lights, colours, doors, text panels, transparency rules, ...) need to stay
// separate; the rest is merged here, after everything that works per mesh has run, into one mesh per
// level, material and shadow setting. The look's edge lines of the merged meshes are merged the same
// way. The picture does not change; the per-frame work drops with the draw calls.
//
// Left alone: objects whose names appear anywhere in the configuration (expanded `*` patterns and
// <groups> included), hidden objects, translucent materials (three.js sorts those per object),
// multi-material meshes, and meshes with children other than their own edge lines.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { matchObjects } from './config';

export interface MergeStats {
  meshes: number; // meshes looked at
  merged: number; // meshes folded into merged ones
  into: number; // merged meshes made
  lines: number; // edge lines folded
  intoLines: number; // merged edge line objects made
  reserved: number; // names kept apart because the configuration refers to them
}

const EDGE_PREFIX = 'f3dx_edge_';

/**
 * Every object name the configuration can refer to: each string in it, split at commas, taken as a
 * name, a `*` pattern or a `<group>`; plus the objects already resolved for the entities.
 */
export function reservedNames(config: any, names: string[], resolved: string[][]): Set<string> {
  const reserved = new Set<string>();
  const nameSet = new Set(names);
  const groups: { [name: string]: string[] } = {};
  (config.object_groups || []).forEach((g: any) => {
    groups[g.object_group] = (g.objects || []).map((o: any) => (typeof o === 'string' ? o : o.object_id)).filter(Boolean);
  });
  const take = (token: string): void => {
    const t = token.trim();
    if (!t) return;
    const group = /^<(.*)>$/.exec(t);
    if (group) {
      (groups[group[1]] || []).forEach(take);
      return;
    }
    if (t.indexOf('*') >= 0) {
      matchObjects(t, names).forEach((n) => reserved.add(n));
      return;
    }
    if (nameSet.has(t)) reserved.add(t);
  };
  const walk = (value: any): void => {
    if (typeof value === 'string') {
      // a plain name may contain a comma (rare); try the whole string first
      take(value);
      if (value.indexOf(',') >= 0) value.split(',').forEach(take);
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.keys(value).forEach((k) => walk(value[k]));
  };
  walk(config);
  resolved.forEach((list) => list.forEach((n) => n && reserved.add(n)));
  return reserved;
}

function hasMap(material: any): boolean {
  return ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'specularMap'].some(
    (k) => material && material[k],
  );
}

// Materials are per-instance clones of the file's (see __deepCloneObject in the card), so identity
// says nothing; the clone's source id does, plus what the look did to it. A material a mesh got for
// itself (a glow, a colour condition: f3dxOwnGlow, or anything without a source id) stays unique.
function materialKey(m: any): string {
  const u = m.userData || {};
  if (!u.f3dxSourceId || u.f3dxOwnGlow) return m.uuid;
  const look = u.f3dxThemedOf ? '|' + (m.customProgramCacheKey ? m.customProgramCacheKey() : 'themed') : '';
  return u.f3dxSourceId + look;
}

function groupKey(mesh: THREE.Mesh, geometry: THREE.BufferGeometry): string {
  const m: any = mesh.material;
  const attrs = Object.keys(geometry.attributes)
    .sort()
    .map((a) => a + ':' + geometry.attributes[a].itemSize)
    .join(',');
  return [materialKey(m), attrs, geometry.index ? 'i' : 'n', mesh.castShadow ? 'c' : '', mesh.receiveShadow ? 'r' : '', mesh.layers.mask, mesh.renderOrder].join('|');
}

/**
 * Merge the unreserved meshes of each level. Returns the merged objects' geometries (to dispose with
 * the scene) and the stats. `onRemoved` is told about every original mesh taken out of the scene.
 */
export function mergeStatic(
  levels: THREE.Object3D[],
  reserved: Set<string>,
  onRemoved: (mesh: THREE.Mesh) => void,
): { stats: MergeStats; geometries: THREE.BufferGeometry[] } {
  const stats: MergeStats = { meshes: 0, merged: 0, into: 0, lines: 0, intoLines: 0, reserved: reserved.size };
  const made: THREE.BufferGeometry[] = [];

  levels.forEach((level, levelIndex) => {
    if (!level) return;
    const groups = new Map<string, { mesh: THREE.Mesh; geometry: THREE.BufferGeometry }[]>();
    level.children.forEach((child: any) => {
      if (!child.isMesh) return;
      const mesh = child as THREE.Mesh;
      stats.meshes++;
      if (!mesh.visible || !mesh.name || reserved.has(mesh.name) || mesh.name.startsWith('f3dx_') || mesh.name.startsWith('f3dobj_')) return;
      const material: any = mesh.material;
      if (!material || Array.isArray(material) || material.transparent || material.opacity < 1) return;
      if ((mesh as any).isSkinnedMesh || (mesh as any).isInstancedMesh || mesh.morphTargetInfluences) return;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
      if (mesh.children.some((c: any) => !(c.isLineSegments && c.name.startsWith(EDGE_PREFIX)))) return;
      // a private copy, placed in the level's frame; the original stays in the shared model cache
      mesh.updateMatrix();
      const copy = geometry.clone();
      if (!hasMap(material)) {
        if (copy.attributes.uv) copy.deleteAttribute('uv');
        if ((copy.attributes as any).uv1) copy.deleteAttribute('uv1');
      }
      copy.applyMatrix4(mesh.matrix);
      const key = groupKey(mesh, copy);
      const list = groups.get(key) || [];
      list.push({ mesh, geometry: copy });
      groups.set(key, list);
    });

    const edgeParts: Map<THREE.Material, { positions: number[]; sample: THREE.LineSegments }> = new Map();
    let n = 0;
    groups.forEach((list) => {
      if (list.length < 2) {
        list.forEach((item) => item.geometry.dispose());
        return;
      }
      const merged = mergeGeometries(
        list.map((item) => item.geometry),
        false,
      );
      list.forEach((item) => item.geometry.dispose());
      if (!merged) return;
      const first = list[0].mesh;
      const mesh = new THREE.Mesh(merged, first.material);
      mesh.name = `f3dx_merged_${levelIndex}_${n++}`;
      mesh.castShadow = first.castShadow;
      mesh.receiveShadow = first.receiveShadow;
      mesh.layers.mask = first.layers.mask;
      mesh.renderOrder = first.renderOrder;
      mesh.userData = { level: levelIndex, f3dxMerged: list.map((item) => item.mesh.name) };
      made.push(merged);
      list.forEach((item) => {
        // its edge lines: positions into the level's frame, one object per material later
        item.mesh.children.slice().forEach((line: any) => {
          const pos = line.geometry.attributes.position;
          if (!pos) return;
          line.updateMatrix();
          const toLevel = new THREE.Matrix4().multiplyMatrices(item.mesh.matrix, line.matrix);
          const v = new THREE.Vector3();
          const part = edgeParts.get(line.material) || { positions: [], sample: line };
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(toLevel);
            part.positions.push(v.x, v.y, v.z);
          }
          edgeParts.set(line.material, part);
          stats.lines++;
          line.geometry.dispose();
        });
        level.remove(item.mesh);
        onRemoved(item.mesh);
        stats.merged++;
      });
      level.add(mesh);
      stats.into++;
    });

    edgeParts.forEach((part, material) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
      const lines = new THREE.LineSegments(g, material);
      lines.name = `f3dx_merged_edges_${levelIndex}`;
      lines.renderOrder = part.sample.renderOrder;
      lines.layers.mask = part.sample.layers.mask;
      lines.userData = { level: levelIndex };
      level.add(lines);
      made.push(g);
      stats.intoLines++;
    });
  });

  return { stats, geometries: made };
}
