import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Mats } from './mats';
import * as T from './tex';
import { HALL, LIB, POOL, BIG_TREE, BENCHES, PORTAL_SITES, poolWorld, V } from './site';
import { zellige, zelligeBorder } from './tex2';

export interface GardenBuilt {
  group: THREE.Group;
  colliders: THREE.Group;
  water: THREE.Mesh;
  waterReflector: Reflector | null;
  glows: THREE.Sprite[];
  lights: THREE.Light[];
  benches: { pos: THREE.Vector3; rotY: number }[];
  placeColonnade: (scene: THREE.Object3D) => void;
  update: (t: number, reduced: boolean) => void;
}

const mtx = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();

export function buildGarden(m: Mats, skyCube: THREE.Texture, desktopReflections: boolean): GardenBuilt {
  const group = new THREE.Group(); group.name = 'Garden';
  const colliders = new THREE.Group();
  const glows: THREE.Sprite[] = [];
  const lights: THREE.Light[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => { const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); c.position.set(x, y, z); c.rotation.y = ry; colliders.add(c); return c; };

  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), m.grass); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; group.add(ground);
  box(220, 0.2, 220, 12, -0.12, 2);
  // gravel aprons around both chambers
  for (const [c, a] of [[HALL.center, HALL.apothem], [LIB.center, LIB.apothem]] as const) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(a + 0.3, a + 2.6, 96), m.gravel); ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, -0.006, c.z); group.add(ring);
  }

  // ---------- reflecting pool with Moorish zellige (Alhambra-style stars, tiny gold cubes for XR) ----------
  const pool = new THREE.Group(); pool.position.copy(POOL.center); pool.rotation.y = POOL.rotY; group.add(pool);
  const pw = POOL.width, pl = POOL.length, cop = 1.4, TILE = 1.2, top = 0.22;
  const zt = zellige(512, 4);
  const tileMat = (w: number, d: number) => { const t = zt.clone(); t.repeat.set(w / TILE, d / TILE); t.needsUpdate = true; return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 0.9 }); };
  const zb = zelligeBorder(1024, 128);
  for (const [w, d, x, z] of [[pw + cop * 2, cop, 0, -pl / 2 - cop / 2], [pw + cop * 2, cop, 0, pl / 2 + cop / 2], [cop, pl, -pw / 2 - cop / 2, 0], [cop, pl, pw / 2 + cop / 2, 0]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, top, d), tileMat(w, d)); c.position.set(x, top / 2, z); pool.add(c);
  }
  // marble curb outside the tile and gilt edge at the water
  for (const [w, d, x, z] of [[pw + cop * 2 + 0.5, 0.25, 0, -pl / 2 - cop - 0.12], [pw + cop * 2 + 0.5, 0.25, 0, pl / 2 + cop + 0.12], [0.25, pl + cop * 2, -pw / 2 - cop - 0.12, 0], [0.25, pl + cop * 2, pw / 2 + cop + 0.12, 0]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, top + 0.06, d), m.marble); c.position.set(x, (top + 0.06) / 2, z); pool.add(c);
  }
  for (const [len, x, z, ry] of [[pw, 0, -pl / 2, 0], [pw, 0, pl / 2, Math.PI], [pl, -pw / 2, 0, Math.PI / 2], [pl, pw / 2, 0, -Math.PI / 2]] as const) {
    const t = zb.clone(); t.repeat.set(len / 1.0, 1); t.needsUpdate = true;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.55), new THREE.MeshStandardMaterial({ map: t, roughness: 0.25 }));
    strip.position.set(x, top - 0.275, z); strip.rotation.y = ry; pool.add(strip);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(len + 0.04, 0.04, 0.06), m.gilt); edge.position.set(x, top + 0.005, z); edge.rotation.y = ry; pool.add(edge);
  }
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(pw + cop * 2 + 4, pl + cop * 2 + 4), m.gravel); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.004; pool.add(apron);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(pw, pl), tileMat(pw, pl)); bed.rotation.x = -Math.PI / 2; bed.position.y = -0.33; pool.add(bed);
  box(pw + cop * 2, 2.2, pl + cop * 2, POOL.center.x, 1.0, POOL.center.z, POOL.rotY);
  const wn = T.waterNormal(256); wn.repeat.set(4, 8);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(pw, pl), new THREE.MeshPhysicalMaterial({
    color: 0x0a2a33, roughness: 0.03, metalness: 0, envMap: skyCube, envMapIntensity: 1.4, normalMap: wn, normalScale: new THREE.Vector2(0.12, 0.12), clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.72,
  }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.1; water.userData.keep = true; water.renderOrder = 3; pool.add(water);
  let waterReflector: Reflector | null = null;
  if (desktopReflections) {
    waterReflector = new Reflector(new THREE.PlaneGeometry(pw, pl), { textureWidth: 1024, textureHeight: 1024, color: 0x8a9aa0, clipBias: 0.003 });
    waterReflector.userData.keep = true; waterReflector.rotation.x = -Math.PI / 2; waterReflector.position.y = 0.095; pool.add(waterReflector);
    const wm = water.material as THREE.MeshPhysicalMaterial; wm.opacity = 0.45; wm.depthWrite = false;
  }
  const pxz = (x: number, z: number): [number, number] => { const p = poolWorld(x, z); return [p.x, p.z]; };

  // lanterns along the pool
  const glowTex = T.glow('255,210,150');
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const p = poolWorld(s * (pw / 2 + cop + 0.9), -pl / 2 + 2 + i * ((pl - 4) / 3));
    const l = new THREE.Group(); l.position.copy(p);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.3, 10), m.blackMetal); post.position.y = 0.65; l.add(post);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.12, 12), m.giltSatin); cap.position.y = 1.62; l.add(cap);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), m.emissiveWarm); globe.position.y = 1.45; l.add(globe);
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd39a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    g.scale.setScalar(1.3); g.position.y = 1.45; l.add(g); glows.push(g);
    group.add(l);
  }

  // marble benches: one off each end of the pool (as sketched) and two along the long sides
  const benches: { pos: THREE.Vector3; rotY: number }[] = [];
  const bench = (p: THREE.Vector3, ry: number) => {
    const b = new THREE.Group(); b.position.copy(p); b.rotation.y = ry;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.5), m.marble); seat.position.y = 0.46; b.add(seat);
    for (const lx of [-0.72, 0.72]) { const leg = new THREE.Mesh(new THREE.LatheGeometry([[0.14, 0], [0.16, 0.04], [0.09, 0.14], [0.08, 0.32], [0.15, 0.42], [0, 0.42]].map(([r, y]) => new THREE.Vector2(r, y)), 16), m.marble); leg.position.set(lx, 0, 0); leg.scale.z = 1.4; b.add(leg); }
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.012, 0.04), m.gilt); inlay.position.set(0, 0.51, 0.2); b.add(inlay);
    group.add(b); box(1.9, 1, 0.6, p.x, 0.5, p.z, ry);
    benches.push({ pos: p.clone(), rotY: ry });
  };
  for (const p of BENCHES) bench(p, Math.atan2(POOL.center.x - p.x, POOL.center.z - p.z)); // both face the pool

  // ---------- cypress accents on the outer edges ----------
  const cyGeo = new THREE.LatheGeometry([[0, 0], [0.45, 0.4], [0.7, 1.6], [0.65, 3.2], [0.4, 4.6], [0.08, 5.6], [0, 5.7]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const cyMat = new THREE.MeshStandardMaterial({ map: T.grass(256), color: 0x4f7552, roughness: 0.95 });
  const cyPts: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) { const a = Math.PI * (0.95 + i * 0.13); cyPts.push([Math.sin(a) * (HALL.apothem + 8), -Math.cos(a) * (HALL.apothem + 8), 1.4]); } // west arc behind the hall
  for (let i = 0; i < 7; i++) { const a = Math.PI * (-0.2 + i * 0.12); cyPts.push([LIB.center.x + Math.sin(a) * (LIB.apothem + 6), LIB.center.z - Math.cos(a) * (LIB.apothem + 6), 1.1]); } // north/east of the library
  const cy = new THREE.InstancedMesh(cyGeo, cyMat, cyPts.length);
  cyPts.forEach(([x, z, s], i) => { mtx.compose(V(x, 0, z), Q.setFromEuler(E.set(0, T.rand() * 6, 0)), V(s, s * (0.9 + T.rand() * 0.3), s)); cy.setMatrixAt(i, mtx); box(1.2, 3, 1.2, x, 1.5, z); });
  group.add(cy);

  // ---------- branched maples ----------
  const maples = buildMaples(m, [
    [BIG_TREE.x, BIG_TREE.z, 1.5], [-20, 17, 1.1], [12, -20, 1.0], [47, -24, 1.1], [-9, -24, 1.0], [37, 30, 1.1], [-13, 26, 0.95], [6, 24, 1.0],
  ]);
  group.add(maples.group); maples.trunks.forEach(([x, z]) => box(0.7, 3, 0.7, x, 1.5, z));

  // ---------- flower beds in many colours ----------
  const beds: [number, number, number, number, string[]][] = [
    // x, z, radiusX, radiusZ, palette
    [...pxz(pw / 2 + cop + 2.8, -6), 1.6, 1.0, ['#d7263d', '#f46036', '#ffd23f']],
    [...pxz(-pw / 2 - cop - 2.8, 5), 1.6, 1.0, ['#7b2cbf', '#c77dff', '#f1e9ff']],
    [...pxz(0, -pl / 2 - cop - 3.4), 2.4, 1.1, ['#ff5d8f', '#ffd6e0', '#ffffff', '#ff97b7']],
    [...pxz(0, pl / 2 + cop + 3.4), 2.4, 1.1, ['#3a86ff', '#8ecae6', '#ffffff']],
    [22, -10, 2.4, 1.0, ['#ffbe0b', '#fb5607', '#ff006e']],
    [19, 4.5, 2.4, 1.0, ['#8338ec', '#3a86ff', '#e0aaff']],
    [LIB.center.x + 3.5, LIB.center.z + 9.4, 2.4, 1.0, ['#e63946', '#f4a261', '#ffe8a3']],
    [LIB.center.x + 9.6, LIB.center.z + 1.5, 1.2, 2.2, ['#ff70a6', '#ff9770', '#ffd670']],
    [-5, 18.5, 2.8, 1.1, ['#b5179e', '#f72585', '#ffffff']],
    [-18.5, 5, 1.2, 2.6, ['#4361ee', '#4cc9f0', '#f8f9fa']],
    [-13, -13.5, 1.5, 2.4, ['#ffb703', '#fb8500', '#ffffff']],
  ];
  group.add(buildFlowers(beds));

  // ---------- reserved portal sites (future links to other worlds): a gravel pad and a dormant labradorite ring ----------
  for (const p of PORTAL_SITES) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), m.gravel); pad.rotation.x = -Math.PI / 2; pad.position.set(p.x, -0.003, p.z); group.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 10, 64), m.labradoriteDark); ring.rotation.x = Math.PI / 2; ring.position.set(p.x, 0.1, p.z); group.add(ring);
    const inlay = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.03, 6, 64), m.gilt); inlay.rotation.x = Math.PI / 2; inlay.position.set(p.x, 0.02, p.z); group.add(inlay);
  }

  // ---------- distant hills + far forest ----------
  group.add(new THREE.Mesh(hillRing(), new THREE.MeshStandardMaterial({ color: 0x0a1411, roughness: 1, side: THREE.DoubleSide })));
  const far = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 9, 7), new THREE.MeshStandardMaterial({ color: 0x0c1a14, roughness: 1 }), 220);
  for (let i = 0; i < 220; i++) {
    const a = T.rand() * Math.PI * 2, r = 62 + T.rand() * 55, s = 0.7 + T.rand() * 1.1;
    mtx.compose(V(11 + Math.cos(a) * r, 4 * s, Math.sin(a) * r), Q.identity(), V(s, s, s)); far.setMatrixAt(i, mtx);
  }
  group.add(far);

  // boundary (invisible)
  box(1, 3, 110, -42, 1.5, 3); box(1, 3, 110, 68, 1.5, 3); box(112, 3, 1, 13, 1.5, -46); box(112, 3, 1, 13, 1.5, 52);

  // moon + ambient
  const moon = new THREE.DirectionalLight(0xa9c2ff, 0.55); moon.position.set(-30, 40, -20); group.add(moon); lights.push(moon);
  const hemi = new THREE.HemisphereLight(0x3b7f78, 0x0a120e, 0.35); group.add(hemi); lights.push(hemi);
  const poolLight = new THREE.PointLight(0xffc58a, 26, 16, 2); poolLight.position.copy(POOL.center).setY(2.6); group.add(poolLight); lights.push(poolLight);

  /** Evo's white colonnade design, kept as a garden folly south of the Hall. */
  const placeColonnade = (scene: THREE.Object3D) => {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xece5d6, roughness: 0.32, clearcoat: 0.3, envMapIntensity: 0.9 });
    scene.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) mesh.material = mat; });
    scene.scale.setScalar(9);
    // kept off the drawn plan: south of the Hall, facing north across the lawn
    scene.rotation.y = Math.PI;
    scene.position.set(0, 0, 33);
    group.add(scene);
    box(9.5, 3, 1, 0, 1.5, 37.3);
  };

  const update = (t: number, reduced: boolean) => {
    if (!reduced) { wn.offset.set(t * 0.004, t * 0.01); maples.sway(t); }
  };
  return { group, colliders, water, waterReflector, glows, lights, benches, placeColonnade, update };
}

/** Procedural branched maples: merged bark geometry + instanced leaf clusters in autumn and summer tones. */
function buildMaples(m: Mats, spots: [number, number, number][]) {
  const group = new THREE.Group(); group.name = 'Maples';
  const bark = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.92, map: m.walnut.map ?? null });
  const barkGeos: THREE.BufferGeometry[] = [];
  const leafSpots: { p: THREE.Vector3; s: number; tree: number }[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const seg = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => {
    const len = a.distanceTo(b); const g = new THREE.CylinderGeometry(r1, r0, len, 7, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    g.translate(a.x, a.y, a.z); barkGeos.push(g);
  };
  const grow = (tree: number, from: THREE.Vector3, d: THREE.Vector3, len: number, r: number, depth: number) => {
    const mid = from.clone().addScaledVector(d, len * 0.5).add(V((T.rand() - 0.5) * 0.25 * len, 0, (T.rand() - 0.5) * 0.25 * len));
    const end = mid.clone().addScaledVector(d, len * 0.5);
    seg(from, mid, r, r * 0.85); seg(mid, end, r * 0.85, r * 0.7);
    if (depth === 0 || r < 0.03) { leafSpots.push({ p: end, s: 0.9 + T.rand() * 0.5, tree }); return; }
    const kids = depth > 2 ? 2 : 3;
    for (let k = 0; k < kids; k++) {
      const yaw = T.rand() * Math.PI * 2, tilt = 0.45 + T.rand() * 0.45;
      const nd = d.clone().applyAxisAngle(new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)), tilt).normalize();
      nd.y = Math.max(nd.y, 0.18); nd.normalize();
      grow(tree, end, nd, len * (0.66 + T.rand() * 0.12), r * 0.62, depth - 1);
    }
    if (depth <= 2) leafSpots.push({ p: end, s: 0.7 + T.rand() * 0.4, tree });
  };
  const trunks: [number, number][] = [];
  spots.forEach(([x, z, s], i) => {
    trunks.push([x, z]);
    const base = V(x, 0, z);
    const top = base.clone().add(V(0, 1.8 * s, 0)); // trunk splits low, like a field maple
    seg(base, top, 0.26 * s, 0.2 * s);
    for (let k = 0; k < 3; k++) {
      const yaw = (k / 3) * Math.PI * 2 + T.rand();
      const d = V(Math.cos(yaw) * 0.55, 1, Math.sin(yaw) * 0.55).normalize();
      grow(i, top, d, 1.9 * s, 0.15 * s, 3);
    }
  });
  group.add(new THREE.Mesh(mergeGeometries(barkGeos), bark));
  barkGeos.forEach(g => g.dispose());

  const palettes = [
    ['#b3261e', '#d7442a', '#8e1b16', '#e0622f'], // crimson maple
    ['#e0782c', '#f2a03d', '#c95a1c', '#f7c04a'], // orange / amber
    ['#3f6b35', '#58843f', '#2f5229', '#7a9a45'], // summer green
  ];
  // leaf clusters: crossed cards carrying a painted spray of maple leaves (alpha-tested), tinted per instance
  const per = 4;
  const card = mergeGeometries([0, 1, 2].map(i => { const g = new THREE.PlaneGeometry(1.25, 1.25); g.rotateY((i / 3) * Math.PI); if (i === 2) g.rotateX(Math.PI / 2); return g; }));
  const leafMat = new THREE.MeshStandardMaterial({ map: mapleLeafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, emissive: 0x1a0a06, emissiveIntensity: 0.5 });
  const leaves = new THREE.InstancedMesh(card, leafMat, leafSpots.length * per);
  const base: THREE.Matrix4[] = [];
  let n = 0;
  for (const L of leafSpots) {
    const pal = palettes[L.tree % palettes.length];
    for (let k = 0; k < per; k++) {
      const off = V((T.rand() - 0.5) * 1.2, (T.rand() - 0.2) * 0.8, (T.rand() - 0.5) * 1.2).multiplyScalar(L.s);
      const sc = (0.75 + T.rand() * 0.6) * L.s;
      mtx.compose(L.p.clone().add(off), Q.setFromEuler(E.set((T.rand() - 0.5) * 0.6, T.rand() * 6.3, (T.rand() - 0.5) * 0.6)), V(sc, sc, sc));
      leaves.setMatrixAt(n, mtx); base.push(mtx.clone());
      leaves.setColorAt(n, new THREE.Color(pal[Math.floor(T.rand() * pal.length)]).multiplyScalar(0.85 + T.rand() * 0.3)); n++;
    }
  }
  leaves.count = n; leaves.userData.keep = true; group.add(leaves);
  // fallen leaves under the autumn trees
  const fall = new THREE.InstancedMesh(new THREE.CircleGeometry(0.06, 5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), spots.length * 70);
  let f = 0;
  spots.forEach(([x, z, s], i) => {
    if (i % 3 === 2) return;
    const pal = palettes[i % 3];
    for (let k = 0; k < 70; k++) {
      const a = T.rand() * Math.PI * 2, r = Math.sqrt(T.rand()) * 3.2 * s;
      mtx.compose(V(x + Math.cos(a) * r, 0.01 + T.rand() * 0.01, z + Math.sin(a) * r), Q.setFromEuler(E.set(0, T.rand() * 6, 0)), V(1, 1, 1.6));
      fall.setMatrixAt(f, mtx); fall.setColorAt(f, new THREE.Color(pal[k % pal.length]).multiplyScalar(0.6)); f++;
    }
  });
  fall.count = f; group.add(fall);

  const tmp = new THREE.Matrix4(), rot = new THREE.Matrix4();
  let last = -1;
  const sway = (t: number) => {
    if (t - last < 1 / 20) return; last = t; // 20 Hz is plenty for a breeze
    for (let i = 0; i < n; i++) { rot.makeRotationZ(Math.sin(t * 0.9 + i * 0.37) * 0.035); tmp.copy(base[i]).multiply(rot); leaves.setMatrixAt(i, tmp); }
    leaves.instanceMatrix.needsUpdate = true;
  };
  return { group, trunks, sway };
}

/** Elliptical beds: a dark leafy mound with stems and many small blossoms. */
function buildFlowers(beds: [number, number, number, number, string[]][]) {
  const group = new THREE.Group(); group.name = 'Flowers';
  const total = beds.reduce((s, b) => s + Math.round(b[2] * b[3] * 90), 0);
  const blossomGeo = new THREE.IcosahedronGeometry(0.05, 0); blossomGeo.scale(1, 0.55, 1);
  const bl = new THREE.InstancedMesh(blossomGeo, new THREE.MeshStandardMaterial({ roughness: 0.7, emissive: 0x1a1016, emissiveIntensity: 0.5 }), total);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.006, 0.008, 1, 3, 1, true).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 0.9 }), total);
  const mound = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: T.grass(256), color: 0x4c7a45, roughness: 0.95 }), beds.length);
  const soil = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 1 }), beds.length);
  let n = 0;
  beds.forEach(([x, z, rx, rz, pal], bi) => {
    mtx.compose(V(x, -0.03, z), Q.identity(), V(rx * 0.95, 0.22, rz * 0.95)); mound.setMatrixAt(bi, mtx);
    mtx.compose(V(x, 0.003, z), Q.identity(), V(rx + 0.15, 1, rz + 0.15)); soil.setMatrixAt(bi, mtx);
    const cols = pal.map(c => new THREE.Color(c));
    const cnt = Math.round(rx * rz * 90);
    for (let i = 0; i < cnt; i++) {
      const a = T.rand() * Math.PI * 2, r = Math.sqrt(T.rand());
      const px = x + Math.cos(a) * r * rx, pz = z + Math.sin(a) * r * rz;
      const h = 0.18 + (1 - r) * 0.22 + T.rand() * 0.15;
      mtx.compose(V(px, 0, pz), Q.identity(), V(1, h, 1)); stems.setMatrixAt(n, mtx);
      const s = 0.7 + T.rand() * 0.8;
      mtx.compose(V(px, h, pz), Q.setFromEuler(E.set(0, T.rand() * 6, 0)), V(s, s, s)); bl.setMatrixAt(n, mtx);
      bl.setColorAt(n, cols[Math.floor(T.rand() * cols.length)]); n++;
    }
  });
  bl.count = stems.count = n;
  group.add(soil, mound, stems, bl);
  return group;
}

function hillRing() {
  const segs = 180, rings = 3;
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const r = 140 + j * 50;
    const h = j === 0 ? -2 : (T.fbm(i / segs * 12, j * 0.7, 4, 12) * 38 - 6) * (j / rings) + j * 4;
    pos.push(11 + Math.cos(a) * r, h, Math.sin(a) * r);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i, b = a + segs + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** A transparent spray of small five-lobed leaves in light tones, so instance colours tint it (crimson, amber, green). */
function mapleLeafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  const leaf = (x: number, y: number, r: number, a: number, shade: number) => {
    g.save(); g.translate(x, y); g.rotate(a); g.beginPath();
    for (let i = 0; i <= 10; i++) { const ang = -Math.PI / 2 + (i / 10) * Math.PI * 2; const rr = i % 2 ? r * 0.42 : r * (i === 0 || i === 10 ? 1 : i === 4 || i === 6 ? 0.7 : 0.9); g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
    g.closePath(); const v = Math.round(200 + shade * 55); g.fillStyle = `rgb(${v},${v},${v})`; g.fill();
    g.strokeStyle = 'rgba(90,70,60,0.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, r * 0.9); g.lineTo(0, -r * 0.6); g.stroke(); g.restore();
  };
  for (let i = 0; i < 70; i++) { const a = T.rand() * Math.PI * 2, d = Math.sqrt(T.rand()) * 104; leaf(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 13 + T.rand() * 9, T.rand() * 6.3, T.rand()); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
