// Rooms on a loaded floor3dx scene: the floor objects of a Sweet Home 3D export (room_N_1), which
// point of the plan lies in which room, and a first proposal of rooms with the card's entities in
// them. Adapted from floor3d-snapshot-card's snapshot.js (same author, MIT).
import * as THREE from 'three';

export interface RoomEntity {
  entity: string;
  name?: string;
  icon?: string;
  read_only?: boolean;
}
export interface Room {
  id: string;
  name?: string;
  icon?: string;
  description?: string;
  color?: string;
  floors?: string[]; // object names
  entities?: RoomEntity[];
}

export const FLOOR_RE = /^room_(\d+)_1$/;
export const ROOM_PALETTE = ['#F2C46D', '#9CC5A1', '#8FB8DE', '#E8A598', '#4FC99A', '#B9A6D9', '#8ED1CF', '#F0B8C8', '#C9D88A', '#B8C2CC', '#F4A97A', '#A9C7E8'];
const CONTROL_DOMAINS = new Set(['light', 'switch', 'fan', 'cover', 'climate', 'media_player', 'lock', 'input_boolean', 'scene', 'script', 'remote', 'vacuum', 'water_heater', 'humidifier', 'valve']);
const SENSOR_DOMAINS = new Set(['sensor', 'binary_sensor']);
const ROOM_ICONS: [RegExp, string][] = [
  [/kitchen/i, 'mdi:countertop-outline'], [/dining/i, 'mdi:silverware-fork-knife'], [/family|den/i, 'mdi:sofa-single-outline'], [/living|lounge/i, 'mdi:sofa-outline'],
  [/master.*bed|primary.*bed/i, 'mdi:bed-king-outline'], [/bed|guest/i, 'mdi:bed-queen-outline'], [/bath|shower|wc|toilet/i, 'mdi:shower'], [/laundry|utility/i, 'mdi:washing-machine'],
  [/garage/i, 'mdi:garage-variant'], [/office|study|desk/i, 'mdi:desk'], [/hall|entry|foyer|corridor/i, 'mdi:door-open'], [/porch|patio|deck|garden|yard/i, 'mdi:outdoor-lamp'],
  [/kid|nursery|play/i, 'mdi:teddy-bear'], [/gym/i, 'mdi:dumbbell'], [/closet|storage/i, 'mdi:hanger'],
];
export function roomIcon(name: string): string {
  return (ROOM_ICONS.find(([re]) => re.test(name)) || [null, 'mdi:door-open'])[1] as string;
}
export function cleanRoomName(name: string): string {
  return String(name || '')
    .replace(/\bfloor\s*3d\b|\bfloor3d\b|\b3d\b/gi, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)([a-z])/g, (_m, p, c) => p + c.toUpperCase());
}
export function slug(name: string, taken = new Set<string>()): string {
  const base = String(name || 'room').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room';
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

/** World-space XZ triangles of an object (its meshes). */
export function floorTriangles(obj: THREE.Object3D | undefined): number[][] {
  const tris: number[][] = [];
  obj?.traverse((m: any) => {
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position, index = m.geometry.index;
    if (!pos) return;
    m.updateWorldMatrix(true, false);
    const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
    const n = index ? index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const a = v(index ? index.getX(t) : t), b = v(index ? index.getX(t + 1) : t + 1), c = v(index ? index.getX(t + 2) : t + 2);
      tris.push([a.x, a.z, b.x, b.z, c.x, c.z]);
    }
  });
  return tris;
}
/** 0 inside a triangle, else the distance to the nearest triangle edge. */
export function distanceToFloor(tris: number[][], x: number, z: number): number {
  let best = Infinity;
  for (const [ax, az, bx, bz, cx, cz] of tris) {
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
    if (l1 >= 0 && l2 >= 0 && l3 >= 0) return 0;
    for (const [px, pz, qx, qz] of [[ax, az, bx, bz], [bx, bz, cx, cz], [cx, cz, ax, az]]) {
      const vx = qx - px, vz = qz - pz, t = Math.max(0, Math.min(1, ((x - px) * vx + (z - pz) * vz) / (vx * vx + vz * vz || 1)));
      best = Math.min(best, Math.hypot(x - (px + t * vx), z - (pz + t * vz)));
    }
  }
  return best;
}

/** Names of the floor objects in the scene (room_N_1), in numeric order. */
export function floorCandidates(scene: THREE.Object3D): string[] {
  const out: string[] = [];
  scene.traverse((o) => { if (o.name && FLOOR_RE.test(o.name) && !out.includes(o.name)) out.push(o.name); });
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** The objects a floor3d entity row refers to: an id, a `<group>`, or a `*` pattern. */
function resolve(scene: THREE.Object3D, ref: string, groups: Record<string, string[]>, names: string[]): THREE.Object3D[] {
  const g = /^<(.+)>$/.exec(ref || '');
  let list: string[];
  if (g) list = groups[g[1]] || [];
  else if (ref && ref.indexOf('*') >= 0) {
    const re = new RegExp('^' + ref.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    list = names.filter((n) => re.test(n));
  } else list = [ref];
  return list.map((n) => scene.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
}

/** Rooms and the point-in-room test for a set of rooms, built once per model. */
export class RoomIndex {
  private tris: number[][][];
  private span: number;
  constructor(scene: THREE.Object3D, public rooms: Room[]) {
    this.tris = rooms.map((r) => (r.floors || []).flatMap((f) => floorTriangles(scene.getObjectByName(f))));
    const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
    this.span = Math.max(size.x, size.z) || 1;
  }
  /** The room whose floor the point (x, z) is on, or the nearest within `reach` of the plan's span. */
  roomAt(x: number, z: number, reach = 0.02): Room | undefined {
    let best = -1, bestDist = this.span * reach;
    this.tris.forEach((list, i) => {
      if (!list.length) return;
      const d = distanceToFloor(list, x, z);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best >= 0 ? this.rooms[best] : undefined;
  }
  /** Centre of a room's floor, world space. */
  centre(room: Room, scene: THREE.Object3D): THREE.Vector3 | null {
    const box = new THREE.Box3();
    (room.floors || []).forEach((f) => { const o = scene.getObjectByName(f); if (o) box.expandByObject(o); });
    return box.isEmpty() ? null : box.getCenter(new THREE.Vector3());
  }
}

/**
 * Propose rooms from the floor objects, named from the floor3d entities bound to each floor
 * (a `type3d: camera` or input_button on the floor is the room's button in most configurations),
 * each filled with the entities whose objects stand on it.
 */
export function suggestRooms(scene: THREE.Object3D, cardConfig: any, friendlyName: (id: string) => string, sensors = false): Room[] {
  const floors = floorCandidates(scene);
  const entities: any[] = (cardConfig?.entities || []).filter((e: any) => e && typeof e.entity === 'string' && typeof e.object_id === 'string');
  const groups: Record<string, string[]> = {};
  (cardConfig?.object_groups || []).forEach((g: any) => { groups[g.object_group] = (g.objects || []).map((o: any) => (typeof o === 'string' ? o : o.object_id)).filter(Boolean); });
  const names: string[] = [];
  scene.traverse((o) => { if (o.name) names.push(o.name); });
  const taken = new Set<string>();
  const rooms: Room[] = floors.map((f, i) => {
    const onFloor = entities.filter((e) => e.object_id === f);
    const bound = onFloor.find((e) => e.type3d === 'camera' || /^input_button\./.test(e.entity)) || onFloor[0];
    const name = cleanRoomName(bound ? friendlyName(bound.entity) : '') || `Room ${i + 1}`;
    const id = slug(name, taken); taken.add(id);
    return { id, name, icon: roomIcon(name), color: ROOM_PALETTE[i % ROOM_PALETTE.length], floors: [f], entities: [] };
  });
  const index = new RoomIndex(scene, rooms);
  for (const ent of entities) {
    const domain = ent.entity.split('.')[0];
    if (!CONTROL_DOMAINS.has(domain) && !(sensors && SENSOR_DOMAINS.has(domain))) continue;
    if (ent.type3d === 'camera' || ent.type3d === 'text' || ent.type3d === 'image') continue; // readouts and room buttons, not controls
    const objects = resolve(scene, ent.object_id, groups, names);
    if (!objects.length) continue;
    const box = new THREE.Box3(); objects.forEach((o) => box.expandByObject(o));
    const c = box.getCenter(new THREE.Vector3());
    const room = index.roomAt(c.x, c.z, 0.025);
    if (room && !room.entities!.some((e) => e.entity === ent.entity)) room.entities!.push({ entity: ent.entity });
  }
  return rooms;
}
