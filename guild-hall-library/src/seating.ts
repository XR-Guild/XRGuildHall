import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Mats } from './mats';
import { HALL, LIB, STAGE, DESK, BOARD, SPAWN, HALL_DOOR, V } from './site';

export type HallPreset = 'theater' | 'round' | 'cabaret';
export type LibPreset = 'table' | 'circle' | 'seminar';
export const HALL_PRESETS: { id: HallPreset; name: string; hint: string }[] = [
  { id: 'theater', name: 'Theater rows', hint: 'Curved rows facing the stage' },
  { id: 'round', name: 'In the round', hint: 'Rings of seats around the stage' },
  { id: 'cabaret', name: 'Cabaret tables', hint: 'Small tables for mixers and workshops' },
];
export const LIB_PRESETS: { id: LibPreset; name: string; hint: string }[] = [
  { id: 'table', name: 'Round table', hint: '15 seats around the Connect table' },
  { id: 'circle', name: 'Reading circle', hint: 'A wide circle for discussion' },
  { id: 'seminar', name: 'Seminar', hint: 'Rows facing the Library search shelf' },
];
export const HALL_MAX = 110, LIB_MAX = 15;

export interface Seat { pos: THREE.Vector3; rotY: number; }
interface Layout { seats: Seat[]; tables: THREE.Vector3[]; }

const face = (p: THREE.Vector3, t: THREE.Vector3) => Math.atan2(t.x - p.x, t.z - p.z);
const d2 = (a: THREE.Vector3, x: number, z: number) => Math.hypot(a.x - x, a.z - z);

function hallOk(p: THREE.Vector3, stageClear: number) {
  if (Math.hypot(p.x - HALL.center.x, p.z - HALL.center.z) > HALL.apothem - 1.25) return false;
  if (d2(STAGE.center, p.x, p.z) < stageClear) return false;
  if (d2(DESK.pos, p.x, p.z) < 2.4) return false;
  if (d2(BOARD.pos, p.x, p.z) < 1.5) return false;
  if (d2(SPAWN.pos, p.x, p.z) < 1.1) return false;
  if (p.x > HALL_DOOR.x - 4.2 && Math.abs(p.z - HALL_DOOR.z) < 1.5) return false; // keep the doorway lane clear
  return true;
}

export function hallLayout(id: HallPreset): Layout {
  const seats: Seat[] = [], tables: THREE.Vector3[] = [];
  const S = STAGE.center, clear = STAGE.r + 1.35;
  if (id === 'theater') {
    for (let row = 0; row < 10 && seats.length < HALL_MAX; row++) {
      const r = clear + 0.35 + row * 0.95;
      const n = Math.floor((r * Math.PI * 1.3) / 0.64);
      for (let i = 0; i <= n; i++) {
        const th = -Math.PI * 0.65 + (i / n) * Math.PI * 1.3; // centred on due south of the stage
        const p = V(S.x + Math.sin(th) * r, 0, S.z + Math.cos(th) * r);
        if (Math.abs(p.x - S.x) < 0.55) continue; // centre aisle
        if (!hallOk(p, clear)) continue;
        seats.push({ pos: p, rotY: face(p, S) });
      }
    }
  } else if (id === 'round') {
    for (let ring = 0; ring < 6 && seats.length < HALL_MAX; ring++) {
      const r = clear + 0.2 + ring * 1.0;
      const n = Math.floor((2 * Math.PI * r) / 0.66);
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2;
        if ([0, 1, 2, 3].some(k => Math.abs(Math.atan2(Math.sin(th - k * Math.PI / 2), Math.cos(th - k * Math.PI / 2))) < 0.45 / r)) continue; // 4 radial aisles
        const p = V(S.x + Math.sin(th) * r, 0, S.z + Math.cos(th) * r);
        if (!hallOk(p, clear)) continue;
        seats.push({ pos: p, rotY: face(p, S) });
      }
    }
  } else {
    // cabaret: round tables of up to 6 on a staggered grid; a table keeps any seats that fit (at least 4)
    const sp = 2.35;
    const cands: THREE.Vector3[] = [];
    for (let gz = -4; gz <= 4; gz++) for (let gx = -4; gx <= 4; gx++) {
      const t = V(gx * sp + (gz % 2 ? sp / 2 : 0), 0, gz * sp * 0.9 + 0.4);
      if (Math.hypot(t.x, t.z) > HALL.apothem - 1.9 || d2(S, t.x, t.z) < clear + 1.0) continue;
      cands.push(t);
    }
    cands.sort((a, b) => d2(S, a.x, a.z) - d2(S, b.x, b.z)); // fill from the stage outwards
    for (const t of cands) {
      const ring: Seat[] = [];
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; const p = V(t.x + Math.sin(a) * 0.92, 0, t.z + Math.cos(a) * 0.92); if (hallOk(p, clear)) ring.push({ pos: p, rotY: face(p, t) }); }
      if (ring.length < 4 || !hallOk(t, clear) && d2(DESK.pos, t.x, t.z) < 2.4) continue;
      if (seats.length + ring.length > HALL_MAX) break;
      tables.push(t); seats.push(...ring);
    }
  }
  return { seats: seats.slice(0, HALL_MAX), tables };
}

export function libLayout(id: LibPreset): Layout {
  const seats: Seat[] = [], C = LIB.center;
  const at = (r: number, th: number) => V(C.x + Math.sin(th) * r, 0, C.z - Math.cos(th) * r); // th: 0 north, +π/2 east
  if (id === 'table') {
    for (let i = 0; i < 15; i++) { const p = at(2.35, (i / 15) * Math.PI * 2 + 0.2); seats.push({ pos: p, rotY: face(p, C) }); }
  } else if (id === 'circle') {
    // leave the west doorway open
    for (let i = 0; i < 15; i++) { const th = Math.PI * 1.5 + 0.55 + (i / 14) * (Math.PI * 2 - 1.1); const p = at(LIB.apothem - 2.7, th); seats.push({ pos: p, rotY: face(p, C) }); }
  } else {
    const P = V(C.x + LIB.apothem - 0.4, 0, C.z); // the Library search shelf (east bay)
    for (const [r, n] of [[2.5, 5], [3.2, 5], [3.9, 5]] as const) {
      const step = 0.9 / r;
      for (let i = 0; i < n; i++) { const phi = (i - (n - 1) / 2) * step; const p = V(P.x - Math.cos(phi) * r, 0, P.z + Math.sin(phi) * r); seats.push({ pos: p, rotY: face(p, P) }); }
    }
  }
  return { seats, tables: [] };
}

/** Nouveau side chair: walnut frame, green velvet seat and back pad, gilt crest. Built once, drawn instanced. */
function chairGeometries() {
  const wood: THREE.BufferGeometry[] = [], vel: THREE.BufferGeometry[] = [], gold: THREE.BufferGeometry[] = [];
  const bx = (arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); arr.push(g); };
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.18, 0.18]) { const g = new THREE.CylinderGeometry(0.018, 0.024, 0.44, 8); g.translate(sx, 0.22, sz); wood.push(g); }
  bx(wood, 0.46, 0.05, 0.42, 0, 0.45, 0);
  bx(vel, 0.42, 0.05, 0.38, 0, 0.495, 0.01);
  // back: two uprights and a pad, slightly raked
  for (const sx of [-0.2, 0.2]) bx(wood, 0.035, 0.55, 0.035, sx, 0.72, -0.2, -0.1);
  const back = new THREE.BoxGeometry(0.36, 0.34, 0.035); back.rotateX(-0.1); back.translate(0, 0.74, -0.205); vel.push(back);
  const crest = new THREE.TorusGeometry(0.2, 0.012, 6, 20, Math.PI); crest.rotateX(-0.1); crest.translate(0, 0.9, -0.22); gold.push(crest);
  const m = (a: THREE.BufferGeometry[]) => { const g = mergeGeometries(a.map(x => x.index ? x.toNonIndexed() : x)); a.forEach(x => x.dispose()); return g; };
  return { wood: m(wood), vel: m(vel), gold: m(gold) };
}

export interface Seating {
  group: THREE.Group;
  hitMeshes: THREE.InstancedMesh[];
  seats: (zone: 'hall' | 'library') => Seat[];
  preset: { hall: HallPreset; library: LibPreset };
  setPreset: (zone: 'hall' | 'library', id: string) => void;
  seatFromHit: (hit: THREE.Intersection) => { zone: 'hall' | 'library'; index: number } | null;
  onChange: ((zone: 'hall' | 'library', id: string) => void) | null;
}

export function buildSeating(m: Mats): Seating {
  const group = new THREE.Group(); group.name = 'Seating'; group.userData.keep = true;
  const g = chairGeometries();
  const tableTop = new THREE.CylinderGeometry(0.5, 0.5, 0.04, 32); tableTop.translate(0, 0.74, 0);
  const tableBase = mergeGeometries([new THREE.CylinderGeometry(0.05, 0.07, 0.72, 10).translate(0, 0.36, 0).toNonIndexed(), new THREE.CylinderGeometry(0.28, 0.3, 0.03, 20).translate(0, 0.015, 0).toNonIndexed()]);
  const tableRim = new THREE.TorusGeometry(0.5, 0.012, 6, 48); tableRim.rotateX(Math.PI / 2); tableRim.translate(0, 0.74, 0);
  const make = (max: number, name: string) => {
    const wood = new THREE.InstancedMesh(g.wood, m.walnut, max), vel = new THREE.InstancedMesh(g.vel, m.velvet, max), gold = new THREE.InstancedMesh(g.gold, m.gilt, max);
    for (const im of [wood, vel, gold]) { im.name = name; im.count = 0; im.frustumCulled = false; group.add(im); }
    return { wood, vel, gold };
  };
  const hall = make(HALL_MAX, 'hallSeats'), lib = make(LIB_MAX, 'libSeats');
  const tTop = new THREE.InstancedMesh(tableTop, m.labradorite, 24), tBase = new THREE.InstancedMesh(tableBase, m.walnut, 24), tRim = new THREE.InstancedMesh(tableRim, m.gilt, 24);
  for (const im of [tTop, tBase, tRim]) { im.count = 0; im.frustumCulled = false; group.add(im); }

  const current = { hall: hallLayout('theater'), library: libLayout('table') };
  const preset = { hall: 'theater' as HallPreset, library: 'table' as LibPreset };
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const apply = (set: ReturnType<typeof make>, seats: Seat[]) => {
    seats.forEach((s, i) => { mtx.compose(s.pos, q.setFromAxisAngle(up, s.rotY), one); for (const im of [set.wood, set.vel, set.gold]) im.setMatrixAt(i, mtx); });
    for (const im of [set.wood, set.vel, set.gold]) { im.count = seats.length; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  };
  const applyTables = (ts: THREE.Vector3[]) => {
    ts.forEach((t, i) => { mtx.compose(t, q.identity(), one); tTop.setMatrixAt(i, mtx); tBase.setMatrixAt(i, mtx); tRim.setMatrixAt(i, mtx); });
    for (const im of [tTop, tBase, tRim]) { im.count = ts.length; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  };
  apply(hall, current.hall.seats); apply(lib, current.library.seats); applyTables(current.hall.tables);

  const api: Seating = {
    group,
    hitMeshes: [hall.vel, hall.wood, lib.vel, lib.wood],
    seats: z => current[z].seats,
    preset,
    onChange: null,
    setPreset(zone, id) {
      if (zone === 'hall') { if (!HALL_PRESETS.some(p => p.id === id)) return; preset.hall = id as HallPreset; current.hall = hallLayout(preset.hall); apply(hall, current.hall.seats); applyTables(current.hall.tables); }
      else { if (!LIB_PRESETS.some(p => p.id === id)) return; preset.library = id as LibPreset; current.library = libLayout(preset.library); apply(lib, current.library.seats); }
      api.onChange?.(zone, id);
    },
    seatFromHit(hit) {
      if (hit.instanceId == null) return null;
      const zone = hit.object.name === 'hallSeats' ? 'hall' : hit.object.name === 'libSeats' ? 'library' : null;
      return zone ? { zone, index: hit.instanceId } : null;
    },
  };
  return api;
}
