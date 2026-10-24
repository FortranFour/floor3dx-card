import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referenceSources, resolveTokens, tokenRoles, dashboardKey } from '../../src/rooms/references';

// a dashboard in the dashboard-entity-reference convention: source cards (card_reference_id) name
// entities three ways; a wrapper elsewhere refers to them with [[entity:role]] tokens
const dashboard = {
  views: [
    {
      title: 'Controls',
      cards: [
        {
          type: 'entities',
          card_reference_id: 'indoor_lights',
          entities: [
            { entity: 'light.kitchen_counter', entity_reference_id: 'indoor_lights.kitchen_counter_lights' },
            { entity: 'light.hall', entity_reference_id: 'indoor_lights.hallway_lights' },
            { entity: 'not an id', entity_reference_id: 'indoor_lights.broken' },
          ],
          entity_reference_extra: { 'fans.family_room': 'fan.family_room' },
        },
        {
          type: 'custom:button-card',
          card_reference_id: 'model.house',
          template_field: "{{ states('sensor.sdge_gas_flow') }} and {{ states('sensor.other') }}",
          single: "{{ states('climate.house') | float }}",
          entity_reference_fields: {
            'house_thermostat.climate': { path: ['single'], domain: 'climate' },
            'model.house.sensor.gas': { path: ['template_field'], domain: 'sensor' }, // two sensors: ambiguous, skipped
          },
        },
      ],
    },
    {
      title: 'Test 3D',
      cards: [
        {
          type: 'custom:dashboard-entity-reference',
          card: {
            type: 'custom:floor3dx-card',
            objfile: 'house.glb',
            entities: [
              { entity: '[[entity:indoor_lights.kitchen_counter_lights]]', type3d: 'light', object_id: 'lamp_1' },
              { entity: '[[entity:fans.family_room]]', type3d: 'rotate', object_id: 'fan_1' },
              { entity: '[[entity:house_thermostat.climate]]', type3d: 'text', object_id: 'panel_1', text: { template: "[[entity:house_thermostat.climate]] is {{ states('[[entity:house_thermostat.climate]]') }}" } },
              { entity: '[[entity:model.house.sensor.gas]]', type3d: 'text', object_id: 'panel_2' },
            ],
          },
        },
      ],
    },
  ],
};

test('sources: entity_reference_id, _extra and a single-match _fields selector; invalid and ambiguous skipped', () => {
  const s = referenceSources(dashboard);
  assert.equal(s.get('indoor_lights.kitchen_counter_lights'), 'light.kitchen_counter');
  assert.equal(s.get('fans.family_room'), 'fan.family_room');
  assert.equal(s.get('house_thermostat.climate'), 'climate.house');
  assert.equal(s.get('indoor_lights.broken'), undefined);
  assert.equal(s.get('model.house.sensor.gas'), undefined);
});

test('tokens resolve everywhere in the card, including inside templates; unknown roles are reported', () => {
  const card = (dashboard.views[1].cards[0] as any).card;
  assert.deepEqual(tokenRoles(card).sort(), ['fans.family_room', 'house_thermostat.climate', 'indoor_lights.kitchen_counter_lights', 'model.house.sensor.gas']);
  const { value, unresolved } = resolveTokens(card, referenceSources(dashboard));
  assert.equal(value.entities[0].entity, 'light.kitchen_counter');
  assert.equal(value.entities[1].entity, 'fan.family_room');
  assert.equal(value.entities[2].text.template, "climate.house is {{ states('climate.house') }}");
  assert.equal(value.entities[3].entity, '[[entity:model.house.sensor.gas]]');
  assert.deepEqual(unresolved, ['model.house.sensor.gas']);
  assert.equal(tokenRoles(value).length, 1);
});

test('a configuration without tokens passes through unchanged', () => {
  const plain = { objfile: 'a.glb', entities: [{ entity: 'light.a', object_id: 'x' }] };
  const { value, unresolved } = resolveTokens(plain, new Map());
  assert.deepEqual(value, plain);
  assert.deepEqual(unresolved, []);
});

test('the default dashboard has two names', () => {
  assert.equal(dashboardKey(null), 'lovelace');
  assert.equal(dashboardKey('lovelace'), 'lovelace');
  assert.equal(dashboardKey('test-3d'), 'test-3d');
});
