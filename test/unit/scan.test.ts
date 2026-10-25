import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanDashboards } from '../../src/rooms/scan';

const house = { objfile: 'house.glb', path: '/local/', entities: [{ entity: 'light.a', type3d: 'light', object_id: 'lamp' }] };
const dashboards: Record<string, any> = {
  lovelace: { views: [
    { title: 'Controls', cards: [{ type: 'entities', card_reference_id: 'lights', entities: [{ entity: 'light.a', entity_reference_id: 'lights.kitchen' }] }] },
    { title: 'Plan', cards: [
      { type: 'custom:dashboard-entity-reference', card: { type: 'custom:floor3dx-card', objfile: 'house.glb', entities: [{ entity: '[[entity:lights.kitchen]]', type3d: 'light', object_id: 'lamp' }, { entity: '[[entity:nope]]', type3d: 'text', object_id: 'p' }] } },
      { type: 'custom:floor3dx-rooms-card', title: 'House', card: house, rooms: [] },
      { type: 'custom:floor3dx-rooms-card', models: [{ name: 'Main', card: house }, { name: 'Garage', card: { objfile: 'garage.glb', entities: [] } }], rooms: [] },
    ] },
  ] },
};
const hass = { callWS: (q: any) => Promise.resolve(q.type === 'lovelace/dashboards/list' ? [] : q.type === 'lovelace/config' ? dashboards.lovelace : null) };

test('floor3d cards: resolved and raw copies, the unresolved roles listed, layout keys dropped', async () => {
  const found = await scanDashboards(hass, new Set(['floor3d']));
  assert.equal(found.length, 1);
  const f = found[0];
  assert.equal(f.kind, 'floor3d');
  assert.equal(f.card.entities[0].entity, 'light.a');
  assert.equal(f.raw.entities[0].entity, '[[entity:lights.kitchen]]');
  assert.deepEqual(f.unresolved, ['nope']);
  assert.equal('type' in f.card, false);
  assert.match(f.label, /Plan · floor3dx-card/);
});

test('rooms cards: one entry per model, with the model name', async () => {
  const found = await scanDashboards(hass, new Set(['rooms']));
  assert.deepEqual(found.map((f) => [f.kind, f.model, f.url]), [['rooms', 'House', '/local/house.glb'], ['rooms', 'Main', '/local/house.glb'], ['rooms', 'Garage', 'garage.glb']]);
  assert.match(found[1].label, /\(Main\)$/);
  assert.equal(found[0].card.entities[0].entity, 'light.a');
});

test('both kinds at once; an unreadable dashboard is skipped', async () => {
  const flaky = { callWS: (q: any) => (q.type === 'lovelace/dashboards/list' ? Promise.resolve([{ url_path: 'other', title: 'Other' }]) : q.url_path === 'other' ? Promise.reject(new Error('no')) : Promise.resolve(dashboards.lovelace)) };
  const found = await scanDashboards(flaky, new Set(['floor3d', 'rooms']));
  assert.equal(found.length, 4);
});
