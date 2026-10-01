// daylight: - time of day without a roof.
//
// The card's `sky` option puts a real sun in the scene, which only works on a model with a roof to
// stop it. This module instead reads the sun's elevation and azimuth (from sun.sun or an override)
// and a weather condition, and turns them into things a roofless plan can show:
//   - ambient and camera light level and colour (cool day, orange dusk, dim blue night)
//   - a hemisphere light with sky and ground colours
//   - the scene background colour
//   - a sun spot outside each listed window, bright only on the side the sun is on
//   - a separate, dimmer ambient for exterior objects at night
//   - an emissive glow on glass when its room light is on after dark
//
// Everything is derived from a daylight factor f (0 at night, 1 by day) and a dusk weight w (1 with
// the sun on the horizon, 0 away from it), both from elevation, with the day part scaled by weather.

import * as THREE from 'three';

export interface DaylightConfig {
  sun_entity?: string; // default sun.sun
  weather_entity?: string; // optional; state is the condition
  time_entity?: string; // optional override: numeric hour 0-24, or an entity with elevation/azimuth attributes
  north?: { x: number; z: number }; // scene direction of north, from the card's `north`
  ambient?: { day?: number; night?: number }; // ambient/torch intensity; default day = globalLightPower, night = day * 0.2
  colors?: { day?: string; dusk?: string; dawn?: string; night?: string; ground?: string }; // dawn defaults to dusk
  // elevation stops, degrees: fully night at or below `night`, the dusk/dawn colour at `dusk`, fully day at or above `day`
  gradient?: { night?: number; dusk?: number; day?: number };
  background?: boolean | string | { day?: string; dusk?: string; night?: string }; // default yes
  hemisphere?: boolean | string; // default yes
  weather?: { [condition: string]: number }; // condition -> factor, merged over defaults
  windows?: DaylightWindow[]; // sun spots
  exterior?: string[]; // object ids or <group> names lit by the exterior ambient only
  exterior_night?: number; // exterior ambient at night, as a fraction of the day level; default 0.08
  glow?: DaylightGlow[];
}

export interface DaylightWindow {
  object_id: string; // window pane object or <group>
  lumens?: number; // default 1000
  color?: string; // default the current daylight colour
  distance?: number; // default 400
  angle?: number; // half angle, degrees; default 35
  shadow?: boolean | string;
}

export interface DaylightGlow {
  object_id: string;
  entity: string; // light or switch whose `on` state lights the glass
  color?: string; // default #ffd27a
  intensity?: number; // default 0.6
}

interface Deps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  resolve: (objectId: string) => THREE.Mesh[]; // expands <group> names
  ambient: THREE.Light; // the card's ambient light
  torch?: THREE.Light; // the card's camera light
  baseIntensity: number; // globalLightPower as configured
  baseBackground: THREE.Color | null;
}

const DEFAULT_WEATHER: { [c: string]: number } = {
  'clear-night': 1,
  sunny: 1,
  clear: 1,
  windy: 0.95,
  'windy-variant': 0.9,
  partlycloudy: 0.85,
  cloudy: 0.6,
  fog: 0.4,
  hail: 0.45,
  rainy: 0.45,
  pouring: 0.35,
  lightning: 0.5,
  'lightning-rainy': 0.4,
  snowy: 0.55,
  'snowy-rainy': 0.45,
  exceptional: 0.7,
};

const EXTERIOR_LAYER = 1;

export class Daylight {
  private cfg: DaylightConfig;
  private d: Deps;
  private hemi: THREE.HemisphereLight | null = null;
  private exteriorAmbient: THREE.AmbientLight | null = null;
  private spots: { light: THREE.SpotLight; outward: THREE.Vector3; lumens: number; color: string | null }[] = [];
  private glows: { meshes: THREE.Mesh[]; entity: string; color: THREE.Color; intensity: number }[] = [];
  private lastSignature = '';
  private dayColor: THREE.Color;
  private duskColor: THREE.Color;
  private dawnColor: THREE.Color;
  private stops: { night: number; dusk: number; day: number };
  private nightColor: THREE.Color;
  private groundColor: THREE.Color;
  private bg: { day: THREE.Color; dusk: THREE.Color; night: THREE.Color } | null = null;
  private weatherMap: { [c: string]: number };
  private ambientDay: number;
  private ambientNight: number;
  private modelCenter = new THREE.Vector3();

  constructor(cfg: DaylightConfig, deps: Deps) {
    this.cfg = cfg || {};
    this.d = deps;
    const colors = this.cfg.colors || {};
    this.dayColor = new THREE.Color(colors.day || '#e9f0ff');
    this.duskColor = new THREE.Color(colors.dusk || '#ff9a4a');
    this.dawnColor = new THREE.Color(colors.dawn || colors.dusk || '#ff9a4a');
    const g = this.cfg.gradient || {};
    this.stops = {
      night: g.night !== undefined ? Number(g.night) : -8,
      dusk: g.dusk !== undefined ? Number(g.dusk) : 0,
      day: g.day !== undefined ? Number(g.day) : 15,
    };
    this.nightColor = new THREE.Color(colors.night || '#8a9bc4');
    this.groundColor = new THREE.Color(colors.ground || '#7a7068');
    this.weatherMap = Object.assign({}, DEFAULT_WEATHER, this.cfg.weather || {});
    const amb = this.cfg.ambient || {};
    this.ambientDay = amb.day !== undefined ? Number(amb.day) : deps.baseIntensity;
    this.ambientNight = amb.night !== undefined ? Number(amb.night) : this.ambientDay * 0.2;

    if (this.yes(this.cfg.background, true)) {
      const b = typeof this.cfg.background === 'object' ? this.cfg.background : {};
      this.bg = {
        day: new THREE.Color(b.day || '#9fc5e8'),
        dusk: new THREE.Color(b.dusk || '#f2a45c'),
        night: new THREE.Color(b.night || '#1c2438'),
      };
    }

    // model centre, for deciding which side of a window is outside
    const box = new THREE.Box3();
    deps.scene.traverse((o: any) => {
      if (o.isMesh && o.geometry) box.expandByObject(o);
    });
    box.getCenter(this.modelCenter);

    if (this.yes(this.cfg.hemisphere, true)) {
      this.hemi = new THREE.HemisphereLight(this.dayColor, this.groundColor, 0);
      this.hemi.layers.enable(EXTERIOR_LAYER);
      deps.scene.add(this.hemi);
    }
    if (deps.torch) deps.torch.layers.enable(EXTERIOR_LAYER);

    // exterior objects: moved to their own layer, lit by their own ambient
    if (Array.isArray(this.cfg.exterior) && this.cfg.exterior.length) {
      this.cfg.exterior.forEach((id) =>
        deps.resolve(id).forEach((m) => {
          m.layers.set(EXTERIOR_LAYER);
        }),
      );
      this.exteriorAmbient = new THREE.AmbientLight(0xffffff, 0);
      this.exteriorAmbient.layers.set(EXTERIOR_LAYER);
      deps.scene.add(this.exteriorAmbient);
      deps.camera.layers.enable(EXTERIOR_LAYER);
    }

    // window sun spots
    (this.cfg.windows || []).forEach((w) => {
      const meshes = deps.resolve(w.object_id);
      if (!meshes.length) {
        console.warn('floor3d-card: daylight window <' + w.object_id + '> not found in the model');
        return;
      }
      const box = new THREE.Box3();
      meshes.forEach((m) => box.expandByObject(m));
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      // the pane's thin axis is its normal; outward is the side away from the model centre
      const outward = size.x <= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      if (center.clone().sub(this.modelCenter).dot(outward) < 0) outward.negate();
      const distance = w.distance !== undefined ? Number(w.distance) : 400;
      const angle = THREE.MathUtils.degToRad(w.angle !== undefined ? Number(w.angle) : 35);
      const light = new THREE.SpotLight(0xffffff, 0, distance, angle, 0.4, 1.0);
      light.position.copy(center.clone().add(outward.clone().multiplyScalar(40)).add(new THREE.Vector3(0, 60, 0)));
      light.target.position.copy(center.clone().sub(outward.clone().multiplyScalar(160)).sub(new THREE.Vector3(0, 150, 0)));
      light.name = 'daylight_' + w.object_id;
      if (this.yes(w.shadow, false)) {
        light.castShadow = true;
        light.shadow.bias = -0.0001;
        light.shadow.mapSize.set(1024, 1024);
      }
      deps.scene.add(light);
      deps.scene.add(light.target);
      this.spots.push({ light, outward, lumens: w.lumens !== undefined ? Number(w.lumens) : 1000, color: w.color || null });
    });

    // glass glow
    (this.cfg.glow || []).forEach((g) => {
      const meshes = deps.resolve(g.object_id);
      meshes.forEach((m: any) => {
        if (m.material && !m.userData.daylightOwnMaterial) {
          m.material = Array.isArray(m.material) ? m.material.map((x: any) => x.clone()) : m.material.clone();
          m.userData.daylightOwnMaterial = true;
        }
      });
      this.glows.push({
        meshes,
        entity: g.entity,
        color: new THREE.Color(g.color || '#ffd27a'),
        intensity: g.intensity !== undefined ? Number(g.intensity) : 0.6,
      });
    });
  }

  /** Recompute from the current states. Returns true when anything changed. */
  update(states: any): boolean {
    const sun = this.sunPosition(states);
    const weather = this.cfg.weather_entity && states[this.cfg.weather_entity] ? String(states[this.cfg.weather_entity].state) : '';
    const glowStates = this.glows.map((g) => (states[g.entity] ? states[g.entity].state : '')).join(',');
    const signature = [sun.elevation.toFixed(1), sun.azimuth.toFixed(1), sun.rising ? 'r' : 's', weather, glowStates].join('|');
    if (signature === this.lastSignature) return false;
    this.lastSignature = signature;

    // Daylight factor f: 0 at or below the night stop, 1 at or above the day stop, smooth between.
    const f = smoothstep(this.stops.night, this.stops.day, sun.elevation);
    const wf = weather && this.weatherMap[weather] !== undefined ? this.weatherMap[weather] : 1;
    const fe = f * wf; // effective daylight
    // Colour runs night -> dusk/dawn -> day along the elevation stops, so the low sun is fully the
    // horizon colour and both sides of it blend out of it gradually.
    const horizon = sun.rising ? this.dawnColor : this.duskColor;
    const color = this.gradient(this.nightColor, horizon, this.dayColor, sun.elevation);
    if (wf < 1) color.lerp(new THREE.Color('#c8ccd2'), (1 - wf) * f); // overcast greys the tint

    const intensity = this.ambientNight + (this.ambientDay - this.ambientNight) * fe;
    this.d.ambient.intensity = this.hemi ? intensity * 0.5 : intensity;
    (this.d.ambient as any).color.copy(color);
    if (this.d.torch) {
      this.d.torch.intensity = intensity;
      this.d.torch.color.copy(color);
    }
    if (this.hemi) {
      this.hemi.color.copy(color);
      this.hemi.intensity = intensity * 0.7;
    }
    if (this.exteriorAmbient) {
      const nightFrac = this.cfg.exterior_night !== undefined ? Number(this.cfg.exterior_night) : 0.08;
      this.exteriorAmbient.intensity = this.ambientDay * (nightFrac + (1 - nightFrac) * fe);
      this.exteriorAmbient.color.copy(color);
    }
    if (this.bg) {
      const c = this.gradient(this.bg.night, this.bg.dusk, this.bg.day, sun.elevation);
      if (wf < 1) c.lerp(new THREE.Color('#8f9aa6'), (1 - wf) * f);
      this.d.scene.background = c;
    }

    // sun spots: bright only when the sun is above the horizon and on that window's side
    const sunDir = this.sunDirection(sun.elevation, sun.azimuth);
    this.spots.forEach((s) => {
      const facing = Math.max(0, s.outward.dot(sunDir));
      const low = smoothstep(0, 8, sun.elevation); // no beam until the sun is a little up
      s.light.intensity = 0.003 * s.lumens * facing * low * wf;
      s.light.color.copy(s.color ? new THREE.Color(s.color) : color);
    });

    // glass glow after dark
    const dark = 1 - f;
    this.glows.forEach((g) => {
      const on = states[g.entity] && states[g.entity].state === 'on';
      const k = on ? dark * g.intensity : 0;
      g.meshes.forEach((m: any) => {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat: any) => {
          if (mat && mat.emissive) mat.emissive.copy(g.color).multiplyScalar(k);
        });
      });
    });
    return true;
  }

  dispose(): void {
    if (this.hemi) this.d.scene.remove(this.hemi);
    if (this.exteriorAmbient) this.d.scene.remove(this.exteriorAmbient);
    this.spots.forEach((s) => {
      this.d.scene.remove(s.light);
      this.d.scene.remove(s.light.target);
    });
  }

  // ---- helpers ---------------------------------------------------------------------------------

  private yes(v: any, dflt: boolean): boolean {
    if (v === undefined || v === null) return dflt;
    if (typeof v === 'object') return true;
    return v === true || String(v).toLowerCase() === 'yes' || String(v).toLowerCase() === 'true';
  }

  // night -> horizon -> day, by elevation along the configured stops
  private gradient(night: THREE.Color, horizon: THREE.Color, day: THREE.Color, elevation: number): THREE.Color {
    const { night: n, dusk: h, day: d } = this.stops;
    if (elevation <= n) return night.clone();
    if (elevation >= d) return day.clone();
    if (elevation <= h) return night.clone().lerp(horizon, smooth01((elevation - n) / Math.max(1e-6, h - n)));
    return horizon.clone().lerp(day, smooth01((elevation - h) / Math.max(1e-6, d - h)));
  }

  private sunPosition(states: any): { elevation: number; azimuth: number; rising: boolean } {
    if (this.cfg.time_entity && states[this.cfg.time_entity]) {
      const t = states[this.cfg.time_entity];
      const a = t.attributes || {};
      if (a.elevation !== undefined && a.azimuth !== undefined) {
        return { elevation: Number(a.elevation), azimuth: Number(a.azimuth), rising: a.rising !== false };
      }
      const hour = parseFloat(t.state);
      if (!isNaN(hour)) {
        // a plain day: sunrise 6, noon 12 at 60 degrees, sunset 18; south at noon
        const x = ((hour - 6) / 12) * Math.PI;
        return { elevation: 60 * Math.sin(x), azimuth: 90 + (hour - 6) * 15, rising: hour < 12 };
      }
    }
    const sun = states[this.cfg.sun_entity || 'sun.sun'];
    if (sun && sun.attributes) {
      return {
        elevation: Number(sun.attributes.elevation) || 0,
        azimuth: Number(sun.attributes.azimuth) || 0,
        rising: sun.attributes.rising !== false,
      };
    }
    return { elevation: 45, azimuth: 180, rising: false };
  }

  private sunDirection(elevation: number, azimuth: number): THREE.Vector3 {
    const north = this.cfg.north || { x: 0, z: -1 };
    const n = new THREE.Vector3(Number(north.x) || 0, 0, Number(north.z) || 0).normalize();
    const e = new THREE.Vector3(-n.z, 0, n.x); // east is north turned clockwise seen from above
    const az = THREE.MathUtils.degToRad(azimuth);
    const el = THREE.MathUtils.degToRad(elevation);
    const h = n.clone().multiplyScalar(Math.cos(az)).add(e.multiplyScalar(Math.sin(az)));
    return new THREE.Vector3(h.x * Math.cos(el), Math.sin(el), h.z * Math.cos(el)).normalize();
  }
}

function smooth01(t: number): number {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
