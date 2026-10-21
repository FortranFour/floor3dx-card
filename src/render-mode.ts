// Render mode: how three.js (r186) lights and colours behave, as chosen by the card's `lights` and
// `color_management` options. Both default to `legacy`, which reproduces the picture of the 1.x card
// (three.js r130) so an existing dashboard looks the same after the upgrade.
//
// lights:
//   legacy    (default) the r130 light model: a light's reach is `distance`, brightness falls off as
//             (1 - d/distance)^decay, and the configured intensities are what the 1.x card showed.
//   physical  three.js' current, physically based model: intensities in candela, inverse-square
//             falloff (1/d^decay) with `distance` as a soft cutoff. Lights need re-tuning: the same
//             `lumens` is far brighter close to the light and dimmer far from it.
// color_management:
//   legacy    (default) colours and textures as the 1.x card showed them: hex colours taken as given,
//             no sRGB encoding of the output.
//   managed   three.js' colour management: hex colours are sRGB, the output is sRGB-encoded, and
//             textures come out as authored (brighter, less saturated than legacy).
//
// Both settings are page wide in three.js (ColorManagement and the shader chunks are globals), so
// all floor3dx cards on one dashboard view should use the same values.
import * as THREE from 'three';

export type LightsMode = 'legacy' | 'physical';
export type ColorMode = 'legacy' | 'managed';

const CHUNK = THREE.ShaderChunk as unknown as { [name: string]: string };
const ORIGINAL_LIGHTS = CHUNK.lights_pars_begin;

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

function buildLegacyChunk(): string {
  let chunk = ORIGINAL_LIGHTS.replace(/float getDistanceAttenuation\([\s\S]*?\n}\n/, LEGACY_ATTENUATION);
  PI_SCALED.forEach(([from, to]) => {
    if (chunk.indexOf(from) < 0) console.warn('floor3dx-card: legacy lights: shader line not found: ' + from);
    chunk = chunk.replace(from, to);
  });
  return chunk;
}

// Intensity of a point or spot light of `lumens` lumens at `fraction` (0..1) of its brightness.
// legacy: the 1.x card's 0.003 per lumen, in its own units. physical: candela (lumens / 4 PI),
// scaled by 100^2 because the models are in centimetres and three.js' inverse-square falloff
// assumes metres; the same bulb at the same distance then gives the same light in either unit.
export function lightIntensity(lumens: number, fraction: number, config: any): number {
  if (lightsMode(config) === 'physical') return (lumens / (4 * Math.PI)) * 10000 * fraction;
  return 0.003 * lumens * fraction;
}

// exposure: the renderer's tone-mapping exposure, 0.6 as in 1.x unless configured.
export function exposure(config: any): number {
  const e = config ? Number(config.exposure) : NaN;
  return e > 0 ? e : 0.6;
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
    CHUNK.lights_pars_begin = ORIGINAL_LIGHTS;
  }

  THREE.ColorManagement.enabled = colors === 'managed';
  const sky = config && config.sky == 'yes';
  renderer.outputColorSpace = colors === 'managed' || sky ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
}
