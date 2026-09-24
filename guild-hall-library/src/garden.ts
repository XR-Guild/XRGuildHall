import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { Mats } from './mats';
import * as T from './tex';

export const POOL = { x0: -2.5, x1: 2.5, z0: 14, z1: 42 };
export const COLONNADE_Z = 49;

export interface GardenBuilt {
  group: THREE.Group;
  colliders: THREE.Group;
  water: THREE.Mesh;
  waterReflector: Reflector | null;
  glows: THREE.Sprite[];
  lights: THREE.Light[];
  placeColonnade: (scene: THREE.Object3D) => void;
  update: (t: number, reduced: boolean) => void;
}

export function buildGarden(m: Mats, skyCube: THREE.Texture, desktopReflections: boolean): GardenBuilt {
  const group = new THREE.Group(); group.name = 'Garden';
  const colliders = new THREE.Group();
  const glows: THREE.Sprite[] = [];
  const lights: THREE.Light[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); c.position.set(x, y, z); colliders.add(c); };

  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), m.grass); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; group.add(ground);
  box(160, 0.2, 160, 0, -0.12, 10);
  // gravel ring terrace + paths
  const ring = new THREE.Mesh(new THREE.RingGeometry(9.3, 12.6, 96), m.gravel); ring.rotation.x = -Math.PI / 2; ring.position.y = -0.005; group.add(ring);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3), m.gravel); path.rotation.x = -Math.PI / 2; path.position.set(0, -0.004, 13.2); group.add(path);
  for (const s of [-1, 1]) {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(2.2, POOL.z1 - POOL.z0 + 4), m.gravel); walk.rotation.x = -Math.PI / 2; walk.position.set(s * 4.0, -0.004, (POOL.z0 + POOL.z1) / 2); group.add(walk);
  }

  // reflecting pool: marble coping + dark water with sky reflections
  const pw = POOL.x1 - POOL.x0, pl = POOL.z1 - POOL.z0, pcz = (POOL.z0 + POOL.z1) / 2;
  const cop = 0.4;
  const coping = [
    [pw + cop * 2, cop, 0, POOL.z0 - cop / 2], [pw + cop * 2, cop, 0, POOL.z1 + cop / 2],
    [cop, pl, POOL.x0 - cop / 2, pcz], [cop, pl, POOL.x1 + cop / 2, pcz],
  ];
  for (const [w, d, x, z] of coping) { const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), m.marble); c.position.set(x, 0.08, z); group.add(c); }
  const basin = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.4, pl), new THREE.MeshStandardMaterial({ color: 0x050a0c, roughness: 1 })); basin.position.set(0, -0.2, pcz); group.add(basin);
  box(pw + 1, 2.2, pl + 1, 0, 1.0, pcz);
  const wn = T.waterNormal(256); wn.repeat.set(3, 12);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(pw, pl, 1, 1), new THREE.MeshPhysicalMaterial({
    color: 0x02080a, roughness: 0.03, metalness: 0.0, envMap: skyCube, envMapIntensity: 1.6, normalMap: wn, normalScale: new THREE.Vector2(0.12, 0.12), clearcoat: 1.0, clearcoatRoughness: 0.02,
  }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.06, pcz); water.userData.keep = true; group.add(water);
  let waterReflector: Reflector | null = null;
  if (desktopReflections) {
    waterReflector = new Reflector(new THREE.PlaneGeometry(pw, pl), { textureWidth: 1024, textureHeight: 1024, color: 0x8a9aa0, clipBias: 0.003 });
    waterReflector.userData.keep = true; waterReflector.rotation.x = -Math.PI / 2; waterReflector.position.set(0, 0.055, pcz);
    group.add(waterReflector);
    // water sits on top as a thin tinted, rippled film
    const wm = water.material as THREE.MeshPhysicalMaterial; wm.transparent = true; wm.opacity = 0.45; wm.depthWrite = false;
    water.renderOrder = 3;
  }

  // hedges (instanced boxes) along both walks
  const hedgeGeo = new THREE.BoxGeometry(1, 1, 1);
  const hedgeCount = 2 * 7;
  const hedges = new THREE.InstancedMesh(hedgeGeo, m.hedge, hedgeCount);
  const mtx = new THREE.Matrix4(); let hi = 0;
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const z = POOL.z0 + 1 + i * 4.1;
    mtx.compose(new THREE.Vector3(s * 5.6, 0.55, z + 1.6), new THREE.Quaternion(), new THREE.Vector3(1.0, 1.1, 3.4));
    hedges.setMatrixAt(hi++, mtx); box(1.1, 2, 3.5, s * 5.6, 1, z + 1.6);
  }
  group.add(hedges);

  // cypress trees
  const cyGeo = new THREE.LatheGeometry([[0, 0], [0.45, 0.4], [0.7, 1.6], [0.65, 3.2], [0.4, 4.6], [0.08, 5.6], [0, 5.7]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const cyMat = new THREE.MeshStandardMaterial({ map: T.grass(256), color: 0x4f7552, roughness: 0.95 });
  const cy = new THREE.InstancedMesh(cyGeo, cyMat, 40); let ci = 0;
  const addTree = (x: number, z: number, s = 1) => { mtx.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, T.rand() * 6, 0)), new THREE.Vector3(s, s * (0.9 + T.rand() * 0.3), s)); cy.setMatrixAt(ci++, mtx); };
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) addTree(s * 7.6, POOL.z0 + i * 4.1, 1);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.26; if (Math.abs(Math.sin(a)) < 0.3 && Math.cos(a) < 0) continue; addTree(Math.sin(a) * 15, -Math.cos(a) * 15, 1.25); }
  cy.count = ci; group.add(cy);

  // flower beds: small instanced blossoms between coping and walks
  const blossomGeo = new THREE.IcosahedronGeometry(0.04, 1);
  const bl = new THREE.InstancedMesh(blossomGeo, new THREE.MeshStandardMaterial({ roughness: 0.8, emissive: 0x221a2a, emissiveIntensity: 0.4 }), 900);
  const flowerCols = ['#b7a4e6', '#efe8f4', '#d98fb0', '#8f79c9', '#f2d7a8'].map(c => new THREE.Color(c));
  for (let i = 0; i < 900; i++) {
    const s = i % 2 ? 1 : -1;
    const x = s * (2.95 + T.rand() * 0.9), z = POOL.z0 + T.rand() * pl;
    mtx.compose(new THREE.Vector3(x, 0.1 + T.rand() * 0.25, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1).multiplyScalar(0.6 + T.rand() * 0.8));
    bl.setMatrixAt(i, mtx); bl.setColorAt(i, flowerCols[Math.floor(T.rand() * flowerCols.length)]);
  }
  group.add(bl);

  // lanterns
  const glowTex = T.glow('255,210,150');
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    const z = POOL.z0 + 1.5 + i * 5.2;
    const l = new THREE.Group(); l.position.set(s * 3.0, 0, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.3, 10), m.blackMetal); post.position.y = 0.65; l.add(post);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.12, 12), m.giltSatin); cap.position.y = 1.62; l.add(cap);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), m.emissiveWarm); globe.position.y = 1.45; l.add(globe);
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd39a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    g.scale.setScalar(1.3); g.position.y = 1.45; l.add(g); glows.push(g);
    group.add(l);
  }

  // marble benches by the pool (Gardens punch-list item)
  for (const sx of [-1, 1]) for (const bz of [POOL.z0 + 8.2, POOL.z0 + 18.6]) {
    const b = new THREE.Group(); b.position.set(sx * 4.55, 0, bz); b.rotation.y = sx * Math.PI / 2;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.5), m.marble); seat.position.y = 0.46; b.add(seat);
    for (const lx of [-0.72, 0.72]) { const leg = new THREE.Mesh(new THREE.LatheGeometry([[0.14, 0], [0.16, 0.04], [0.09, 0.14], [0.08, 0.32], [0.15, 0.42], [0, 0.42]].map(([r, y]) => new THREE.Vector2(r, y)), 16), m.marble); leg.position.set(lx, 0, 0); leg.scale.z = 1.4; b.add(leg); }
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.012, 0.04), m.gilt); inlay.position.set(0, 0.51, 0.2); b.add(inlay);
    group.add(b);
    box(0.6, 1, 2.0, sx * 4.55, 0.5, bz);
  }

  // distant hills silhouette
  const hills = new THREE.Mesh(hillRing(), new THREE.MeshStandardMaterial({ color: 0x0a1411, roughness: 1, side: THREE.DoubleSide }));
  group.add(hills);
  const far = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 9, 7), new THREE.MeshStandardMaterial({ color: 0x0c1a14, roughness: 1 }), 220);
  for (let i = 0; i < 220; i++) {
    const a = T.rand() * Math.PI * 2, r = 60 + T.rand() * 55;
    const s = 0.7 + T.rand() * 1.1;
    mtx.compose(new THREE.Vector3(Math.cos(a) * r, 4 * s, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    far.setMatrixAt(i, mtx);
  }
  group.add(far);

  // boundary (invisible)
  box(1, 3, 110, -32, 1.5, 10); box(1, 3, 110, 32, 1.5, 10); box(64, 3, 1, 0, 1.5, -40); box(64, 3, 1, 0, 1.5, 60);

  // moon + ambient
  const moon = new THREE.DirectionalLight(0xa9c2ff, 0.55); moon.position.set(-30, 40, -20); group.add(moon); lights.push(moon);
  const hemi = new THREE.HemisphereLight(0x3b7f78, 0x0a120e, 0.35); group.add(hemi); lights.push(hemi);
  const colLight = new THREE.PointLight(0xffc58a, 40, 22, 2); colLight.position.set(0, 2.2, COLONNADE_Z - 1); group.add(colLight); lights.push(colLight);

  const placeColonnade = (scene: THREE.Object3D) => {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xece5d6, roughness: 0.32, clearcoat: 0.3, envMapIntensity: 0.9 });
    scene.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { mesh.material = mat; } });
    scene.scale.setScalar(12);
    scene.rotation.y = Math.PI;
    scene.position.set(0, 0, COLONNADE_Z);
    group.add(scene);
    box(12, 3, 1, 0, 1.5, COLONNADE_Z + 5.6);
  };

  const update = (t: number, reduced: boolean) => {
    if (!reduced) { wn.offset.set(t * 0.004, t * 0.01); }
  };
  return { group, colliders, water, waterReflector, glows, lights, placeColonnade, update };
}

function hillRing() {
  const segs = 180, rings = 3;
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const r = 140 + j * 50;
    const h = j === 0 ? -2 : (T.fbm(i / segs * 12, j * 0.7, 4, 12) * 38 - 6) * (j / rings) + j * 4;
    pos.push(Math.cos(a) * r, h, Math.sin(a) * r);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i, b = a + segs + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
