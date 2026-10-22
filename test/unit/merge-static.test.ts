import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { reservedNames, mergeStatic } from '../../src/merge-static';

const names = ['wall_1', 'wall_2', 'Lamp_1', 'Lamp_2', 'Frame7_1_9', 'Frame7_1_8', 'door_1', 'win_1', 'glass_1'];

test('reservedNames: every way a configuration can name an object', () => {
  const config = {
    entities: [{ entity: 'light.a', type3d: 'light', object_id: '<lamps>', light: { light_object: 'Lamp_2' } }],
    object_groups: [{ object_group: 'lamps', objects: [{ object_id: 'Lamp_1' }] }],
    hide_objects: 'Frame7_1_8, nothing_like_this',
    transparent: [{ objects: 'glass_*', transparency: 50 }],
    look: { keep: 'door_1' },
    daylight: { windows: [{ object_id: 'win_1' }] },
  };
  const r = reservedNames(config, names, [['Lamp_1']]);
  assert.deepEqual(Array.from(r).sort(), ['Frame7_1_8', 'Lamp_1', 'Lamp_2', 'door_1', 'glass_1', 'win_1']);
});

function box(name: string, material: THREE.Material, x: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  m.name = name;
  m.position.x = x;
  return m;
}

test('mergeStatic: unreserved meshes of one source material merge, the rest stay', () => {
  const source = new THREE.MeshStandardMaterial();
  source.userData.f3dxSourceId = source.uuid;
  const clone = () => source.clone(); // per-instance clones, as the card makes them
  const other = new THREE.MeshStandardMaterial();
  other.userData.f3dxSourceId = other.uuid;
  const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });
  glass.userData.f3dxSourceId = glass.uuid;
  const level = new THREE.Object3D();
  ['wall_1', 'wall_2', 'wall_3', 'Lamp_1'].forEach((n, i) => level.add(box(n, clone(), i)));
  level.add(box('shelf_1', other.clone(), 9));
  level.add(box('glass_1', glass.clone(), 10));
  const removed: string[] = [];
  const { stats } = mergeStatic([level], new Set(['Lamp_1']), (m) => removed.push(m.name));
  assert.equal(stats.merged, 3); // the three walls
  assert.equal(stats.into, 1);
  assert.deepEqual(removed.sort(), ['wall_1', 'wall_2', 'wall_3']);
  const left = level.children.map((o) => o.name).sort();
  assert.deepEqual(left, ['Lamp_1', 'f3dx_merged_0_0', 'glass_1', 'shelf_1']);
  const merged = level.getObjectByName('f3dx_merged_0_0') as THREE.Mesh;
  assert.equal((merged.geometry as THREE.BufferGeometry).attributes.position.count, 3 * 24);
  // placed in the level's frame: the merged box spans the three positions
  merged.geometry.computeBoundingBox();
  assert.equal(Math.round(merged.geometry.boundingBox!.min.x * 10) / 10, -0.5);
  assert.equal(Math.round(merged.geometry.boundingBox!.max.x * 10) / 10, 2.5);
});
