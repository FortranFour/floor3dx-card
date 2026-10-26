// Render mode: how three.js (r186) lights and colours behave, as chosen by the card's `lights` and
// `color_management` options. Both default to `legacy`, which reproduces the picture of the 1.x card
// (three.js r130) so an existing dashboard looks the same after the upgrade.
//
// lights:
//   legacy    (default) the r130 light model: a light's reach is `distance`, brightness falls off as
//             (1 - d/distance)^decay, and the configured intensities are what the 1.x card showed.
//   physical  three.js' inverse-square falloff (1/d^decay, `distance` a soft cutoff) for the lamps,
//             with each lamp's intensity chosen so that it is as bright as in legacy halfway along its
//             reach (brighter next to the bulb, fainter at the edge); everything else as in legacy.
// color_management:
//   legacy    (default) colours and textures as the 1.x card showed them: hex colours taken as given,
//             no sRGB encoding of the output.
//   managed   three.js' colour management: hex colours are sRGB, the output is sRGB-encoded, and
//             textures come out as authored. The exposure and the look's palette are adjusted so the
//             rest of the picture stays where it was (see MANAGED_EXPOSURE).
//
// Both settings are page wide in three.js (ColorManagement and the shader chunks are globals), so
// all floor3dx cards on one dashboard view should use the same values.
import * as THREE from 'three';
import { ROOM_LIGHT_PARS } from './room-light';

export type LightsMode = 'legacy' | 'physical';
export type ColorMode = 'legacy' | 'managed';

const CHUNK = THREE.ShaderChunk as unknown as { [name: string]: string };
// + the room mask of light_rooms (room-light.ts), declared where every lit material can call it
const ORIGINAL_LIGHTS = CHUNK.lights_pars_begin + ROOM_LIGHT_PARS;

// r130's getDistanceAttenuation without PHYSICALLY_CORRECT_LIGHTS.
const LEGACY_ATTENUATION = `float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {

	if ( cutoffDistance > 0.0 && decayExponent > 0.0 ) {

		return pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent );

	}

	return 1.0;

}
`;

// The r130 light model also scaled every light by PI (its diffuse BRDF divides by PI; the physical
// model expects the light units to carry that). Applied where each light's colour enters the shader
// so every material type and every light, including the daylight module's, gets it.
const PI_SCALED: [string, string][] = [
  ['light.color = pointLight.color;', 'light.color = pointLight.color * PI;'],
  ['light.color = spotLight.color * spotAttenuation;', 'light.color = spotLight.color * spotAttenuation * PI;'],
  ['light.color = directionalLight.color;', 'light.color = directionalLight.color * PI;'],
  ['light.color = sunLight.color;', 'light.color = sunLight.color * PI;'],
  ['vec3 irradiance = ambientLightColor;', 'vec3 irradiance = ambientLightColor * PI;'],
  [
    'vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );',
    'vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight ) * PI;',
  ],
];

let legacyChunk: string | null = null;
let physicalChunk: string | null = null;

// Managed colours encode the output (x^(1/2.2)), which legacy did not, so every light amount that
// legacy showed as it was (an intensity, a falloff, the cosine of the angle to the light) would come
// out lifted: a side lit at 0.3 shows as 0.58, and the picture goes flat. Raising the light amounts
// to 2.2 first puts them back: (e * albedo^2.2 * (m * att * cos)^2.2)^(1/2.2) = 0.6 albedo m att cos
// with e = MANAGED_EXPOSURE, the legacy value. Hues are left alone (they are already converted once,
// which is what makes them come out right): f3dxGamma scales a light's colour by its own magnitude.
// 2.2 would be exact for one light on an unclipped surface; the 1.x picture summed several lights and
// clipped freely, and against its reference renders 1.8 with the legacy exposure comes closest
// (house, five views: 5-25% of pixels differ by more than 12 levels, mean difference 2-9 levels;
// garage under 2 levels). Measured with dev/harness/render_views.py EXTRA='{"color_management":"managed"}'.
const LIGHT_GAMMA = 1.8;
const GAMMA_FUNCTION = `
#define F3DX_LIGHT_GAMMA ${LIGHT_GAMMA.toFixed(3)}
vec3 f3dxGamma( const in vec3 c ) {
	float m = max( c.r, max( c.g, c.b ) );
	return m > 0.0 ? c * pow( m, F3DX_LIGHT_GAMMA - 1.0 ) : c;
}
`;
const GAMMA_LIGHTS: [string, string][] = [
  ['light.color = pointLight.color * PI;', 'light.color = f3dxGamma( pointLight.color ) * PI;'],
  ['light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );', 'light.color *= pow( getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay ), F3DX_LIGHT_GAMMA );'],
  ['light.color = spotLight.color * spotAttenuation * PI;', 'light.color = f3dxGamma( spotLight.color ) * pow( spotAttenuation, F3DX_LIGHT_GAMMA ) * PI;'],
  ['light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );', 'light.color *= pow( getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay ), F3DX_LIGHT_GAMMA );'],
  ['light.color = directionalLight.color * PI;', 'light.color = f3dxGamma( directionalLight.color ) * PI;'],
  ['light.color = sunLight.color * PI;', 'light.color = f3dxGamma( sunLight.color ) * PI;'],
  ['vec3 irradiance = ambientLightColor * PI;', 'vec3 irradiance = f3dxGamma( ambientLightColor ) * PI;'],
  [
    'vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight ) * PI;',
    'vec3 irradiance = f3dxGamma( mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight ) ) * PI;',
  ],
];
const DOT_NL_CHUNKS = ['lights_physical_pars_fragment', 'lights_lambert_pars_fragment', 'lights_phong_pars_fragment'];
const ORIGINAL_DOT_NL: { [chunk: string]: string } = {};
DOT_NL_CHUNKS.forEach((name) => (ORIGINAL_DOT_NL[name] = CHUNK[name]));

function withGamma(chunk: string): string {
  chunk = chunk.replace('uniform vec3 ambientLightColor;', 'uniform vec3 ambientLightColor;' + GAMMA_FUNCTION);
  GAMMA_LIGHTS.forEach(([from, to]) => {
    if (chunk.indexOf(from) < 0) console.warn('floor3dx-card: managed lights: shader line not found: ' + from);
    chunk = chunk.replace(from, to);
  });
  return chunk;
}

function applyGammaCosine(on: boolean): void {
  DOT_NL_CHUNKS.forEach((name) => {
    CHUNK[name] = on
      ? ORIGINAL_DOT_NL[name].replace('vec3 irradiance = dotNL * directLight.color;', `vec3 irradiance = pow( dotNL, ${LIGHT_GAMMA.toFixed(3)} ) * directLight.color;`)
      : ORIGINAL_DOT_NL[name];
  });
}

// Off from the moment the card's module loads, not only once a renderer exists: three.js turns
// colour management on by default, and a colour parsed from hex before the first card's renderer was
// set up (a card's `backgroundColor` on a fresh page, say) would be converted to linear and come out
// dark, while the same colour on a page where a card had already run would not. `managed` turns it
// back on when a card asks for it.
THREE.ColorManagement.enabled = false;

function withPi(chunk: string): string {
  PI_SCALED.forEach(([from, to]) => {
    if (chunk.indexOf(from) < 0) console.warn('floor3dx-card: lights: shader line not found: ' + from);
    chunk = chunk.replace(from, to);
  });
  return chunk;
}

function buildLegacyChunk(): string {
  return withPi(ORIGINAL_LIGHTS.replace(/float getDistanceAttenuation\([\s\S]*?\n}\n/, LEGACY_ATTENUATION));
}

// physical: three.js' inverse-square falloff, but every light keeps the PI the 1.x model carried, so
// the camera light, ambient and daylight are as bright as before and only the lamps' falloff changes.
function buildPhysicalChunk(): string {
  return withPi(ORIGINAL_LIGHTS);
}

// Where along its reach a lamp in physical mode is as bright as it was in legacy mode: the two
// falloff curves cross there. Half the reach: a lamp lights the floor under it as before, is brighter
// right next to the bulb and fainter at the edge of its reach.
const PHYSICAL_MATCH = 0.5;
const PHYSICAL_REF_DISTANCE = 200; // cm; for lamps with distance 0 (no cutoff), where to match

/**
 * Intensity of a point or spot light of `lumens` lumens at `fraction` (0..1) of its brightness.
 * legacy: the 1.x card's 0.003 per lumen, in its own units. physical: the intensity that gives, at
 * PHYSICAL_MATCH of the lamp's reach, the same light as legacy gave there: legacy there is
 * I (1 - m)^decay, physical is I_p / d^decay (1 - (d/D)^4)^2 with d = m D, so
 * I_p = I (1 - m)^decay d^decay / (1 - m^4)^2. With `exposure`, `globalLightPower` and `lumens`
 * unchanged, a 1.x configuration then looks about the same under physical lights.
 */
export function lightIntensity(lumens: number, fraction: number, config: any, distance = 600, decay = 2): number {
  const legacy = 0.003 * lumens * fraction;
  if (lightsMode(config) !== 'physical') return legacy;
  const dec = decay > 0 ? decay : 2;
  if (distance > 0) {
    const d = PHYSICAL_MATCH * distance;
    const window = Math.pow(1 - Math.pow(PHYSICAL_MATCH, 4), 2);
    return (legacy * Math.pow(1 - PHYSICAL_MATCH, dec) * Math.pow(d, dec)) / window;
  }
  return legacy * Math.pow(PHYSICAL_REF_DISTANCE, dec); // no cutoff: legacy was constant; match at the reference distance
}

// The exposure under managed colours. 0.6^2.2 would show a flat unlit colour exactly as legacy did
// ((e c^2.2)^(1/2.2) = 0.6 c), but with the light amounts raised by LIGHT_GAMMA the legacy exposure
// itself measures closest overall (see above), so the default is the same 0.6 in both modes.
export const MANAGED_EXPOSURE = 0.6;

// exposure: the renderer's tone-mapping exposure unless configured: 0.6 as in 1.x, or its managed
// counterpart.
export function exposure(config: any): number {
  const e = config ? Number(config.exposure) : NaN;
  if (e > 0) return e;
  return colorMode(config) === 'managed' ? MANAGED_EXPOSURE : 0.6;
}

/** A colour given as display values (0..1 numbers, the look's stage colours) in the working space:
 *  converted to linear under managed colours so it shows as the numbers say, as it did in legacy. */
export function displayColor(r: number, g: number, b: number, config: any): THREE.Color {
  const c = new THREE.Color(r, g, b);
  return colorMode(config) === 'managed' ? c.convertSRGBToLinear() : c;
}

export function lightsMode(config: any): LightsMode {
  return config && config.lights === 'physical' ? 'physical' : 'legacy';
}

export function colorMode(config: any): ColorMode {
  return config && config.color_management === 'managed' ? 'managed' : 'legacy';
}

// Called before a card's renderer compiles anything. Programs already compiled by another renderer
// keep the chunk they were compiled with; see the note on page-wide settings above.
export function applyRenderMode(renderer: THREE.WebGLRenderer, config: any): void {
  const lights = lightsMode(config);
  const colors = colorMode(config);

  if (lights === 'legacy') {
    if (!legacyChunk) legacyChunk = buildLegacyChunk();
    CHUNK.lights_pars_begin = legacyChunk;
  } else {
    if (!physicalChunk) physicalChunk = buildPhysicalChunk();
    CHUNK.lights_pars_begin = physicalChunk;
  }
  if (colors === 'managed') CHUNK.lights_pars_begin = withGamma(CHUNK.lights_pars_begin);
  applyGammaCosine(colors === 'managed');

  THREE.ColorManagement.enabled = colors === 'managed';
  const sky = config && config.sky == 'yes';
  renderer.outputColorSpace = colors === 'managed' || sky ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
}
