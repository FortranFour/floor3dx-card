import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, cleanConfig, matchObjects, objectPattern } from '../../src/config';

test('switches: true/false become yes/no, strings stay', () => {
  const c: any = normalizeConfig({ shadow: true, sky: false, header: 'no', entities: [] });
  assert.equal(c.shadow, 'yes');
  assert.equal(c.sky, 'no');
  assert.equal(c.header, 'no');
});

test('numbers the editor saved as text become numbers (cleanConfig, the editor save path)', () => {
  const c: any = cleanConfig({ globalLightPower: '0.77', exposure: '0.6', entities: [{ entity: 'light.a', type3d: 'light', object_id: 'x', light: { lumens: '700', decay: '1.2' } }] });
  assert.equal(c.globalLightPower, 0.77);
  assert.equal(c.exposure, 0.6);
  assert.equal(c.entities[0].light.lumens, 700);
  assert.equal(c.entities[0].light.decay, 1.2);
});

test('* patterns match object names, plain ids pass through', () => {
  const names = ['Lamp_1', 'Lamp_2', 'Lamp_2_1', 'wall_1'];
  assert.deepEqual(matchObjects('Lamp_*', names), ['Lamp_1', 'Lamp_2', 'Lamp_2_1']);
  assert.deepEqual(matchObjects('Lamp_2', names), ['Lamp_2']);
  assert.equal(objectPattern('wall_1'), null);
  assert.deepEqual(matchObjects('*_1', names), ['Lamp_1', 'Lamp_2_1', 'wall_1']);
});
