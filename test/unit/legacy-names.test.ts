import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { restoreLegacyNames } from '../../src/model-loader';

// The r130 rule: a duplicate name gets _1, _2, ... and each candidate is checked against every name
// given so far, so the file's own `1_1_1`, reserved later, becomes `1_1_1_1`.
test('restoreLegacyNames reproduces r130 for duplicate node names', () => {
  const json = { scene: 0, scenes: [{ nodes: [0, 1, 2, 3] }], nodes: [{ name: '1_1' }, { name: '1_1' }, { name: '1_1_1' }, { name: 'wall' }] };
  const scene = new THREE.Group();
  const associations = new Map<THREE.Object3D, any>();
  const objects = json.nodes.map((_n, i) => {
    const o = new THREE.Object3D();
    o.name = 'whatever_' + i; // what r186 produced does not matter
    scene.add(o);
    associations.set(o, { nodes: i });
    return o;
  });
  const renamed = restoreLegacyNames({ scene, parser: { associations } } as any, json);
  assert.equal(renamed, 4);
  assert.deepEqual(objects.map((o) => o.name), ['1_1', '1_1_1', '1_1_1_1', 'wall']);
});
