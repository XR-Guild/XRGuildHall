import * as THREE from 'three';
import type { Mats } from './mats';
import * as T from './tex';
import { stainedDome, stainedRose } from './tex2';
import { dir, pointedOutline, pointedApex } from './chamber';
import { xrMonogram } from './xrmark';

/**
 * v3 Guild Hall, after DeeDee Chainey Jones's "Guild Draft 3" (arrival.space):
 * a 12-sided rotunda about 29 m across, square dark-marble pillars, tall gilt gothic windows over a
 * marble wainscot, dark cherry plank walls, a clerestory band of stained-glass roses, and a
 * stained-glass dome with XR Guild roundels. Pillars carry the shiny XR monogram capital.
 */
export const GH = {
  A: 14, sides: 12,
  wainscot: 1.1,
  win: { b: 2.3, spring: 7.4, base: 1.1 },
  door: { b: 2.6, spring: 6.0 },
  frieze: [11.0, 11.8] as const,
  clere: { y: 13.4, r: 1.2 },
  wallTop: 15.0,
  domeRise: 0.5,
};

export interface GrandHall {
  group: THREE.Group; colliders: THREE.Group; floor: THREE.Mesh;
  lights: THREE.Light[]; glows: THREE.Sprite[];
  bannerMounts: Map<number, THREE.Object3D>;
  radius: number;
}

function lathe(profile: [number, number][], mat: THREE.Material, seg = 32) {
  return new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
}
const tube = (pts: THREE.Vector3[], r: number, mat: THREE.Material, closed = false) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed, 'centripetal'), Math.max(16, pts.length * 2), r, 6, closed), mat);

export function buildGrandHall(m: Mats, center: THREE.Vector3, bays: ('window' | 'door' | 'banner')[], friezeFont: string): GrandHall {
  const group = new THREE.Group(); group.name = 'GuildHall'; group.position.copy(center);
  const colliders = new THREE.Group(); colliders.position.copy(center);
  const lights: THREE.Light[] = []; const glows: THREE.Sprite[] = [];
  const bannerMounts = new Map<number, THREE.Object3D>();
  const { A, sides } = GH; const HALF = A * Math.tan(Math.PI / sides), CR = A / Math.cos(Math.PI / sides);
  const H = GH.wallTop, D = 0.5;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => { const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); c.position.set(x, y, z); c.rotation.y = ry; colliders.add(c); };
  const warmGlow = T.glow('255,214,150');

  // wall material: cherry planks, one plank ~0.3 m, tiled in metres (extrude UVs are metres)
  const wallMat = m.cherryWall.clone();
  wallMat.map = m.cherryWall.map!.clone(); wallMat.map.repeat.set(0.55, 0.15); wallMat.map.needsUpdate = true;
  wallMat.bumpMap = m.cherryWall.bumpMap!.clone(); wallMat.bumpMap.repeat.set(0.55, 0.15); wallMat.bumpMap.needsUpdate = true;
  const revealMat = m.walnutDark;
  const extMat = m.stoneExt.clone(); extMat.side = THREE.BackSide;
  const glass = m.glass.clone(); glass.opacity = 0.16; glass.color.set(0xd8ecf2);

  // ---------- floor: grey-veined marble with the v2 mosaic medallion at the centre ----------
  const floorGeo = new THREE.CircleGeometry(CR + 0.02, sides, Math.PI / 2 - Math.PI / sides); floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, m.hallFloor); floor.name = 'HallFloor'; floor.renderOrder = 1; group.add(floor);
  const medal = new THREE.Mesh(new THREE.CircleGeometry(4.2, 72), m.floor); medal.rotation.x = -Math.PI / 2; medal.position.y = 0.006; medal.renderOrder = 2; group.add(medal);
  const medalRing = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.05, 6, 120), m.gilt); medalRing.rotation.x = Math.PI / 2; medalRing.position.y = 0.01; group.add(medalRing);
  box(CR * 2, 0.2, CR * 2, 0, -0.1, 0);

  const winO = pointedOutline(GH.win.b, GH.win.spring, GH.win.base);
  const winApex = pointedApex(GH.win.b, GH.win.spring);
  const doorO = pointedOutline(GH.door.b, GH.door.spring, 0);

  for (let k = 0; k < sides; k++) {
    const th = (k / sides) * Math.PI * 2, kind = bays[k];
    const bay = new THREE.Group(); bay.position.copy(dir(th).multiplyScalar(A)); bay.rotation.y = -th; group.add(bay);
    // wall shape with holes: window or door + clerestory rose
    const sh = new THREE.Shape();
    if (kind === 'door') { sh.moveTo(-HALF, 0); doorO.forEach(p => sh.lineTo(p.x, p.y)); sh.lineTo(HALF, 0); sh.lineTo(HALF, H); sh.lineTo(-HALF, H); sh.closePath(); }
    else {
      sh.moveTo(-HALF, 0); sh.lineTo(HALF, 0); sh.lineTo(HALF, H); sh.lineTo(-HALF, H); sh.closePath();
      if (kind === 'window') { const hole = new THREE.Path(); winO.forEach((p, i) => (i ? hole.lineTo(p.x, p.y) : hole.moveTo(p.x, p.y))); hole.closePath(); sh.holes.push(hole); }
    }
    const rose = new THREE.Path(); rose.absarc(0, GH.clere.y, GH.clere.r, 0, Math.PI * 2, true); sh.holes.push(rose);
    const wg = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 24 }); wg.translate(0, 0, -D);
    bay.add(new THREE.Mesh(wg, [wallMat, revealMat]));
    const ext = new THREE.Mesh(new THREE.ShapeGeometry(sh, 16), extMat); ext.position.z = -D - 0.01; bay.add(ext);

    // marble wainscot (split around a door)
    const wh = GH.wainscot;
    if (kind === 'door') {
      for (const sg of [-1, 1]) { const w = HALF - GH.door.b - 0.15; const ws = new THREE.Mesh(new THREE.BoxGeometry(w, wh, 0.14), m.darkMarble); ws.position.set(sg * (GH.door.b + 0.15 + w / 2), wh / 2, 0.07); bay.add(ws); }
    } else { const ws = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 - 0.2, wh, 0.14), m.darkMarble); ws.position.set(0, wh / 2, 0.07); bay.add(ws); }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 - 0.1, 0.06, 0.22), m.gilt); cap.position.set(0, wh + 0.02, 0.09);
    if (kind !== 'door') bay.add(cap);

    // colliders
    if (kind !== 'door') { const c = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.3, 3, 0.7), new THREE.MeshBasicMaterial()); c.position.copy(dir(th).multiplyScalar(A + 0.2)).setY(1.5); c.rotation.y = -th; colliders.add(c); }
    else {
      const jw = HALF - GH.door.b + 0.3;
      for (const sg of [-1, 1]) { const c = new THREE.Mesh(new THREE.BoxGeometry(jw, 3, 0.7), new THREE.MeshBasicMaterial()); c.position.copy(new THREE.Vector3(sg * (GH.door.b + jw / 2 - 0.15), 1.5, -0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), -th).add(bay.position)); c.rotation.y = -th; colliders.add(c); }
      const sill = new THREE.Mesh(new THREE.BoxGeometry(GH.door.b * 2 + 0.2, 0.04, D + 0.8), m.marble); sill.position.set(0, 0.01, -D / 2); bay.add(sill);
    }

    // gilt frame around the opening (double moulding, as in DeeDee's build)
    const O = kind === 'door' ? doorO : kind === 'window' ? winO : null;
    if (O) {
      const b0 = kind === 'window' ? GH.win.base : 0;
      const inner = O.slice(1, -1).map(p => new THREE.Vector3(p.x, p.y, 0.04));
      inner.unshift(new THREE.Vector3(O[0].x, b0, 0.04)); inner.push(new THREE.Vector3(O[O.length - 1].x, b0, 0.04));
      bay.add(tube(inner, 0.08, m.gilt));
      bay.add(tube(inner.map(p => new THREE.Vector3(p.x * 1.07, p.y > b0 + 0.05 ? b0 + (p.y - b0) * 1.03 : p.y, 0.06)), 0.04, m.giltSatin));
    }
    if (kind === 'window') { windowTracery(bay, m, glass); }
    if (kind === 'banner') { const mount = new THREE.Group(); mount.position.set(0, 5.4, 0.08); bay.add(mount); bannerMounts.set(k, mount);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(4.3, 5.9, 0.06), m.walnutDark); fr.position.set(0, 5.4, 0.04); bay.add(fr);
      const arc: THREE.Vector3[] = []; for (let i = 0; i <= 24; i++) { const a = Math.PI - (i / 24) * Math.PI; arc.push(new THREE.Vector3(Math.cos(a) * 2.2, 8.4 + Math.sin(a) * 0.8, 0.1)); }
      bay.add(tube(arc, 0.05, m.gilt)); }

    // clerestory stained-glass rose (placeholder art, one XR glyph per window)
    const rg = new THREE.Mesh(new THREE.CircleGeometry(GH.clere.r, 48), new THREE.MeshStandardMaterial({ map: stainedRose(k), emissiveMap: null, emissive: 0xffffff, roughness: 0.45, side: THREE.DoubleSide }));
    const rmat = rg.material as THREE.MeshStandardMaterial; rmat.emissiveMap = rmat.map; rmat.emissiveIntensity = 0.7;
    rg.position.set(0, GH.clere.y, -D / 2); rg.userData.keep = true; bay.add(rg);
    const rr = new THREE.Mesh(new THREE.TorusGeometry(GH.clere.r + 0.05, 0.09, 8, 64), m.gilt); rr.position.set(0, GH.clere.y, 0.04); bay.add(rr);
    const rr2 = new THREE.Mesh(new THREE.TorusGeometry(GH.clere.r + 0.25, 0.035, 6, 64), m.giltSatin); rr2.position.set(0, GH.clere.y, 0.05); bay.add(rr2);
  }

  // ---------- square dark-marble pillars with XR capitals at every corner ----------
  const pw = 1.15, ph = GH.frieze[0] - 0.95;
  for (let k = 0; k < sides; k++) {
    const th = ((k + 0.5) / sides) * Math.PI * 2;
    const col = new THREE.Group(); col.position.copy(dir(th).multiplyScalar(CR - 0.55)); col.rotation.y = -th; group.add(col);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pw), m.darkMarble); shaft.position.y = ph / 2; col.add(shaft);
    const base = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.25, 0.35, pw + 0.25), m.darkMarble); base.position.y = 0.175; col.add(base);
    const bandB = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.28, 0.05, pw + 0.28), m.gilt); bandB.position.y = 0.36; col.add(bandB);
    // gilt edge fillets on the two room-facing corners
    for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, ph - 0.4, 0.05), m.gilt); f.position.set(sx * (pw / 2 + 0.005), ph / 2 + 0.2, pw / 2 + 0.005); col.add(f); }
    // capital block with the XR monogram facing the room
    const cw = pw + 0.45, chh = 0.95;
    const blk = new THREE.Mesh(new THREE.BoxGeometry(cw, chh, cw), m.darkMarble); blk.position.y = ph + chh / 2; col.add(blk);
    for (const yy of [ph, ph + chh]) { const band = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.08, 0.06, cw + 0.08), m.gilt); band.position.y = yy; col.add(band); }
    const mono = xrMonogram(m.gilt, 0.62); mono.position.set(0, ph + chh / 2, cw / 2 + 0.04); mono.scale.z = 0.5; col.add(mono);
    const cc = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.3, 3, pw + 0.3), new THREE.MeshBasicMaterial()); cc.position.copy(col.position).setY(1.5); cc.rotation.y = -th; colliders.add(cc);
    // warm sconce on every other pillar
    if (k % 2 === 0) {
      const sc = new THREE.Group(); sc.position.set(0, 3.6, pw / 2 + 0.02); col.add(sc);
      const arm = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 24, Math.PI), m.gilt); arm.rotation.y = Math.PI / 2; arm.position.set(0, 0, 0.22); sc.add(arm);
      const tulip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), m.emissiveWarm); tulip.scale.set(1, 1.4, 1); tulip.position.set(0, 0.24, 0.44); sc.add(tulip);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: warmGlow, color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
      gl.scale.setScalar(1.3); gl.position.set(0, 0.3, 0.46); sc.add(gl); glows.push(gl);
    }
  }

  // ---------- frieze band + cornices ----------
  const [fy0, fy1] = GH.frieze;
  {
    const frz = T.frieze(friezeFont);
    const g = new THREE.BufferGeometry(); const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const cr = (A - 0.06) / Math.cos(Math.PI / sides);
    for (let i = 0; i <= sides; i++) { const d = dir(((i + 0.5) / sides) * Math.PI * 2).multiplyScalar(cr); pos.push(d.x, fy0, d.z, d.x, fy1, d.z); const u = (i / sides) * 2; uv.push(u, 0, u, 1); if (i < sides) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: frz, emissiveMap: frz, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide })));
  }
  const polyTube = (apo: number, y: number, r: number, mat: THREE.Material) => {
    const path = new THREE.CurvePath<THREE.Vector3>(); const c = apo / Math.cos(Math.PI / sides);
    for (let i = 0; i < sides; i++) path.add(new THREE.LineCurve3(dir(((i + 0.5) / sides) * Math.PI * 2).multiplyScalar(c).setY(y), dir(((i + 1.5) / sides) * Math.PI * 2).multiplyScalar(c).setY(y)));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(path as any, sides * 2, r, 8, true), mat));
  };
  polyTube(A - 0.1, fy0 - 0.04, 0.09, m.gilt); polyTube(A - 0.1, fy1 + 0.04, 0.11, m.gilt); polyTube(A - 0.18, H - 0.05, 0.13, m.gilt); polyTube(A - 0.26, H + 0.12, 0.07, m.giltSatin);

  // ---------- stained-glass dome ----------
  const domeR = CR + 0.05, base = H + 0.2;
  const domeGeo = new THREE.SphereGeometry(domeR, 72, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  { const p = domeGeo.attributes.position, uv = domeGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * domeR), 0.5 - p.getZ(i) / (2 * domeR)); uv.needsUpdate = true; }
  const dtex = stainedDome(2048);
  const domeMat = new THREE.MeshStandardMaterial({ map: dtex, emissiveMap: dtex, emissive: 0xffffff, emissiveIntensity: 0.48, roughness: 0.5, side: THREE.BackSide });
  const dome = new THREE.Mesh(domeGeo, domeMat); dome.scale.y = GH.domeRise; dome.position.y = base; dome.userData.keep = true; group.add(dome);
  for (let k = 0; k < sides; k++) {
    const th = ((k + 0.5) / sides) * Math.PI * 2; const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) { const phi = 0.17 + (i / 24) * (Math.PI / 2 - 0.17); pts.push(dir(th).multiplyScalar((domeR - 0.1) * Math.sin(phi)).setY(base + (domeR - 0.1) * Math.cos(phi) * GH.domeRise)); }
    group.add(tube(pts, 0.09, m.gilt));
  }
  const ocR = domeR * Math.sin(0.17), ocY = base + domeR * Math.cos(0.17) * GH.domeRise - 0.08;
  const ocRing = new THREE.Mesh(new THREE.TorusGeometry(ocR, 0.14, 10, 64), m.gilt); ocRing.rotation.x = Math.PI / 2; ocRing.position.y = ocY; group.add(ocRing);
  const extDome = new THREE.Mesh(new THREE.SphereGeometry(domeR + 0.6, 64, 20, 0, Math.PI * 2, 0, Math.PI / 2), m.patina); extDome.scale.y = GH.domeRise + 0.04; extDome.position.y = base - 0.05; group.add(extDome);
  const lantern = new THREE.Group(); lantern.position.y = base - 0.05 + (domeR + 0.6) * (GH.domeRise + 0.04);
  const lg = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 1.6, 12, 1, true), m.glass); lg.position.y = 0.7; lantern.add(lg);
  const lc = lathe([[1.5, 0], [1.2, 0.3], [0.6, 0.9], [0.14, 1.6], [0.06, 2.4], [0, 2.4]], m.gilt, 24); lc.position.y = 1.4; lantern.add(lc);
  group.add(lantern);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(CR + 0.55, CR + 0.55, 1.0, sides, 1, true, -Math.PI / sides), m.stoneExt); drum.position.y = H + 0.3; group.add(drum);

  // ---------- chandelier + fill light for a room this size ----------
  const cs = 1.7;
  const ch = new THREE.Group(); ch.position.y = 12.2; ch.scale.setScalar(cs); group.add(ch);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.045, 8, 72), m.gilt); ring.rotation.x = Math.PI / 2; ch.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.03, 8, 56), m.gilt); ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.35; ch.add(ring2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2; const p = new THREE.Vector3(Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), m.emissiveWarm); bulb.scale.y = 1.5; bulb.position.copy(p).multiplyScalar(1.05).setY(-0.4); ch.add(bulb);
    ch.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p, p.clone().multiplyScalar(1.12).setY(-0.2), p.clone().multiplyScalar(1.05).setY(-0.34)), 10, 0.012, 5), m.gilt));
  }
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), m.labradorite); crystal.scale.y = 1.8; crystal.position.y = -0.2; ch.add(crystal);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, (ocY - 12.2) / cs, 5), m.giltSatin); chain.position.y = (ocY - 12.2) / cs / 2 + 0.35; ch.add(chain);
  const chGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: warmGlow, color: 0xffc98a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
  chGlow.scale.setScalar(4.2); chGlow.position.y = -0.45; ch.add(chGlow); glows.push(chGlow);
  const chLight = new THREE.PointLight(0xffc88a, 260, 0, 2); chLight.position.set(0, 10.6, 0); group.add(chLight); lights.push(chLight);
  for (let i = 0; i < 4; i++) { const th = (i / 4) * Math.PI * 2 + Math.PI / 4; const l = new THREE.PointLight(0xffb870, 55, 20, 2); l.position.copy(dir(th).multiplyScalar(A * 0.62)).setY(5.5); group.add(l); lights.push(l); }
  const daylight = new THREE.HemisphereLight(0xcfe3ff, 0x3a2a1c, 0.35); daylight.position.y = 14; group.add(daylight); lights.push(daylight);

  group.updateMatrixWorld(true);
  return { group, colliders, floor, lights, glows, bannerMounts, radius: A };
}

/** DeeDee-style gothic tracery in gilt: a central mullion, two lancet heads, and an oculus of four foils. */
function windowTracery(bay: THREE.Group, m: Mats, glass: THREE.Material) {
  const { b, spring, base } = GH.win; const apex = pointedApex(b, spring), z = -0.2;
  const outline = pointedOutline(b, spring, base);
  const pane = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(outline), 16), glass); pane.position.z = -0.26; pane.renderOrder = 5; bay.add(pane);
  const tb = (pts: [number, number][], r: number) => bay.add(tube(pts.map(([x, y]) => new THREE.Vector3(x, y, z)), r, m.gilt));
  // mullion up to the lancet heads
  const subB = b / 2, subSpring = spring - 0.2, subApex = pointedApex(subB, subSpring);
  tb([[0, base], [0, subApex]], 0.06);
  for (const sg of [-1, 1]) {
    const arch = pointedOutline(subB * 0.92, subSpring, subSpring).filter(p => p.y >= subSpring - 1e-6).map(p => [p.x + sg * subB, p.y] as [number, number]);
    tb(arch, 0.045);
    tb([[sg * subB, base], [sg * subB, subSpring - 0.2]], 0.03); // slim secondary mullion
  }
  // oculus with four foils between the lancet heads and the apex
  const oy = (subApex + apex) / 2 + 0.05, or = Math.min(b * 0.42, (apex - subApex) * 0.45);
  const circ = (cx: number, cy: number, r: number, t: number) => { const pts: THREE.Vector3[] = []; for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z)); } bay.add(tube(pts, t, m.gilt, true)); };
  circ(0, oy, or, 0.05);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; circ(Math.cos(a) * or * 0.46, oy + Math.sin(a) * or * 0.46, or * 0.36, 0.03); }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(b * 2 + 0.3, 0.06, 0.6), m.darkMarble); sill.position.set(0, base - 0.03, -0.2); bay.add(sill);
}
