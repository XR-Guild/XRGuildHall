import * as THREE from 'three';
import type { Mats } from './mats';
import * as T from './tex';

export const SIDES = 12;
export const APOTHEM = 9;
export const WALL_H = 8.1;
export const HALF_W = APOTHEM * Math.tan(Math.PI / SIDES);
export const CORNER_R = APOTHEM / Math.cos(Math.PI / SIDES);
export const DOME_BASE = WALL_H;

export type BayKind = 'arch' | 'door' | 'window' | 'shelf';
export const BAYS: BayKind[] = ['arch', 'shelf', 'window', 'window', 'window', 'shelf', 'door', 'shelf', 'window', 'window', 'window', 'shelf'];

/** Compass helper: θ=0 north (-z), θ=π/2 east (+x). */
export const dir = (th: number) => new THREE.Vector3(Math.sin(th), 0, -Math.cos(th));

function archOutline(b: number, spring: number, rise: number, base: number, n = 28) {
  // Closed opening: bottom-left → up → semi-elliptic head → down → bottom-right
  const pts: THREE.Vector2[] = [];
  pts.push(new THREE.Vector2(-b, base));
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    pts.push(new THREE.Vector2(b * Math.cos(a), spring + rise * Math.sin(a)));
  }
  pts.push(new THREE.Vector2(b, base));
  return pts;
}

function lathe(profile: [number, number][], mat: THREE.Material, seg = 32) {
  return new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
}

export interface Built {
  group: THREE.Group;
  colliders: THREE.Group;
  floor: THREE.Mesh;
  lights: THREE.PointLight[];
  glows: THREE.Sprite[];
  bookcases: THREE.Group[];
  domeMat: THREE.Material;
}

export function buildRotunda(m: Mats, fontsReady: string): Built {
  const group = new THREE.Group(); group.name = 'Rotunda';
  const colliders = new THREE.Group(); colliders.name = 'RotundaColliders';
  const lights: THREE.PointLight[] = [];
  const glows: THREE.Sprite[] = [];
  const bookcases: THREE.Group[] = [];
  const warmGlow = T.glow('255,214,150');

  m.wall.map!.repeat.set(0.62, 0.62);

  // ---------- floor ----------
  const floorGeo = new THREE.CircleGeometry(CORNER_R + 0.02, SIDES, Math.PI / 2 - Math.PI / SIDES);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, m.floor);
  floor.name = 'Floor';
  floor.renderOrder = 1;
  group.add(floor);
  const floorCol = new THREE.Mesh(new THREE.BoxGeometry(CORNER_R * 2, 0.2, CORNER_R * 2), new THREE.MeshBasicMaterial());
  floorCol.position.y = -0.1; colliders.add(floorCol);

  // ---------- bays ----------
  const D = 0.5;
  const extMat = m.stoneExt.clone(); extMat.side = THREE.BackSide;
  for (let k = 0; k < SIDES; k++) {
    const th = (k / SIDES) * Math.PI * 2;
    const kind = BAYS[k];
    const bay = new THREE.Group();
    bay.position.copy(dir(th).multiplyScalar(APOTHEM));
    bay.rotation.y = -th;
    group.add(bay);

    const shape = new THREE.Shape();
    let opening: THREE.Vector2[] | null = null;
    if (kind === 'arch' || kind === 'door') {
      const b = kind === 'arch' ? 2.0 : 1.4, spring = kind === 'arch' ? 4.6 : 3.4, rise = kind === 'arch' ? 1.9 : 1.3;
      opening = archOutline(b, spring, rise, 0);
      shape.moveTo(-HALF_W, 0);
      opening.forEach(p => shape.lineTo(p.x, p.y));
      shape.lineTo(HALF_W, 0); shape.lineTo(HALF_W, WALL_H); shape.lineTo(-HALF_W, WALL_H); shape.closePath();
    } else {
      shape.moveTo(-HALF_W, 0); shape.lineTo(HALF_W, 0); shape.lineTo(HALF_W, WALL_H); shape.lineTo(-HALF_W, WALL_H); shape.closePath();
      if (kind === 'window') {
        opening = archOutline(1.15, 4.3, 1.3, 0.55);
        const hole = new THREE.Path(); opening.forEach((p, i) => (i ? hole.lineTo(p.x, p.y) : hole.moveTo(p.x, p.y))); hole.closePath();
        shape.holes.push(hole);
      }
    }
    const wg = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 24 });
    wg.translate(0, 0, -D);
    const wall = new THREE.Mesh(wg, [m.wall, m.reveal]);
    bay.add(wall);
    const ext = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), extMat);
    ext.position.z = -D - 0.01; bay.add(ext);

    // collider (skip openings)
    if (kind === 'window' || kind === 'shelf') {
      const wc = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 + 0.3, 3, 0.6), new THREE.MeshBasicMaterial());
      wc.position.copy(dir(th).multiplyScalar(APOTHEM + 0.3)).setY(1.5); wc.rotation.y = -th;
      colliders.add(wc);
    } else {
      // side jambs for arch / door
      const b = kind === 'arch' ? 2.0 : 1.4; const jw = HALF_W - b + 0.3;
      for (const s of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(jw, 3, 0.6), new THREE.MeshBasicMaterial());
        const local = new THREE.Vector3(s * (b + jw / 2 - 0.15), 1.5, -0.3);
        c.position.copy(local.applyAxisAngle(new THREE.Vector3(0, 1, 0), -th).add(bay.position));
        c.rotation.y = -th; colliders.add(c);
      }
    }

    // gilt moulding around openings
    if (opening) {
      const pts = opening.slice(1, -1).map(p => new THREE.Vector3(p.x, p.y, 0.03));
      if (kind === 'window') { pts.unshift(new THREE.Vector3(-1.15, 0.55, 0.03)); pts.push(new THREE.Vector3(1.15, 0.55, 0.03)); }
      else { pts.unshift(new THREE.Vector3(opening[0].x, 0, 0.03)); pts.push(new THREE.Vector3(opening[opening.length - 1].x, 0, 0.03)); }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      bay.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.055, 8, false), m.gilt));
      const outer = pts.map(p => new THREE.Vector3(p.x * 1.12, p.y > 0.6 ? (p.y - (kind === 'window' ? 0.55 : 0)) * 1.07 + (kind === 'window' ? 0.55 : 0) : p.y, 0.05));
      bay.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outer, false, 'centripetal'), 96, 0.03, 6, false), m.giltSatin));
    }

    if (kind === 'window') buildWindow(bay, m);
    if (kind === 'shelf') bookcases.push(buildBookcase(bay, m));
    if (kind === 'door') buildDoorLeaves(bay, m);
  }

  // ---------- columns at corners ----------
  for (let k = 0; k < SIDES; k++) {
    const th = ((k + 0.5) / SIDES) * Math.PI * 2;
    const col = new THREE.Group();
    col.position.copy(dir(th).multiplyScalar(CORNER_R - 0.55));
    group.add(col);
    const base = lathe([[0, 0], [0.55, 0], [0.55, 0.28], [0.5, 0.3], [0.5, 0.36], [0.42, 0.42], [0.46, 0.48], [0.36, 0.56], [0.33, 0.62], [0, 0.62]], m.gilt);
    col.add(base);
    const shaftGeo = new THREE.CylinderGeometry(0.3, 0.33, 5.9, 40, 1, true);
    const shaft = new THREE.Mesh(shaftGeo, m.labradoriteDark);
    shaft.position.y = 0.62 + 2.95; col.add(shaft);
    // gilt collar rings
    for (const y of [1.4, 4.9]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.025, 8, 40), m.gilt); r.rotation.x = Math.PI / 2; r.position.y = y; col.add(r); }
    // lily capital
    const cap = lathe([[0.3, 0], [0.36, 0.12], [0.44, 0.35], [0.56, 0.6], [0.68, 0.78], [0.72, 0.86], [0, 0.86]], m.gilt, 40);
    cap.position.y = 6.5; col.add(cap);
    for (let p = 0; p < 6; p++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), m.gilt);
      leaf.scale.set(0.9, 3.2, 0.45);
      const a = (p / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.43, 6.78, Math.sin(a) * 0.43);
      leaf.rotation.set(0, -a, 0); leaf.rotateZ(0.5);
      col.add(leaf);
    }
    const abacus = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 1.25), m.giltSatin);
    abacus.position.y = 7.43; abacus.rotation.y = -th; col.add(abacus);
    const cc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3, 12), new THREE.MeshBasicMaterial());
    cc.position.copy(col.position).setY(1.5); colliders.add(cc);

    // sconces on alternate columns, facing inward
    if (k % 2 === 0) {
      const inward = dir(th).multiplyScalar(-1);
      const sc = new THREE.Group();
      sc.position.copy(col.position).addScaledVector(inward, 0.33).setY(2.7);
      sc.lookAt(sc.position.clone().add(inward));
      const arm = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 8, 24, Math.PI), m.gilt);
      arm.rotation.y = Math.PI / 2; arm.position.set(0, 0.0, 0.18); sc.add(arm);
      const tulip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), m.emissiveWarm);
      tulip.scale.set(1, 1.4, 1); tulip.position.set(0, 0.2, 0.36); sc.add(tulip);
      const cup = lathe([[0.02, 0], [0.06, 0.02], [0.11, 0.09], [0, 0.09]], m.gilt, 20); cup.position.set(0, 0.1, 0.36); sc.add(cup);
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: warmGlow, color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
      g.scale.setScalar(1.2); g.position.set(0, 0.25, 0.38); sc.add(g); glows.push(g);
      group.add(sc);
    }
  }

  // ---------- frieze + cornice ----------
  const frz = T.frieze(fontsReady);
  const frGeo = new THREE.BufferGeometry();
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const y0 = 7.5, y1 = 8.25, ap = APOTHEM - 0.08, cr = ap / Math.cos(Math.PI / SIDES);
  for (let i = 0; i <= SIDES; i++) {
    const th = ((i + 0.5) / SIDES) * Math.PI * 2;
    const d = dir(th).multiplyScalar(cr);
    pos.push(d.x, y0, d.z, d.x, y1, d.z);
    const u = (i / SIDES) * 2; // phrases repeat twice around
    uv.push(u, 0, u, 1);
    if (i < SIDES) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  frGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  frGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  frGeo.setIndex(idx); frGeo.computeVertexNormals();
  const frMat = new THREE.MeshStandardMaterial({ map: frz, emissiveMap: frz, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(frGeo, frMat));
  // cornice mouldings (polygon tubes)
  const polyTube = (apo: number, y: number, r: number, mat: THREE.Material) => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    const c = apo / Math.cos(Math.PI / SIDES);
    for (let i = 0; i < SIDES; i++) {
      const a = dir(((i + 0.5) / SIDES) * Math.PI * 2).multiplyScalar(c).setY(y);
      const b = dir(((i + 1.5) / SIDES) * Math.PI * 2).multiplyScalar(c).setY(y);
      path.add(new THREE.LineCurve3(a, b));
    }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(path as any, SIDES * 2, r, 10, true), mat));
  };
  polyTube(APOTHEM - 0.12, 7.47, 0.07, m.gilt);
  polyTube(APOTHEM - 0.12, 8.28, 0.09, m.gilt);
  polyTube(APOTHEM - 0.2, 8.42, 0.06, m.giltSatin);

  // ---------- dome ----------
  const oculus = 0.17;
  const domeR = CORNER_R + 0.05, domeS = 0.62;
  const mural = T.domeMural();
  const domeGeo = new THREE.SphereGeometry(domeR, 96, 40, 0, Math.PI * 2, oculus, Math.PI / 2 - oculus);
  const domeMat = new THREE.MeshStandardMaterial({ map: mural, emissiveMap: mural, emissive: 0xffffff, emissiveIntensity: 0.42, roughness: 0.7, side: THREE.BackSide });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.scale.y = domeS; dome.position.y = DOME_BASE + 0.25;
  group.add(dome);
  // ribs
  for (let k = 0; k < SIDES; k++) {
    const th = ((k + 0.5) / SIDES) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const phi = oculus + (i / 24) * (Math.PI / 2 - oculus);
      const r = (domeR - 0.08) * Math.sin(phi), y = DOME_BASE + 0.25 + (domeR - 0.08) * Math.cos(phi) * domeS;
      pts.push(dir(th).multiplyScalar(r).setY(y));
    }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.06, 8), m.gilt));
  }
  const ocR = domeR * Math.sin(oculus), ocY = DOME_BASE + 0.25 + domeR * Math.cos(oculus) * domeS;
  const ocRing = new THREE.Mesh(new THREE.TorusGeometry(ocR, 0.12, 12, 64), m.gilt); ocRing.rotation.x = Math.PI / 2; ocRing.position.y = ocY; group.add(ocRing);
  const ocGlass = new THREE.Mesh(new THREE.CircleGeometry(ocR, 48), m.glass); ocGlass.rotation.x = Math.PI / 2; ocGlass.position.y = ocY + 0.05; group.add(ocGlass);
  const springRing = new THREE.Mesh(new THREE.TorusGeometry(domeR - 0.1, 0.1, 10, 96), m.gilt); springRing.rotation.x = Math.PI / 2; springRing.position.y = DOME_BASE + 0.3; group.add(springRing);

  // exterior dome + drum
  const extDome = new THREE.Mesh(new THREE.SphereGeometry(domeR + 0.6, 64, 24, 0, Math.PI * 2, oculus * 0.95, Math.PI / 2 - oculus * 0.95), m.patina);
  extDome.scale.y = 0.66; extDome.position.y = DOME_BASE + 0.2; group.add(extDome);
  for (let k = 0; k < SIDES; k++) {
    const th = ((k + 0.5) / SIDES) * Math.PI * 2; const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) { const phi = oculus + (i / 16) * (Math.PI / 2 - oculus); pts.push(dir(th).multiplyScalar((domeR + 0.63) * Math.sin(phi)).setY(DOME_BASE + 0.2 + (domeR + 0.63) * Math.cos(phi) * 0.66)); }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.07, 6), m.giltSatin));
  }
  const lantern = new THREE.Group(); lantern.position.y = DOME_BASE + 0.2 + (domeR + 0.6) * Math.cos(oculus) * 0.66;
  const lg = new THREE.Mesh(new THREE.CylinderGeometry(ocR + 0.1, ocR + 0.2, 1.1, 24, 1, true), m.glass); lg.position.y = 0.5; lantern.add(lg);
  const lc = lathe([[ocR + 0.35, 0], [ocR + 0.1, 0.25], [0.5, 0.7], [0.12, 1.2], [0.05, 1.8], [0, 1.8]], m.gilt); lc.position.y = 1.05; lantern.add(lc);
  group.add(lantern);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(CORNER_R + 0.55, CORNER_R + 0.55, 0.9, SIDES, 1, true, -Math.PI / SIDES), m.stoneExt);
  drum.position.y = WALL_H + 0.25; group.add(drum);

  // ---------- chandelier ----------
  const ch = new THREE.Group(); ch.position.y = 6.3; group.add(ch);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.045, 10, 96), m.gilt); ring.rotation.x = Math.PI / 2; ch.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.03, 8, 72), m.gilt); ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.35; ch.add(ring2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p, p.clone().multiplyScalar(1.12).setY(-0.25), p.clone().multiplyScalar(1.05).setY(-0.42)), 12, 0.012, 6), m.gilt); ch.add(stem);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), m.emissiveWarm);
    bulb.scale.y = 1.5; bulb.position.copy(p).multiplyScalar(1.05).setY(-0.5); ch.add(bulb);
    const shade = lathe([[0.02, 0], [0.09, -0.06], [0.12, -0.16], [0.02, -0.02]], m.giltSatin, 16); shade.position.copy(bulb.position).setY(-0.38); ch.add(shade);
    // spokes
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.35, 6), m.gilt); sp.rotation.z = Math.PI / 2; sp.rotation.y = -a; sp.position.set(Math.cos(a) * 0.67, 0, Math.sin(a) * 0.67); ch.add(sp);
  }
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), m.labradorite); crystal.scale.y = 1.8; crystal.position.y = -0.2; ch.add(crystal);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const top = new THREE.Vector3(Math.cos(a) * ocR * 0.9, ocY - 6.3, Math.sin(a) * ocR * 0.9);
    const bot = new THREE.Vector3(Math.cos(a) * 0.9, 0.35, Math.sin(a) * 0.9);
    const len = top.distanceTo(bot);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 6), m.giltSatin);
    chain.position.copy(top).add(bot).multiplyScalar(0.5); chain.lookAt(top); chain.rotateX(Math.PI / 2); ch.add(chain);
  }
  const chGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: warmGlow, color: 0xffc98a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
  chGlow.scale.setScalar(4.2); chGlow.position.y = -0.45; ch.add(chGlow); glows.push(chGlow);
  const chLight = new THREE.PointLight(0xffc88a, 70, 0, 2); chLight.position.y = -0.6; ch.add(chLight); lights.push(chLight);

  // wall fill lights (warm) at three points
  for (let i = 0; i < 3; i++) {
    const th = (i / 3) * Math.PI * 2 + Math.PI / 3;
    const l = new THREE.PointLight(0xffb870, 18, 14, 2);
    l.position.copy(dir(th).multiplyScalar(6.8)).setY(3.2); group.add(l); lights.push(l);
  }

  return { group, colliders, floor, lights, glows, bookcases, domeMat };
}

function buildWindow(bay: THREE.Group, m: Mats) {
  const opening = archOutline(1.15, 4.3, 1.3, 0.55);
  const s = new THREE.Shape(opening);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(s, 24), m.glass);
  glass.position.z = -0.25; glass.renderOrder = 5; bay.add(glass);
  // mullion + transom + tracery
  const mull = new THREE.Mesh(new THREE.BoxGeometry(0.06, 4.35, 0.08), m.giltSatin); mull.position.set(0, 0.55 + 2.17, -0.22); bay.add(mull);
  const tr = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.05, 0.08), m.giltSatin); tr.position.set(0, 4.3, -0.22); bay.add(tr);
  const rose = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 48), m.gilt); rose.position.set(0, 4.95, -0.2); bay.add(rose);
  const rose2 = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 36), m.gilt); rose2.position.set(0, 4.95, -0.2); bay.add(rose2);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pet = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 20), m.gilt); pet.position.set(Math.cos(a) * 0.31, 4.95 + Math.sin(a) * 0.31, -0.2); bay.add(pet); }
  for (const sgn of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(sgn * 0.03, 4.3, -0.2), new THREE.Vector3(sgn * 0.5, 4.5, -0.2), new THREE.Vector3(sgn * 0.9, 4.35, -0.2), new THREE.Vector3(sgn * 1.02, 4.75, -0.2), new THREE.Vector3(sgn * 0.62, 5.25, -0.2)]);
    bay.add(new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.022, 6), m.gilt));
    for (let j = 1; j < 4; j++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.04), m.giltSatin); bar.position.set(sgn * 0.58, 0.55 + j * 0.95, -0.22); bay.add(bar); }
  }
  // window seat with velvet cushion
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 0.62), m.walnut); seat.position.set(0, 0.25, 0.22); bay.add(seat);
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.1, 0.55), m.velvet); cushion.position.set(0, 0.55, 0.22); bay.add(cushion);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 0.66), m.marble); sill.position.set(0, 0.52, -0.2); bay.add(sill);
}

function buildDoorLeaves(bay: THREE.Group, m: Mats) {
  // glazed doors swung open onto the terrace
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.position.set(s * 1.38, 0, -0.5);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.36, 3.3, 0.06), m.giltSatin);
    frame.position.set(-s * 0.68, 1.65, 0); leaf.add(frame);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.1), m.glass); g.position.set(-s * 0.68, 1.65, 0.035); leaf.add(g);
    leaf.rotation.y = s * 1.95;
    bay.add(leaf);
  }
  const step = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 1.4), m.marble); step.position.set(0, 0.0, -0.6); bay.add(step);
}

function buildBookcase(bay: THREE.Group, m: Mats) {
  const bc = new THREE.Group(); bc.position.z = 0.02; bay.add(bc);
  const W = 3.5, H = 5.8, Dp = 0.46;
  const outline = new THREE.Shape();
  outline.moveTo(-W / 2, 0); outline.lineTo(W / 2, 0); outline.lineTo(W / 2, H - 0.9);
  outline.absellipse(0, H - 0.9, W / 2, 0.9, 0, Math.PI, false); outline.lineTo(-W / 2, 0);
  const back = new THREE.Mesh(new THREE.ShapeGeometry(outline, 24), m.walnutDark); back.position.z = 0.01; bc.add(back);
  // sides
  for (const s of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, H - 0.9, Dp), m.walnut); side.position.set(s * (W / 2 - 0.04), (H - 0.9) / 2, Dp / 2); bc.add(side); }
  const archPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI; archPts.push(new THREE.Vector3(Math.cos(a) * (W / 2), H - 0.9 + Math.sin(a) * 0.9, Dp)); }
  bc.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPts), 64, 0.05, 8), m.gilt));
  const shelves = 7;
  const bookGeo = new THREE.BoxGeometry(1, 1, 1);
  const count = shelves * 40;
  const books = new THREE.InstancedMesh(bookGeo, m.leather, count);
  const palette = ['#5a1d1b', '#23402f', '#1d2c4a', '#8a6a2d', '#2b1a12', '#6b4a2e', '#3d2a4a', '#a0864f', '#16211d', '#7a2e22'].map(c => new THREE.Color(c));
  const mtx = new THREE.Matrix4(); const q = new THREE.Quaternion(); let n = 0;
  for (let s = 0; s < shelves; s++) {
    const y = 0.35 + s * 0.66;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.16, 0.04, Dp - 0.04), m.walnut); shelf.position.set(0, y, Dp / 2); bc.add(shelf);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W - 0.16, 0.035, 0.02), m.giltSatin); lip.position.set(0, y + 0.005, Dp - 0.01); bc.add(lip);
    if (s === shelves - 1) break;
    let x = -W / 2 + 0.14;
    while (x < W / 2 - 0.2 && n < count) {
      const th = 0.028 + T.rand() * 0.05, h = 0.3 + T.rand() * 0.22, d = 0.22 + T.rand() * 0.1;
      if (T.rand() < 0.05) { x += 0.15; continue; }
      const lean = T.rand() < 0.06 ? 0.25 : 0;
      q.setFromEuler(new THREE.Euler(0, 0, lean));
      mtx.compose(new THREE.Vector3(x + th / 2, y + 0.02 + h / 2, 0.16 + d / 2 - 0.05), q, new THREE.Vector3(th, h, d));
      books.setMatrixAt(n, mtx); books.setColorAt(n, palette[Math.floor(T.rand() * palette.length)]); n++;
      x += th + 0.003 + (lean ? 0.08 : 0);
    }
  }
  books.count = n; books.instanceMatrix.needsUpdate = true; if (books.instanceColor) books.instanceColor.needsUpdate = true;
  bc.add(books);
  return bc;
}
