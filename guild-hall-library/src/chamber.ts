import * as THREE from 'three';
import type { Mats } from './mats';
import * as T from './tex';

/** Compass helper in a chamber's local frame: θ=0 north (-z), θ=π/2 east (+x). */
export const dir = (th: number) => new THREE.Vector3(Math.sin(th), 0, -Math.cos(th));

export type BayKind = 'door' | 'window' | 'shelf' | 'panelShelf' | 'banner';

export interface ChamberOpts {
  name: string;
  center: THREE.Vector3;
  rotY?: number;
  apothem: number;
  wallH: number;
  bays: BayKind[]; // 12 entries, k=0 faces north (local)
  frieze?: boolean;
  friezeFont?: string;
  domeMural?: THREE.Texture;
  chandelier?: number; // scale, 0 = none
  fillLights?: number;
  floorMat: THREE.Material;
  sparseBooks?: number; // 0..1 fraction of shelf length filled
}

export interface Chamber {
  group: THREE.Group;
  colliders: THREE.Group;
  floor: THREE.Mesh;
  lights: THREE.PointLight[];
  glows: THREE.Sprite[];
  panelMounts: Map<number, THREE.Object3D>; // bay index → mount (panel faces +z)
  bannerMounts: Map<number, THREE.Object3D>;
  domeMat: THREE.MeshStandardMaterial;
  /** World-space position of a bay's inner face center. */
  bayWorld: (k: number, inset?: number) => THREE.Vector3;
  toWorld: (v: THREE.Vector3) => THREE.Vector3;
  radius: number;
}

const SIDES = 12;

/** Pointed (lancet) arch opening: closed polyline from bottom-left, up, over the point, down. */
export function pointedOutline(b: number, spring: number, base: number, n = 18) {
  const r = 1.5 * b;
  const t1 = Math.acos((b - r) / r);
  const pts: THREE.Vector2[] = [new THREE.Vector2(-b, base)];
  const cxL = -b + r;
  for (let i = 0; i <= n; i++) { const t = Math.PI - (i / n) * (Math.PI - t1); pts.push(new THREE.Vector2(cxL + r * Math.cos(t), spring + r * Math.sin(t))); }
  // right arc: mirror of the left arc, apex back down to the spring line (skip the shared apex point)
  for (let i = n - 1; i >= 0; i--) { const p = pts[1 + i]; pts.push(new THREE.Vector2(-p.x, p.y)); }
  pts.push(new THREE.Vector2(b, base));
  return pts;
}
export const pointedApex = (b: number, spring: number) => spring + 1.5 * b * Math.sin(Math.acos(-1 / 3));

function lathe(profile: [number, number][], mat: THREE.Material, seg = 32) {
  return new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
}

export function buildChamber(m: Mats, o: ChamberOpts): Chamber {
  const group = new THREE.Group(); group.name = o.name;
  group.position.copy(o.center); group.rotation.y = o.rotY ?? 0;
  const colliders = new THREE.Group(); colliders.name = o.name + 'Colliders';
  colliders.position.copy(o.center); colliders.rotation.y = o.rotY ?? 0;
  const lights: THREE.PointLight[] = [];
  const glows: THREE.Sprite[] = [];
  const panelMounts = new Map<number, THREE.Object3D>();
  const bannerMounts = new Map<number, THREE.Object3D>();
  const warmGlow = T.glow('255,214,150');
  const A = o.apothem, H = o.wallH, HALF = A * Math.tan(Math.PI / SIDES), CR = A / Math.cos(Math.PI / SIDES);
  const s = H / 8.1; // vertical scale relative to the original hall
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => { const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); c.position.set(x, y, z); c.rotation.y = ry; colliders.add(c); };

  // floor
  const floorGeo = new THREE.CircleGeometry(CR + 0.02, SIDES, Math.PI / 2 - Math.PI / SIDES); floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, o.floorMat); floor.name = o.name + 'Floor'; floor.renderOrder = 1; group.add(floor);
  box(CR * 2, 0.2, CR * 2, 0, -0.1, 0);

  // bays
  const D = 0.45;
  const extMat = m.stoneExt.clone(); extMat.side = THREE.BackSide;
  const winB = Math.min(1.15, HALF * 0.5), winSpring = 3.9 * s, winBase = 0.5;
  for (let k = 0; k < SIDES; k++) {
    const th = (k / SIDES) * Math.PI * 2, kind = o.bays[k];
    const bay = new THREE.Group(); bay.position.copy(dir(th).multiplyScalar(A)); bay.rotation.y = -th; group.add(bay);
    const shape = new THREE.Shape();
    let opening: THREE.Vector2[] | null = null;
    const doorB = Math.min(1.75, HALF * 0.78), doorSpring = 3.3 * s;
    if (kind === 'door') {
      opening = pointedOutline(doorB, doorSpring, 0);
      shape.moveTo(-HALF, 0); opening.forEach(p => shape.lineTo(p.x, p.y)); shape.lineTo(HALF, 0); shape.lineTo(HALF, H); shape.lineTo(-HALF, H); shape.closePath();
    } else {
      shape.moveTo(-HALF, 0); shape.lineTo(HALF, 0); shape.lineTo(HALF, H); shape.lineTo(-HALF, H); shape.closePath();
      if (kind === 'window') {
        opening = pointedOutline(winB, winSpring, winBase);
        const hole = new THREE.Path(); opening.forEach((p, i) => (i ? hole.lineTo(p.x, p.y) : hole.moveTo(p.x, p.y))); hole.closePath(); shape.holes.push(hole);
      }
    }
    const wg = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 12 }); wg.translate(0, 0, -D);
    bay.add(new THREE.Mesh(wg, [m.wall, m.reveal]));
    const ext = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), extMat); ext.position.z = -D - 0.01; bay.add(ext);
    // colliders in chamber-local space
    const inv = new THREE.Vector3(0, 1, 0);
    if (kind !== 'door') {
      const c = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.3, 3, 0.6), new THREE.MeshBasicMaterial());
      c.position.copy(dir(th).multiplyScalar(A + 0.25)).setY(1.5); c.rotation.y = -th; colliders.add(c);
    } else {
      const jw = HALF - doorB + 0.3;
      for (const sg of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(jw, 3, 0.6), new THREE.MeshBasicMaterial());
        c.position.copy(new THREE.Vector3(sg * (doorB + jw / 2 - 0.15), 1.5, -0.25).applyAxisAngle(inv, -th).add(bay.position)); c.rotation.y = -th; colliders.add(c);
      }
    }
    if (opening) {
      const inner = opening.slice(1, -1).map(p => new THREE.Vector3(p.x, p.y, 0.03));
      const b0 = kind === 'window' ? winBase : 0;
      inner.unshift(new THREE.Vector3(opening[0].x, b0, 0.03)); inner.push(new THREE.Vector3(opening[opening.length - 1].x, b0, 0.03));
      bay.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(inner, false, 'centripetal'), 96, 0.05, 8), m.gilt));
      const outer = inner.map(p => new THREE.Vector3(p.x * 1.1, p.y > b0 + 0.05 ? b0 + (p.y - b0) * 1.05 : p.y, 0.05));
      bay.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outer, false, 'centripetal'), 96, 0.028, 6), m.giltSatin));
    }
    if (kind === 'window') buildNouveauWindow(bay, m, winB, winSpring, winBase);
    if (kind === 'door') {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(doorB * 2 + 0.2, 0.04, D + 0.6), m.marble); sill.position.set(0, 0.01, -D / 2); bay.add(sill);
    }
    if (kind === 'shelf' || kind === 'panelShelf') {
      const bc = buildBookcase(m, Math.min(3.5, HALF * 2 - 0.5), 5.6 * s, kind === 'panelShelf', o.sparseBooks ?? 0.4);
      bc.group.position.z = 0.02; bay.add(bc.group);
      if (bc.mount) panelMounts.set(k, bc.mount);
    }
    if (kind === 'banner') {
      const mount = new THREE.Group(); mount.position.set(0, 3.4 * s, 0.06); bay.add(mount); bannerMounts.set(k, mount);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(HALF * 1.6 + 0.2, 4.1 * s, 0.05), m.walnutDark); fr.position.set(0, 3.4 * s, 0.03); bay.add(fr);
      const arc: THREE.Vector3[] = []; const bw = HALF * 0.8 + 0.1;
      for (let i = 0; i <= 24; i++) { const a = Math.PI - (i / 24) * Math.PI; arc.push(new THREE.Vector3(Math.cos(a) * bw, 5.45 * s + Math.sin(a) * 0.5, 0.08)); }
      bay.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 48, 0.04, 8), m.gilt));
    }
  }

  // corner columns (labradorite, lily capitals)
  const capY = H - 1.6;
  for (let k = 0; k < SIDES; k++) {
    const th = ((k + 0.5) / SIDES) * Math.PI * 2;
    const col = new THREE.Group(); col.position.copy(dir(th).multiplyScalar(CR - 0.5)); group.add(col);
    col.add(labradoriteColumn(m, capY, 0.3));
    const ab = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 1.15), m.giltSatin); ab.position.y = capY + 0.93; ab.rotation.y = -th; col.add(ab);
    const cc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 10), new THREE.MeshBasicMaterial()); cc.position.copy(col.position).setY(1.5); colliders.add(cc);
    if (k % 2 === 0) {
      const inward = dir(th).multiplyScalar(-1);
      const sc = new THREE.Group(); sc.position.copy(col.position).addScaledVector(inward, 0.33).setY(2.7 * Math.max(0.85, s)); sc.lookAt(sc.position.clone().add(inward));
      const arm = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 8, 24, Math.PI), m.gilt); arm.rotation.y = Math.PI / 2; arm.position.set(0, 0, 0.18); sc.add(arm);
      const tulip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), m.emissiveWarm); tulip.scale.set(1, 1.4, 1); tulip.position.set(0, 0.2, 0.36); sc.add(tulip);
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: warmGlow, color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
      g.scale.setScalar(1.1); g.position.set(0, 0.25, 0.38); sc.add(g); glows.push(g);
      group.add(sc);
    }
  }

  // frieze + cornice
  const y0 = H - 0.6, y1 = H + 0.15;
  if (o.frieze && o.friezeFont) {
    const frz = T.frieze(o.friezeFont);
    const frGeo = new THREE.BufferGeometry(); const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const cr = (A - 0.08) / Math.cos(Math.PI / SIDES);
    for (let i = 0; i <= SIDES; i++) { const d = dir(((i + 0.5) / SIDES) * Math.PI * 2).multiplyScalar(cr); pos.push(d.x, y0, d.z, d.x, y1, d.z); const u = (i / SIDES) * 2; uv.push(u, 0, u, 1); if (i < SIDES) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    frGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); frGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); frGeo.setIndex(idx); frGeo.computeVertexNormals();
    group.add(new THREE.Mesh(frGeo, new THREE.MeshStandardMaterial({ map: frz, emissiveMap: frz, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide })));
  }
  const polyTube = (apo: number, y: number, r: number, mat: THREE.Material) => {
    const path = new THREE.CurvePath<THREE.Vector3>(); const c = apo / Math.cos(Math.PI / SIDES);
    for (let i = 0; i < SIDES; i++) path.add(new THREE.LineCurve3(dir(((i + 0.5) / SIDES) * Math.PI * 2).multiplyScalar(c).setY(y), dir(((i + 1.5) / SIDES) * Math.PI * 2).multiplyScalar(c).setY(y)));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(path as any, SIDES * 2, r, 8, true), mat));
  };
  polyTube(A - 0.12, y0 - 0.03, 0.07, m.gilt); polyTube(A - 0.12, y1 + 0.03, 0.09, m.gilt); polyTube(A - 0.2, y1 + 0.17, 0.06, m.giltSatin);

  // dome (painted interior, patina exterior, oculus)
  const oculus = 0.17, domeR = CR + 0.05, domeS = 0.62, base = H + 0.25;
  const domeMat = new THREE.MeshStandardMaterial({ map: o.domeMural ?? null, emissiveMap: o.domeMural ?? null, emissive: 0xffffff, emissiveIntensity: o.domeMural ? 0.42 : 0, color: o.domeMural ? 0xffffff : 0x163530, roughness: 0.7, side: THREE.BackSide });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(domeR, 72, 28, 0, Math.PI * 2, oculus, Math.PI / 2 - oculus), domeMat);
  dome.scale.y = domeS; dome.position.y = base; group.add(dome);
  for (let k = 0; k < SIDES; k++) {
    const th = ((k + 0.5) / SIDES) * Math.PI * 2; const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) { const phi = oculus + (i / 20) * (Math.PI / 2 - oculus); pts.push(dir(th).multiplyScalar((domeR - 0.08) * Math.sin(phi)).setY(base + (domeR - 0.08) * Math.cos(phi) * domeS)); }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.055, 6), m.gilt));
  }
  const ocR = domeR * Math.sin(oculus), ocY = base + domeR * Math.cos(oculus) * domeS;
  const ocRing = new THREE.Mesh(new THREE.TorusGeometry(ocR, 0.11, 10, 48), m.gilt); ocRing.rotation.x = Math.PI / 2; ocRing.position.y = ocY; group.add(ocRing);
  const ocGlass = new THREE.Mesh(new THREE.CircleGeometry(ocR, 32), m.glass); ocGlass.rotation.x = Math.PI / 2; ocGlass.position.y = ocY + 0.05; group.add(ocGlass);
  const extDome = new THREE.Mesh(new THREE.SphereGeometry(domeR + 0.55, 48, 18, 0, Math.PI * 2, oculus * 0.95, Math.PI / 2 - oculus * 0.95), m.patina);
  extDome.scale.y = 0.66; extDome.position.y = base - 0.05; group.add(extDome);
  for (let k = 0; k < SIDES; k++) {
    const th = ((k + 0.5) / SIDES) * Math.PI * 2; const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) { const phi = oculus + (i / 14) * (Math.PI / 2 - oculus); pts.push(dir(th).multiplyScalar((domeR + 0.58) * Math.sin(phi)).setY(base - 0.05 + (domeR + 0.58) * Math.cos(phi) * 0.66)); }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.065, 6), m.giltSatin));
  }
  const lantern = new THREE.Group(); lantern.position.y = base - 0.05 + (domeR + 0.55) * Math.cos(oculus) * 0.66;
  const lg = new THREE.Mesh(new THREE.CylinderGeometry(ocR + 0.1, ocR + 0.2, 1.0, 20, 1, true), m.glass); lg.position.y = 0.45; lantern.add(lg);
  const lc = lathe([[ocR + 0.3, 0], [ocR + 0.1, 0.22], [0.45, 0.62], [0.11, 1.1], [0.05, 1.6], [0, 1.6]], m.gilt, 24); lc.position.y = 0.95; lantern.add(lc);
  group.add(lantern);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(CR + 0.5, CR + 0.5, 0.9, SIDES, 1, true, -Math.PI / SIDES), m.stoneExt); drum.position.y = H + 0.25; group.add(drum);

  // chandelier
  if (o.chandelier) {
    const cs = o.chandelier;
    const ch = new THREE.Group(); ch.position.y = H - 1.8; ch.scale.setScalar(cs); group.add(ch);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.045, 8, 72), m.gilt); ring.rotation.x = Math.PI / 2; ch.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.03, 8, 56), m.gilt); ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.35; ch.add(ring2);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2; const p = new THREE.Vector3(Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35);
      ch.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p, p.clone().multiplyScalar(1.12).setY(-0.25), p.clone().multiplyScalar(1.05).setY(-0.42)), 10, 0.012, 5), m.gilt));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), m.emissiveWarm); bulb.scale.y = 1.5; bulb.position.copy(p).multiplyScalar(1.05).setY(-0.5); ch.add(bulb);
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.35, 5), m.gilt); sp.rotation.z = Math.PI / 2; sp.rotation.y = -a; sp.position.set(Math.cos(a) * 0.67, 0, Math.sin(a) * 0.67); ch.add(sp);
    }
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), m.labradorite); crystal.scale.y = 1.8; crystal.position.y = -0.2; ch.add(crystal);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const top = new THREE.Vector3(Math.cos(a) * ocR * 0.9 / cs, (ocY - (H - 1.8)) / cs, Math.sin(a) * ocR * 0.9 / cs), bot = new THREE.Vector3(Math.cos(a) * 0.9, 0.35, Math.sin(a) * 0.9);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, top.distanceTo(bot), 5), m.giltSatin);
      chain.position.copy(top).add(bot).multiplyScalar(0.5); chain.lookAt(top); chain.rotateX(Math.PI / 2); ch.add(chain);
    }
    const chGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: warmGlow, color: 0xffc98a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
    chGlow.scale.setScalar(4.2); chGlow.position.y = -0.45; ch.add(chGlow); glows.push(chGlow);
    const chLight = new THREE.PointLight(0xffc88a, 70 * cs * cs, 0, 2); chLight.position.y = -0.6; ch.add(chLight); lights.push(chLight);
  }
  for (let i = 0; i < (o.fillLights ?? 0); i++) {
    const th = (i / (o.fillLights ?? 1)) * Math.PI * 2 + Math.PI / 3;
    const l = new THREE.PointLight(0xffb870, 18, A * 1.6, 2); l.position.copy(dir(th).multiplyScalar(A * 0.75)).setY(3.2 * s); group.add(l); lights.push(l);
  }

  group.updateMatrixWorld(true);
  const toWorld = (v: THREE.Vector3) => v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotY ?? 0).add(o.center);
  const bayWorld = (k: number, inset = 0) => toWorld(dir((k / SIDES) * Math.PI * 2).multiplyScalar(A - inset));
  return { group, colliders, floor, lights, glows, panelMounts, bannerMounts, domeMat, bayWorld, toWorld, radius: A };
}

export function labradoriteColumn(m: Mats, capY: number, r = 0.3) {
  const g = new THREE.Group();
  g.add(lathe([[0, 0], [r + 0.25, 0], [r + 0.25, 0.28], [r + 0.2, 0.3], [r + 0.2, 0.36], [r + 0.12, 0.42], [r + 0.16, 0.48], [r + 0.06, 0.56], [r + 0.03, 0.62], [0, 0.62]], m.gilt, 28));
  const shaftH = capY - 0.62;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.03, shaftH, 32, 1, true), m.labradoriteDark); shaft.position.y = 0.62 + shaftH / 2; g.add(shaft);
  for (const f of [0.2, 0.82]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.015, 0.025, 6, 32), m.gilt); ring.rotation.x = Math.PI / 2; ring.position.y = 0.62 + shaftH * f; g.add(ring); }
  const cap = lathe([[r, 0], [r + 0.06, 0.12], [r + 0.14, 0.35], [r + 0.26, 0.6], [r + 0.38, 0.78], [r + 0.42, 0.86], [0, 0.86]], m.gilt, 32); cap.position.y = capY; g.add(cap);
  for (let p = 0; p < 6; p++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6), m.gilt); leaf.scale.set(0.9, 3.2, 0.45);
    const a = (p / 6) * Math.PI * 2; leaf.position.set(Math.cos(a) * (r + 0.13), capY + 0.28, Math.sin(a) * (r + 0.13)); leaf.rotation.set(0, -a, 0); leaf.rotateZ(0.5); g.add(leaf);
  }
  return g;
}

/** Clear glass in a pointed arch with gilt Art Nouveau "tree" tracery. */
function buildNouveauWindow(bay: THREE.Group, m: Mats, b: number, spring: number, base: number) {
  const opening = pointedOutline(b, spring, base);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(opening), 12), m.glass); glass.position.z = -0.22; glass.renderOrder = 5; bay.add(glass);
  const apex = pointedApex(b, spring), z = -0.18;
  const tube = (pts: number[][], r = 0.02) => bay.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, z)), false, 'centripetal'), 48, r, 6), m.gilt));
  // trunk rising from the sill, branching into boughs that follow the arch
  tube([[0, base], [0, spring * 0.55], [0, spring * 0.92]], 0.03);
  for (const sg of [-1, 1]) {
    tube([[0, spring * 0.9], [sg * b * 0.25, spring * 1.02], [sg * b * 0.62, spring + (apex - spring) * 0.35], [sg * b * 0.35, apex - 0.35], [0, apex - 0.05]], 0.022);
    tube([[0, spring * 0.7], [sg * b * 0.35, spring * 0.78], [sg * b * 0.78, spring * 0.92], [sg * b * 0.97, spring]], 0.018);
    tube([[sg * b * 0.5, base], [sg * b * 0.52, spring * 0.4], [sg * b * 0.44, spring * 0.62], [sg * b * 0.2, spring * 0.72]], 0.016);
    // leaves
    for (const [lx, ly] of [[0.55, spring * 1.08], [0.82, spring * 0.96], [0.4, apex - 0.55]]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m.gilt); leaf.scale.set(0.7, 1.8, 0.35); leaf.position.set(sg * b * lx, ly, z); leaf.rotation.z = -sg * 0.6; bay.add(leaf);
    }
  }
  const rose = new THREE.Mesh(new THREE.TorusGeometry(b * 0.22, 0.018, 6, 28), m.gilt); rose.position.set(0, apex - (apex - spring) * 0.45, z); bay.add(rose);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(b * 2 + 0.25, 0.05, 0.6), m.marble); sill.position.set(0, base - 0.02, -0.18); bay.add(sill);
}

/** Walnut bookcase. With a panel it leaves an eye-level opening framed in gilt. Books fill only part of each shelf. */
function buildBookcase(m: Mats, W: number, H: number, withPanel: boolean, fill: number) {
  const group = new THREE.Group();
  const Dp = 0.46;
  const outline = new THREE.Shape();
  outline.moveTo(-W / 2, 0); outline.lineTo(W / 2, 0); outline.lineTo(W / 2, H - 0.9); outline.absellipse(0, H - 0.9, W / 2, 0.9, 0, Math.PI, false); outline.lineTo(-W / 2, 0);
  const back = new THREE.Mesh(new THREE.ShapeGeometry(outline, 16), m.walnutDark); back.position.z = 0.01; group.add(back);
  for (const sg of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, H - 0.9, Dp), m.walnut); side.position.set(sg * (W / 2 - 0.04), (H - 0.9) / 2, Dp / 2); group.add(side); }
  const arc: THREE.Vector3[] = []; for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI; arc.push(new THREE.Vector3(Math.cos(a) * (W / 2), H - 0.9 + Math.sin(a) * 0.9, Dp)); }
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 48, 0.05, 8), m.gilt));
  // panel opening: x in [-pw/2, pw/2], y in [py0, py1]
  const pw = Math.min(W - 0.5, 2.3), py0 = 0.75, py1 = 2.55;
  let mount: THREE.Object3D | undefined;
  if (withPanel) {
    mount = new THREE.Group(); mount.position.set(0, (py0 + py1) / 2, Dp - 0.02); mount.userData.keep = true; group.add(mount);
    const fr: THREE.Vector3[] = [new THREE.Vector3(-pw / 2 - 0.05, py0 - 0.05, Dp), new THREE.Vector3(pw / 2 + 0.05, py0 - 0.05, Dp), new THREE.Vector3(pw / 2 + 0.05, py1 + 0.05, Dp), new THREE.Vector3(-pw / 2 - 0.05, py1 + 0.05, Dp)];
    const path = new THREE.CurvePath<THREE.Vector3>(); for (let i = 0; i < 4; i++) path.add(new THREE.LineCurve3(fr[i], fr[(i + 1) % 4]));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(path as any, 16, 0.035, 6, true), m.gilt));
    mount.userData.maxW = pw; mount.userData.maxH = py1 - py0;
  }
  const shelves = Math.floor((H - 1.1) / 0.64) + 1;
  const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m.leather, shelves * 30);
  const palette = ['#5a1d1b', '#23402f', '#1d2c4a', '#8a6a2d', '#2b1a12', '#6b4a2e', '#3d2a4a', '#a0864f', '#16211d', '#7a2e22'].map(c => new THREE.Color(c));
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(); let n = 0;
  for (let si = 0; si < shelves; si++) {
    const y = 0.3 + si * 0.64;
    const blocked = withPanel && y > py0 - 0.5 && y < py1 + 0.05;
    const segs: [number, number][] = blocked ? [[-W / 2 + 0.1, -pw / 2 - 0.1], [pw / 2 + 0.1, W / 2 - 0.1]] : [[-W / 2 + 0.1, W / 2 - 0.1]];
    for (const [x0, x1] of segs) {
      if (x1 - x0 < 0.15) continue;
      const sh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.04, Dp - 0.04), m.walnut); sh.position.set((x0 + x1) / 2, y, Dp / 2); group.add(sh);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.03, 0.02), m.giltSatin); lip.position.set((x0 + x1) / 2, y + 0.005, Dp - 0.01); group.add(lip);
      if (si === shelves - 1) continue;
      // one run of books per segment, filling only `fill` of it; the rest stays open for real books
      const runLen = (x1 - x0) * fill * (0.6 + T.rand() * 0.8);
      const start = T.rand() < 0.5 ? x0 + 0.04 : x1 - 0.04 - runLen;
      let x = start;
      while (x < start + runLen && n < books.count) {
        const t = 0.03 + T.rand() * 0.045, h = 0.3 + T.rand() * 0.2, d = 0.22 + T.rand() * 0.08;
        mtx.compose(new THREE.Vector3(x + t / 2, y + 0.02 + h / 2, 0.17 + d / 2 - 0.05), q.identity(), new THREE.Vector3(t, h, d));
        books.setMatrixAt(n, mtx); books.setColorAt(n, palette[Math.floor(T.rand() * palette.length)]); n++; x += t + 0.004;
      }
      // a leaning bookend book at the end of the run
      if (n < books.count && runLen > 0.2) {
        q.setFromEuler(new THREE.Euler(0, 0, -0.35));
        mtx.compose(new THREE.Vector3(x + 0.1, y + 0.2, 0.25), q, new THREE.Vector3(0.04, 0.34, 0.24)); books.setMatrixAt(n, mtx); books.setColorAt(n, palette[n % palette.length]); n++;
      }
    }
  }
  books.count = n; books.instanceMatrix.needsUpdate = true; if (books.instanceColor) books.instanceColor.needsUpdate = true;
  group.add(books);
  return { group, mount };
}
