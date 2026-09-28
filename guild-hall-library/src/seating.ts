import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Mats } from './mats';
import { HALL, LIB, STAGE, DESK, BOARD, SPAWN, HALL_DOOR, V } from './site';

export type HallPreset = 'proscenium' | 'cabaret' | 'open';
export type LibPreset = 'table' | 'circle' | 'seminar';
export const HALL_PRESETS: { id: HallPreset; name: string; hint: string }[] = [
  { id: 'proscenium', name: 'Proscenium benches', hint: 'Curved velvet benches for 3 to 4, facing the stage' },
  { id: 'cabaret', name: 'Cabaret tables', hint: 'Small tables for mixers and workshops' },
  { id: 'open', name: 'Open floor', hint: 'No seating, for mingling and dancing' },
];
export const LIB_PRESETS: { id: LibPreset; name: string; hint: string }[] = [
  { id: 'table', name: 'Round table', hint: '15 seats around the Connect table' },
  { id: 'circle', name: 'Reading circle', hint: 'A wide circle for discussion' },
  { id: 'seminar', name: 'Seminar', hint: 'Rows facing the Library search shelf' },
];
export const HALL_MAX = 200, CHAIR_MAX = 120, LIB_MAX = 15;

export interface Seat { pos: THREE.Vector3; rotY: number; }
/** A curved bench: seat-centre radius around the stage centre, angular extent (0 = due south of the stage). */
export interface Bench { r: number; a0: number; a1: number; seats: number; }
interface Layout { seats: Seat[]; tables: THREE.Vector3[]; benches: Bench[]; }

const face = (p: THREE.Vector3, t: THREE.Vector3) => Math.atan2(t.x - p.x, t.z - p.z);
const d2 = (a: THREE.Vector3, x: number, z: number) => Math.hypot(a.x - x, a.z - z);
const onArc = (r: number, th: number) => V(STAGE.center.x + Math.sin(th) * r, 0, STAGE.center.z + Math.cos(th) * r);

function hallOk(p: THREE.Vector3, stageClear: number, wall = 1.3) {
  if (Math.hypot(p.x - HALL.center.x, p.z - HALL.center.z) > HALL.apothem - wall) return false;
  if (d2(STAGE.center, p.x, p.z) < stageClear) return false;
  if (d2(DESK.pos, p.x, p.z) < 3.0) return false;
  if (d2(BOARD.pos, p.x, p.z) < 2.0) return false;
  if (d2(SPAWN.pos, p.x, p.z) < 1.6) return false;
  if (p.x > HALL_DOOR.x - 5 && Math.abs(p.z - HALL_DOOR.z) < 1.9) return false; // doorway lane to the colonnade
  return true;
}

export function hallLayout(id: HallPreset): Layout {
  const seats: Seat[] = [], tables: THREE.Vector3[] = [], benches: Bench[] = [];
  const S = STAGE.center, clear = STAGE.r + 1.6;
  if (id === 'proscenium') {
    const SEAT = 0.56, GAP = 0.4, ALPHA = (82 * Math.PI) / 180;
    for (let row = 0; row < 12; row++) {
      const r = STAGE.r + 2.4 + row * 1.3;
      // aisles: centre, and one each side at about 38 degrees
      const c = 0.75 / r, sAng = 0.66, w = 0.65 / r;
      const segs: [number, number][] = [[-ALPHA, -sAng - w], [-sAng + w, -c], [c, sAng - w], [sAng + w, ALPHA]];
      for (const [s0, s1] of segs) {
        let a = s0;
        while (a < s1) {
          let placed = false;
          for (const n of [4, 3]) {
            const len = n * SEAT + 0.1, da = len / r;
            if (a + da > s1 + 1e-6 || seats.length + n > HALL_MAX) continue;
            const pts = [0, 0.5, 1].map(f => onArc(r, a + da * f));
            const ends = [onArc(r + 0.3, a), onArc(r + 0.3, a + da), onArc(r - 0.3, a), onArc(r - 0.3, a + da)];
            if (![...pts, ...ends].every(p => hallOk(p, clear))) continue;
            benches.push({ r, a0: a, a1: a + da, seats: n });
            for (let k = 0; k < n; k++) { const p = onArc(r, a + ((k + 0.5) / n) * da); seats.push({ pos: p, rotY: face(p, S) }); }
            a += da + GAP / r; placed = true; break;
          }
          if (!placed) a += 0.3 / r;
        }
      }
    }
  } else if (id === 'cabaret') {
    const sp = 2.5; const cands: THREE.Vector3[] = [];
    for (let gz = -7; gz <= 7; gz++) for (let gx = -7; gx <= 7; gx++) {
      const t = V(gx * sp + (gz % 2 ? sp / 2 : 0), 0, gz * sp * 0.9 + 0.4);
      if (Math.hypot(t.x, t.z) > HALL.apothem - 2.3 || d2(S, t.x, t.z) < clear + 1.0) continue;
      cands.push(t);
    }
    cands.sort((a, b) => d2(S, a.x, a.z) - d2(S, b.x, b.z));
    for (const t of cands) {
      const ring: Seat[] = [];
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; const p = V(t.x + Math.sin(a) * 0.92, 0, t.z + Math.cos(a) * 0.92); if (hallOk(p, clear)) ring.push({ pos: p, rotY: face(p, t) }); }
      if (ring.length < 4 || !hallOk(t, clear)) continue;
      if (seats.length + ring.length > CHAIR_MAX) break;
      tables.push(t); seats.push(...ring);
    }
  }
  return { seats: seats.slice(0, HALL_MAX), tables, benches };
}

export function libLayout(id: LibPreset): Layout {
  const seats: Seat[] = [], C = LIB.center;
  const at = (r: number, th: number) => V(C.x + Math.sin(th) * r, 0, C.z - Math.cos(th) * r);
  if (id === 'table') {
    for (let i = 0; i < 15; i++) { const p = at(2.35, (i / 15) * Math.PI * 2 + 0.2); seats.push({ pos: p, rotY: face(p, C) }); }
  } else if (id === 'circle') {
    for (let i = 0; i < 15; i++) { const th = Math.PI * 1.5 + 0.55 + (i / 14) * (Math.PI * 2 - 1.1); const p = at(LIB.apothem - 2.7, th); seats.push({ pos: p, rotY: face(p, C) }); }
  } else {
    const P = V(C.x + LIB.apothem - 0.4, 0, C.z);
    for (const [r, n] of [[2.5, 5], [3.2, 5], [3.9, 5]] as const) {
      const step = 0.9 / r;
      for (let i = 0; i < n; i++) { const phi = (i - (n - 1) / 2) * step; const p = V(P.x - Math.cos(phi) * r, 0, P.z + Math.sin(phi) * r); seats.push({ pos: p, rotY: face(p, P) }); }
    }
  }
  return { seats, tables: [], benches: [] };
}

/** Nouveau side chair (cabaret and Library). */
function chairGeometries() {
  const wood: THREE.BufferGeometry[] = [], vel: THREE.BufferGeometry[] = [], gold: THREE.BufferGeometry[] = [];
  const bx = (arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); arr.push(g); };
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.18, 0.18]) { const g = new THREE.CylinderGeometry(0.018, 0.024, 0.44, 8); g.translate(sx, 0.22, sz); wood.push(g); }
  bx(wood, 0.46, 0.05, 0.42, 0, 0.45, 0);
  bx(vel, 0.42, 0.05, 0.38, 0, 0.495, 0.01);
  for (const sx of [-0.2, 0.2]) bx(wood, 0.035, 0.55, 0.035, sx, 0.72, -0.2, -0.1);
  const back = new THREE.BoxGeometry(0.36, 0.34, 0.035); back.rotateX(-0.1); back.translate(0, 0.74, -0.205); vel.push(back);
  const crest = new THREE.TorusGeometry(0.2, 0.012, 6, 20, Math.PI); crest.rotateX(-0.1); crest.translate(0, 0.9, -0.22); gold.push(crest);
  const m = (a: THREE.BufferGeometry[]) => { const g = mergeGeometries(a.map(x => x.index ? x.toNonIndexed() : x)); a.forEach(x => x.dispose()); return g; };
  return { wood: m(wood), vel: m(vel), gold: m(gold) };
}

/** Ring sector around the stage centre, extruded downward from `top` by `depth`. */
function sector(r0: number, r1: number, a0: number, a1: number, top: number, depth: number, bevel = 0) {
  const sh = new THREE.Shape(); const n = Math.max(6, Math.ceil((a1 - a0) * r1 * 4));
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); const x = Math.sin(a) * r1, y = Math.cos(a) * r1; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / n); sh.lineTo(Math.sin(a) * r0, Math.cos(a) * r0); }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(Math.PI / 2); g.translate(STAGE.center.x, top - bevel, STAGE.center.z);
  return g.index ? g.toNonIndexed() : g;
}

/** Curved green-velvet benches whose arcs follow the stage curve: walnut base and back, gilt rail. Merged per material. */
function benchMeshes(m: Mats, benches: Bench[]) {
  const vel: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [], gold: THREE.BufferGeometry[] = [];
  for (const b of benches) {
    const { r, a0, a1 } = b;
    wood.push(sector(r - 0.27, r + 0.27, a0, a1, 0.42, 0.07));                 // seat board
    vel.push(sector(r - 0.25, r + 0.23, a0 + 0.02 / r, a1 - 0.02 / r, 0.52, 0.1, 0.025)); // cushion
    for (const f of [0.02, 0.5, 0.98]) { const a = a0 + (a1 - a0) * f; wood.push(sector(r - 0.22, r + 0.22, a - 0.05 / r, a + 0.05 / r, 0.35, 0.35)); } // supports
    wood.push(sector(r + 0.25, r + 0.31, a0, a1, 1.0, 0.58));                  // back
    vel.push(sector(r + 0.21, r + 0.25, a0 + 0.05 / r, a1 - 0.05 / r, 0.93, 0.36)); // back pad
    const rail: THREE.Vector3[] = []; for (let i = 0; i <= 16; i++) { const a = a0 + (a1 - a0) * (i / 16); rail.push(onArc(r + 0.28, a).setY(1.01)); }
    gold.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 32, 0.022, 6).toNonIndexed());
  }
  const out = new THREE.Group();
  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => { if (!geos.length) return; const g = mergeGeometries(geos.map(x => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k); x.clearGroups(); return x; })); geos.forEach(x => x.dispose()); if (g) out.add(new THREE.Mesh(g, mat)); };
  add(vel, m.velvet); add(wood, m.walnut); add(gold, m.gilt);
  return out;
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
  const chairs = make(CHAIR_MAX, 'hallChairs'), lib = make(LIB_MAX, 'libSeats');
  // invisible seat pads: one click target per hall seat, whatever the furniture
  const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 0.35, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }), HALL_MAX);
  pads.name = 'hallSeats'; pads.count = 0; pads.frustumCulled = false; group.add(pads);
  const tTop = new THREE.InstancedMesh(tableTop, m.labradorite, 40), tBase = new THREE.InstancedMesh(tableBase, m.walnut, 40), tRim = new THREE.InstancedMesh(tableRim, m.gilt, 40);
  for (const im of [tTop, tBase, tRim]) { im.count = 0; im.frustumCulled = false; group.add(im); }
  let benchGroup: THREE.Group | null = null;

  const preset = { hall: 'proscenium' as HallPreset, library: 'table' as LibPreset };
  const current = { hall: hallLayout(preset.hall), library: libLayout(preset.library) };
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const apply = (set: ReturnType<typeof make>, seats: Seat[]) => {
    seats.forEach((s, i) => { mtx.compose(s.pos, q.setFromAxisAngle(up, s.rotY), one); for (const im of [set.wood, set.vel, set.gold]) im.setMatrixAt(i, mtx); });
    for (const im of [set.wood, set.vel, set.gold]) { im.count = seats.length; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  };
  const applyHall = (L: Layout) => {
    apply(chairs, preset.hall === 'cabaret' ? L.seats : []);
    L.seats.forEach((s, i) => { mtx.compose(s.pos, q.setFromAxisAngle(up, s.rotY), one); pads.setMatrixAt(i, mtx); });
    pads.count = L.seats.length; pads.instanceMatrix.needsUpdate = true; pads.computeBoundingSphere();
    L.tables.forEach((t, i) => { mtx.compose(t, q.identity(), one); tTop.setMatrixAt(i, mtx); tBase.setMatrixAt(i, mtx); tRim.setMatrixAt(i, mtx); });
    for (const im of [tTop, tBase, tRim]) { im.count = L.tables.length; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    if (benchGroup) { benchGroup.removeFromParent(); benchGroup.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
    benchGroup = L.benches.length ? benchMeshes(m, L.benches) : null;
    if (benchGroup) group.add(benchGroup);
  };
  applyHall(current.hall); apply(lib, current.library.seats);

  const api: Seating = {
    group,
    hitMeshes: [pads, lib.vel, lib.wood],
    seats: z => current[z].seats,
    preset,
    onChange: null,
    setPreset(zone, id) {
      if (zone === 'hall') { if (!HALL_PRESETS.some(p => p.id === id)) return; preset.hall = id as HallPreset; current.hall = hallLayout(preset.hall); applyHall(current.hall); }
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
