import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, paletteOf } from '../../src/look-palettes';
import { Look } from '../../src/look';

test('34 palettes with complete colours and unique keys', () => {
  assert.equal(PALETTES.length, 34);
  assert.equal(new Set(PALETTES.map((p) => p.key)).size, 34);
  for (const p of PALETTES) for (const k of ['dark', 'light', 'walls', 'floors', 'edges', 'stage']) assert.match(String((p as any)[k]), /^#[0-9a-f]{6}$/, `${p.key}.${k}`);
});

test('a palette name is the custom theme with its colours; a custom block overrides', () => {
  assert.equal(paletteOf('Riso')!.key, 'riso');
  assert.equal(paletteOf('nope'), undefined);
  const c = Look.paletteColours({ theme: 'riso' })!;
  assert.equal(c.stage, '#081a3d');
  assert.equal((c as any).key, undefined);
  const o = Look.paletteColours({ theme: 'riso', custom: { edges: '#000000' } })!;
  assert.equal(o.edges, '#000000');
  assert.equal(o.dark, '#0f2a5c');
  assert.equal(Look.paletteColours({ theme: 'neon', custom: { dark: '#111111' } })!.dark, '#111111');
});
