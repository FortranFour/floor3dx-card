// Rendering effects: an optional post-processing pipeline (three.js EffectComposer) the card renders
// through when any effect is on. Render → ambient occlusion (GTAO) → depth of field (bokeh) → output
// (tone mapping, sRGB) → SMAA, which replaces the multisampling a render target cannot keep.
// Everything here is off unless configured; the plain path draws straight to the canvas as before.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

export interface EffectSettings {
  bokeh: boolean;
  bokehStrength: number; // 1..10: how fast the blur grows away from the focus (10: full blur a quarter of the focus distance away)
  bokehBlur: number; // 0.002..0.05: the widest blur, as a fraction of the frame
  bokehFocus: number | null; // a distance in model units, or null: the camera's target
  ao: boolean;
  aoStrength: number; // 0.1..3: how dark the occlusion is drawn
  aoRadius: number | null; // model units; null: 2.5% of the model's longest side
  aoQuality: 'low' | 'medium' | 'high'; // 8 / 16 / 32 samples
  smaa: 'auto' | 'yes' | 'no'; // auto: with any other effect
}

const yes = (v: any) => v === 'yes' || v === true;
const num = (v: any, d: number, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? Math.min(hi, Math.max(lo, x)) : d; };

export function effectSettings(config: any): EffectSettings {
  const c = config || {};
  const f = Number(c.bokeh_focus), r = Number(c.ao_radius);
  const q = String(c.ao_quality || 'medium').toLowerCase();
  const smaa = c.smaa === 'no' || c.smaa === false ? 'no' : yes(c.smaa) ? 'yes' : 'auto';
  return {
    bokeh: yes(c.bokeh), bokehStrength: num(c.bokeh_strength, 5, 1, 10), bokehBlur: num(c.bokeh_blur, 0.01, 0.002, 0.05), bokehFocus: Number.isFinite(f) && f > 0 ? f : null,
    ao: yes(c.ao), aoStrength: num(c.ao_strength, 1.5, 0.1, 3), aoRadius: Number.isFinite(r) && r > 0 ? r : null, aoQuality: q === 'low' || q === 'high' ? q : 'medium',
    smaa,
  };
}

/** Whether the frame goes through the composer at all. */
export function effectsOn(s: EffectSettings): boolean { return s.bokeh || s.ao || s.smaa === 'yes'; }

/** The composer and its passes are rebuilt when this changes (which passes exist, the AO sample count). */
export function effectsKey(s: EffectSettings): string { return `${s.ao ? 'ao-' + s.aoQuality : ''}|${s.bokeh ? 'dof' : ''}|${s.smaa}`; }

export class Effects {
  private _composer: EffectComposer;
  private _ao: GTAOPass | null = null;
  private _dof: BokehPass | null = null;
  private _aoRadius = -1;
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, s: EffectSettings, stencil: boolean, modelBox: THREE.Box3 | null) {
    const size = renderer.getSize(new THREE.Vector2());
    const ratio = renderer.getPixelRatio();
    const w = Math.max(1, Math.round(size.x * ratio)), h = Math.max(1, Math.round(size.y * ratio));
    // the composer's own buffers: half float for the tone mapping, a stencil for the rooms card's tints
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, stencilBuffer: stencil, depthBuffer: true });
    this._composer = new EffectComposer(renderer, target);
    this._composer.addPass(new RenderPass(scene, camera));
    if (s.ao) {
      const samples = s.aoQuality === 'low' ? 8 : s.aoQuality === 'high' ? 32 : 16;
      this._ao = new GTAOPass(scene, camera, w, h, undefined, { samples, screenSpaceRadius: false, distanceFallOff: 1, distanceExponent: 1, scale: 1.5 });
      this._ao.output = GTAOPass.OUTPUT.Default;
      if (modelBox && !modelBox.isEmpty()) this._ao.setSceneClipBox(modelBox);
      this._composer.addPass(this._ao);
    }
    if (s.bokeh) {
      this._dof = new BokehPass(scene, camera, { focus: 1000, aperture: 0.0001, maxblur: 0.01 });
      this._composer.addPass(this._dof);
    }
    this._composer.addPass(new OutputPass());
    if (s.smaa !== 'no') this._composer.addPass(new SMAAPass());
  }
  setSize(w: number, h: number, ratio: number): void {
    this._composer.setPixelRatio(ratio);
    this._composer.setSize(w, h);
  }
  render(s: EffectSettings, focusDistance: number, renderer: THREE.WebGLRenderer, scene: THREE.Scene, modelBox: THREE.Box3 | null): void {
    if (this._dof) {
      const focus = s.bokehFocus ?? Math.max(1, focusDistance);
      const u: any = this._dof.uniforms;
      u.focus.value = focus;
      u.maxblur.value = s.bokehBlur;
      // full blur a quarter of the focus distance away at strength 10, farther out for smaller strengths
      u.aperture.value = s.bokehBlur / (0.25 * focus * (10 / s.bokehStrength));
    }
    if (this._ao) {
      this._ao.blendIntensity = s.aoStrength;
      let radius = s.aoRadius;
      if (radius === null) { const size = modelBox && !modelBox.isEmpty() ? modelBox.getSize(new THREE.Vector3()) : null; radius = size ? Math.max(size.x, size.y, size.z) * 0.025 : 10; }
      // GTAO's defaults are for metres (radius 0.25, thickness 1): the thickness follows the radius here
      if (radius !== this._aoRadius) { this._aoRadius = radius; this._ao.updateGtaoMaterial({ radius, thickness: radius * 4 }); }
    }
    // Drawn straight to the canvas the clear colour is not tone mapped; through the output pass the
    // whole frame is, exposure included. Pre-scale a plain background so it comes out as it did.
    const bg: any = scene.background;
    const exposure = renderer.toneMapping === THREE.LinearToneMapping ? renderer.toneMappingExposure : 1;
    const plain = bg && bg.isColor && exposure > 0 && exposure !== 1;
    const keep = plain ? bg.clone() : null;
    if (plain) bg.multiplyScalar(1 / exposure);
    try { this._composer.render(); } finally { if (keep) bg.copy(keep); }
  }
  dispose(): void { this._composer.dispose(); }
}
