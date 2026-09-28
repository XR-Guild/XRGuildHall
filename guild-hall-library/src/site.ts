import * as THREE from 'three';
import { dir } from './chamber';

/**
 * Site plan (world metres, +x east, -z north), following Evo's sketch:
 * Guild Hall 12-gon on the west, Library 12-gon to the north-east, an open labradorite
 * colonnade on a teal path between them, and a diagonal reflecting pool in the garden to the south.
 */
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const HALL = { center: V(0, 0, 0), apothem: 9, wallH: 8.1, doorBay: 3 };
export const LIB = { center: V(23, 0, -3.8), apothem: 6.5, wallH: 6.4, doorBay: 9 };

export const HALL_DOOR = dir((HALL.doorBay / 12) * Math.PI * 2).multiplyScalar(HALL.apothem).add(HALL.center);
export const LIB_DOOR = dir((LIB.doorBay / 12) * Math.PI * 2).multiplyScalar(LIB.apothem).add(LIB.center);

export const STAGE = { center: V(0, 0, -5.6), r: 2.6, h: 0.36 };
const deg = (d: number) => (d * Math.PI) / 180;
/** Welcome desk sits inside the east wall, just south of the door to the colonnade. */
export const DESK = { pos: dir(deg(114)).multiplyScalar(6.9), faceTo: V(0, 0, 0) };
/** Events and news board, beside the desk. */
export const BOARD = { pos: dir(deg(150)).multiplyScalar(7.7), faceTo: V(0, 0, 0) };
/** Arrival point: south-east interior, below the desk, looking across the hall. */
export const SPAWN = { pos: V(4.9, 0, 5.2), look: V(1.5, 1.4, -2.5) };

/** Wide pool running north-west to south-east, south of the colonnade (as drawn). */
export const POOL = { center: V(17.5, 0, 11.5), length: 12.5, width: 6.5, rotY: Math.atan2(0.84, 0.55) };
/** The big tree east of the pool, below the Library. */
export const BIG_TREE = V(28.8, 0, 8.8);
/** Benches: one lower-left of the pool, one upper-right. */
export const BENCHES = [V(8.6, 0, 14.4), V(24.2, 0, 5.4)];

export type Zone = 'hall' | 'library' | 'colonnade' | 'garden';
export function zoneOf(p: THREE.Vector3): Zone {
  const dh = Math.hypot(p.x - HALL.center.x, p.z - HALL.center.z);
  if (dh < HALL.apothem - 0.1) return 'hall';
  const dl = Math.hypot(p.x - LIB.center.x, p.z - LIB.center.z);
  if (dl < LIB.apothem - 0.1) return 'library';
  // colonnade corridor: close to the path polyline
  for (let i = 0; i < PATH_PTS.length - 1; i++) {
    const a = PATH_PTS[i], b = PATH_PTS[i + 1];
    const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
    if (a.clone().addScaledVector(ab, t).setY(p.y).distanceTo(p) < 2.2) return 'colonnade';
  }
  return 'garden';
}

/** S-curve from the hall's east door to the library's west door. */
export const PATH_CURVE = new THREE.CubicBezierCurve3(
  HALL_DOOR.clone().add(V(0.3, 0, 0)),
  HALL_DOOR.clone().add(V(3.2, 0, 1.4)),
  LIB_DOOR.clone().add(V(-3.2, 0, 0.2)),
  LIB_DOOR.clone().add(V(-0.3, 0, 0)),
);
export const PATH_PTS = PATH_CURVE.getSpacedPoints(24);
