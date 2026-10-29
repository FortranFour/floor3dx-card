// The camera's projection: the lens (field of view) and, with two-point perspective, straight verticals.
//
// Three-point perspective is what a camera does: tilt it down and the walls lean inward toward the top
// of the frame. Two-point is the architectural photographer's tilt-shift lens: the lens stays level
// and shifts down to frame the view, so vertical lines stay vertical while depth, lighting and size
// cues stay as they are. Here that is a shear of the view-space z by y, folded into the projection
// matrix after three.js builds it, sized so that a world-vertical direction loses its depth component.
import * as THREE from 'three';

export type Projection = 'three_point' | 'two_point';

export interface ProjectionSettings {
  projection: Projection;
  fov: number; // vertical field of view, degrees
}

export const FOV_DEFAULT = 45;
export const FOV_STEPS: { fov: number; label: string }[] = [
  { fov: 25, label: 'Telephoto' },
  { fov: 35, label: 'Narrow' },
  { fov: 45, label: 'Normal' },
  { fov: 60, label: 'Wide' },
];

export function projectionSettings(config: any): ProjectionSettings {
  const p = String(config?.camera_projection || '').toLowerCase().replace(/-/g, '_');
  const f = Number(config?.camera_fov);
  return { projection: p === 'two_point' || p === 'two' || p === '2' ? 'two_point' : 'three_point', fov: Number.isFinite(f) && f >= 10 && f <= 120 ? f : FOV_DEFAULT };
}

const shear = new THREE.Matrix4();
const up = new THREE.Vector3();

/** Install the two-point shear on a camera: its projection matrix takes it on every update, and
 *  `refresh()` re-applies it when the camera turns. Call `release()` to go back to three-point. */
export function installTwoPoint(camera: THREE.PerspectiveCamera): { refresh: () => void; release: () => void } {
  const base = Object.getPrototypeOf(camera).updateProjectionMatrix as () => void;
  let k = 0;
  const apply = () => {
    base.call(camera);
    if (k !== 0) {
      shear.identity();
      shear.elements[6] = k; // column 1 (y), row 2: z' = z + k * y  (column-major)
      camera.projectionMatrix.multiply(shear);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
  };
  const refresh = () => {
    // the world's vertical in view space; the shear removes its depth component, tapered off as the
    // view turns straight down (there are no verticals to straighten there, and vy -> 0)
    camera.updateMatrixWorld();
    up.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
    const vy = up.y, vz = up.z;
    const next = Math.abs(vy) < 0.3 ? -vz / 0.3 * Math.max(0, (Math.abs(vy) - 0.15) / 0.15) * Math.sign(vy || 1) : -vz / vy;
    if (Math.abs(next - k) > 1e-4) { k = next; apply(); }
  };
  (camera as any).updateProjectionMatrix = apply;
  refresh();
  return {
    refresh,
    release: () => { k = 0; delete (camera as any).updateProjectionMatrix; camera.updateProjectionMatrix(); },
  };
}
