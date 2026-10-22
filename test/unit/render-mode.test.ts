import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightIntensity, exposure, displayColor, MANAGED_EXPOSURE } from '../../src/render-mode';

test('legacy intensity: 0.003 per lumen, times the brightness', () => {
  assert.equal(lightIntensity(1000, 1, {}), 3);
  assert.equal(lightIntensity(1000, 0.5, { lights: 'legacy' }), 1.5);
});

test('physical intensity: the two falloffs meet halfway along the reach', () => {
  const I = 0.003 * 1000;
  const D = 250, decay = 1.2, m = 0.5;
  const legacyThere = I * Math.pow(1 - m, decay);
  const Ip = lightIntensity(1000, 1, { lights: 'physical' }, D, decay);
  const d = m * D;
  const physicalThere = (Ip / Math.pow(d, decay)) * Math.pow(1 - Math.pow(d / D, 4), 2);
  assert.ok(Math.abs(physicalThere - legacyThere) < 1e-9, `${physicalThere} vs ${legacyThere}`);
});

test('physical intensity without a cutoff matches legacy at the reference distance', () => {
  const Ip = lightIntensity(700, 1, { lights: 'physical' }, 0, 2);
  assert.equal(Ip / (200 * 200), 0.003 * 700);
});

test('exposure: 0.6 unless configured, in both colour modes', () => {
  assert.equal(exposure({}), 0.6);
  assert.equal(exposure({ color_management: 'managed' }), MANAGED_EXPOSURE);
  assert.equal(exposure({ exposure: 0.2 }), 0.2);
  assert.equal(exposure({ exposure: '0' }), 0.6);
});

test('displayColor: display values stay as given in legacy, go linear under managed', () => {
  assert.equal(displayColor(0.5, 0.5, 0.5, {}).r, 0.5);
  const lin = displayColor(0.5, 0.5, 0.5, { color_management: 'managed' }).r;
  assert.ok(lin > 0.2 && lin < 0.22, String(lin)); // sRGB 0.5 -> linear 0.214
});
