// Arrival.space export: rebuilds the Guild Hall world and writes it out as movable GLB pieces.
// Each piece is baked around its own pivot (its placement point), so moving it in the Arrival editor
// moves it the way you'd expect. Run with scratch/export.mjs (Playwright + vite dev server).
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeMats } from './mats';
import * as T from './tex';
import { buildChamber, type BayKind } from './chamber';
import { buildGrandHall } from './grandhall';
import { buildColonnade } from './walk';
import { buildTable } from './table';
import {
  buildPool, poolLantern, gardenBench, cypressParts, portalPad, buildMaples, buildFlowers, hillRing,
  CYPRESS_SPOTS, MAPLE_SPOTS, FLOWER_BEDS, POOL_LANTERNS, POOL_COPING,
} from './garden';
import { buildLibraryInterior } from './library3d';
import { buildStage, buildWelcomeDesk, buildEventsBoard, bannerTexture } from './hallfeatures';
import { hallLayout, libLayout, benchMeshes, chairGeometries, onArc, face } from './seating';
import { newsPanel, libraryPanel, timelinePanel } from './xrpanels';
import { HALL, LIB, STAGE, POOL, BENCHES, PORTAL_SITES, PATH_CURVE, SPAWN, V } from './site';

const FONTS = {
  display: "'Marcellus SC', Georgia, serif",
  body: "'Alegreya Sans', 'Gill Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

export interface Placement { label: string; asset: string; position: [number, number, number]; rotationY: number; scale: [number, number, number]; group: string; }
export interface AssetOut { file: string; bytes: number; triangles: number; collision?: string; }

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const deg = (r: number) => r3(THREE.MathUtils.radToDeg(r));

// ---------- geometry + material baking ----------
const normalCache = new Map<unknown, THREE.Texture>();
/** glTF has no bump maps: turn a bump (height) texture into a tangent-space normal map. */
function bumpToNormal(bump: THREE.Texture, strength: number) {
  const key = bump.image; if (normalCache.has(key)) return normalCache.get(key)!;
  const img = bump.image as HTMLCanvasElement; const w = img.width, h = img.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0); const src = g.getImageData(0, 0, w, h).data; const out = g.createImageData(w, h);
  const H = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const n = new THREE.Vector3(-dx, dy, 1).normalize(); const i = (y * w + x) * 4;
    out.data[i] = (n.x * 0.5 + 0.5) * 255; out.data[i + 1] = (n.y * 0.5 + 0.5) * 255; out.data[i + 2] = (n.z * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData.mimeType = 'image/jpeg';
  normalCache.set(key, t); return t;
}

const TEX_SLOTS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'clearcoatMap', 'sheenColorMap'] as const;
const matCache = new Map<THREE.Material, THREE.Material>();
/** A glTF-safe copy of the material: texture transforms reset (they're baked into UVs), bump → normal map. */
function exportMaterial(src: THREE.Material, vertexColors: boolean): THREE.Material {
  const key = src; const hit = matCache.get(key);
  if (hit && (hit as any).vertexColors === vertexColors) return hit;
  const m = (src as THREE.MeshStandardMaterial).clone() as any;
  if (m.bumpMap) { if (!m.normalMap) { m.normalMap = bumpToNormal(m.bumpMap, 2.5 * (m.bumpScale ?? 1)); m.normalScale = new THREE.Vector2(1, 1); } m.bumpMap = null; }
  for (const k of TEX_SLOTS) {
    const t: THREE.Texture | null = m[k]; if (!t) continue;
    const c = t.clone(); c.offset.set(0, 0); c.repeat.set(1, 1); c.rotation = 0; c.center.set(0, 0);
    const transparent = m.transparent || m.alphaTest > 0;
    c.userData = { ...c.userData, mimeType: k === 'map' && transparent ? 'image/png' : 'image/jpeg' };
    m[k] = c;
  }
  m.envMap = null; m.vertexColors = vertexColors;
  if (m.side === THREE.BackSide) m.side = THREE.FrontSide;
  if (!m.name) m.name = (src.name || src.type).replace('Mesh', '');
  matCache.set(key, m); return m;
}

function uvMatrix(mat: THREE.Material): THREE.Matrix3 | null {
  const t: THREE.Texture | null = (mat as any).map ?? (mat as any).normalMap ?? (mat as any).bumpMap ?? (mat as any).emissiveMap ?? null;
  if (!t) return null;
  if (t.repeat.x === 1 && t.repeat.y === 1 && t.offset.x === 0 && t.offset.y === 0 && t.rotation === 0) return null;
  t.updateMatrix(); return t.matrix.clone();
}

function prepGeometry(src: THREE.BufferGeometry, world: THREE.Matrix4, mat: THREE.Material, color: THREE.Color | null) {
  let g = src.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {}; g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.applyMatrix4(world);
  const back = mat.side === THREE.BackSide;
  if (back) { const n = g.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
  if ((world.determinant() < 0) !== back) { g = g.index ? g.toNonIndexed() : g; const p = g.attributes; for (const a of Object.values(p)) { const arr = a.array as Float32Array, s = a.itemSize; for (let i = 0; i < a.count; i += 3) for (let k = 0; k < s; k++) { const t = arr[(i + 1) * s + k]; arr[(i + 1) * s + k] = arr[(i + 2) * s + k]; arr[(i + 2) * s + k] = t; } } }
  const um = uvMatrix(mat);
  if (um) { const uv = g.attributes.uv as THREE.BufferAttribute; const v = new THREE.Vector2(); for (let i = 0; i < uv.count; i++) { v.fromBufferAttribute(uv, i).applyMatrix3(um); uv.setXY(i, v.x, v.y); } }
  if (color) { const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
  return g;
}

/** Everything under `root`, relative to `pivot`/`rotY`, merged into one mesh per material. */
function flatten(root: THREE.Object3D, pivot: THREE.Vector3, rotY: number, name: string) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().compose(pivot, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1)).invert();
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; colored: boolean }>();
  const push = (mat: THREE.Material, g: THREE.BufferGeometry) => { let b = buckets.get(mat); if (!b) buckets.set(mat, b = { geos: [], colored: false }); if (g.attributes.color) b.colored = true; b.geos.push(g); };
  const visible = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) { if (!p.visible) return false; if (p === root) break; } return true; };
  const im = new THREE.Matrix4(), w = new THREE.Matrix4(), col = new THREE.Color();
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (o as any).isReflector || !visible(o)) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!mat || !mat.visible || (mat as any).isShaderMaterial || (mat as any).colorWrite === false || ((mat as any).opacity === 0 && mat.transparent)) return;
    const base = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, im); w.multiplyMatrices(base, im);
        const c = inst.instanceColor ? (inst.getColorAt(i, col), col.clone()) : null;
        push(mat, prepGeometry(inst.geometry, w, mat, c));
      }
    } else push(mat, prepGeometry(mesh.geometry, base, mat, null));
  });
  const out = new THREE.Group(); out.name = name; let tris = 0;
  for (const [mat, b] of buckets) {
    const geos = b.geos.map(g => {
      if (b.colored && !g.attributes.color) { const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); }
      return g.index ? g.toNonIndexed() : g;
    });
    let merged = mergeGeometries(geos); geos.forEach(g => g.dispose());
    if (!merged) continue;
    merged = mergeVertices(merged, 1e-4);
    tris += (merged.index ? merged.index.count : merged.attributes.position.count) / 3;
    const mesh = new THREE.Mesh(merged, exportMaterial(mat, b.colored)); mesh.name = `${name}_${(mat.name || mat.type).replace(/\s+/g, '')}`;
    out.add(mesh);
  }
  return { group: out, tris: Math.round(tris) };
}

/** Collision boxes/cones → one plain mesh (no textures) for Arrival's collisionUrl. */
function flattenCollision(root: THREE.Object3D, pivot: THREE.Vector3, rotY: number, name: string) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().compose(pivot, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1)).invert();
  const geos: THREE.BufferGeometry[] = [];
  root.traverse(o => { const mesh = o as THREE.Mesh; if (!mesh.isMesh) return; const g = mesh.geometry.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); g.clearGroups(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)); geos.push(g.index ? g.toNonIndexed() : g); });
  const merged = mergeVertices(mergeGeometries(geos)!, 1e-4); merged.computeVertexNormals();
  const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: 0xff00ff })); mesh.name = name;
  const g = new THREE.Group(); g.name = name; g.add(mesh); return g;
}

async function glb(obj: THREE.Object3D): Promise<ArrayBuffer> {
  return await new GLTFExporter().parseAsync(obj, { binary: true, maxTextureSize: 2048, onlyVisible: true }) as ArrayBuffer;
}
function b64(buf: ArrayBuffer) {
  const u = new Uint8Array(buf); let s = ''; const CH = 0x8000;
  for (let i = 0; i < u.length; i += CH) s += String.fromCharCode(...u.subarray(i, i + CH));
  return btoa(s);
}

// ---------- the world, piece by piece ----------
export async function runExport(save: (name: string, base64: string) => Promise<void>, log: (s: string) => void) {
  const m = makeMats();
  const assets: Record<string, AssetOut> = {};
  const placements: Placement[] = [];

  const writeAsset = async (key: string, root: THREE.Object3D, pivot = V(0, 0, 0), rotY = 0, colliders?: THREE.Object3D) => {
    if (assets[key]) return;
    const { group, tris } = flatten(root, pivot, rotY, key);
    const buf = await glb(group); await save(`assets/${key}.glb`, b64(buf));
    const a: AssetOut = { file: `assets/${key}.glb`, bytes: buf.byteLength, triangles: tris };
    if (colliders) { const cb = await glb(flattenCollision(colliders, pivot, rotY, `${key}-collision`)); await save(`assets/${key}-collision.glb`, b64(cb)); a.collision = `assets/${key}-collision.glb`; }
    assets[key] = a; log(`${key}: ${(buf.byteLength / 1048576).toFixed(2)} MB, ${tris} tris`);
  };
  const place = (label: string, asset: string, group: string, p: THREE.Vector3, rotY = 0, scale: [number, number, number] = [1, 1, 1]) =>
    placements.push({ label, asset, group, position: [r3(p.x), r3(p.y), r3(p.z)], rotationY: deg(rotY), scale });
  const apron = (c: THREE.Vector3, a: number) => { const ring = new THREE.Mesh(new THREE.RingGeometry(a + 0.3, a + 2.6, 96), m.gravel); ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, -0.006, c.z); return ring; };

  // --- Guild Hall shell (with the mission banner) ---
  const hall = buildGrandHall(m, HALL.center, ['banner', 'window', 'window', 'door', 'window', 'window', 'window', 'window', 'window', 'window', 'window', 'window'], FONTS.display);
  {
    const mount = hall.bannerMounts.get(0)!;
    const bm = new THREE.MeshStandardMaterial({ map: bannerTexture(FONTS), roughness: 0.8 }); bm.emissiveMap = bm.map; bm.emissive.set(0xffffff); bm.emissiveIntensity = 0.28; bm.name = 'MissionBanner';
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.95, 5.4), bm); banner.position.z = 0.03; mount.add(banner);
  }
  const hallRoot = new THREE.Group(); hallRoot.add(hall.group, apron(HALL.center, HALL.apothem));
  await writeAsset('guild-hall', hallRoot, HALL.center, 0, hall.colliders);
  place('Guild Hall', 'guild-hall', 'Architecture', HALL.center);

  const stage = buildStage(m);
  await writeAsset('hall-stage', stage.group, STAGE.center, 0, stage.colliders);
  place('Stage', 'hall-stage', 'Guild Hall', STAGE.center);

  const noop = () => {}; const notXR = () => false;
  const desk = buildWelcomeDesk(m, FONTS, noop, notXR);
  const deskRot = new THREE.Euler().setFromQuaternion(desk.group.quaternion, 'YXZ').y;
  await writeAsset('welcome-desk', desk.group, desk.group.position.clone(), deskRot, desk.colliders);
  place('Welcome desk', 'welcome-desk', 'Guild Hall', desk.group.position, deskRot);

  const board = buildEventsBoard(m, FONTS, noop, noop, notXR);
  const boardRot = new THREE.Euler().setFromQuaternion(board.group.quaternion, 'YXZ').y;
  await writeAsset('events-board', board.group, board.group.position.clone(), boardRot);
  place('Events board', 'events-board', 'Guild Hall', board.group.position, boardRot);

  // --- proscenium benches: one asset per (row radius, seat count), reused around the arc ---
  const L = hallLayout('proscenium');
  let bi = 0;
  for (const b of L.benches) {
    const mid = (b.a0 + b.a1) / 2, da = b.a1 - b.a0;
    const pivot = onArc(b.r, mid), rotY = face(pivot, STAGE.center);
    const key = `hall-bench-r${b.r.toFixed(1).replace('.', '_')}-${b.seats}`;
    if (!assets[key]) await writeAsset(key, benchMeshes(m, [{ r: b.r, a0: mid - da / 2, a1: mid + da / 2, seats: b.seats }]), pivot, rotY);
    place(`Hall bench ${++bi} (${b.seats} seats)`, key, 'Hall benches', pivot, rotY);
  }

  // --- Library shell, bookcase panels, lanterns ---
  const libBays: BayKind[] = ['window', 'shelf', 'panelShelf', 'panelShelf', 'panelShelf', 'shelf', 'window', 'window', 'shelf', 'door', 'shelf', 'shelf'];
  const lib = buildChamber(m, { name: 'Library', center: LIB.center, apothem: LIB.apothem, wallH: LIB.wallH, bays: libBays, domeMural: T.domeMural(), chandelier: 0.75, fillLights: 2, floorMat: m.floorDark.clone(), sparseBooks: 0.42 });
  const news = newsPanel(FONTS); news.mesh.position.set(0, 0, 0.01); lib.panelMounts.get(2)!.add(news.mesh); news.draw();
  const libp = libraryPanel(FONTS); libp.panel.mesh.position.set(0, 0, 0.01); lib.panelMounts.get(3)!.add(libp.panel.mesh); libp.panel.draw();
  const tlp = timelinePanel(FONTS); tlp.panel.mesh.position.set(0, 0, 0.01); lib.panelMounts.get(4)!.add(tlp.panel.mesh); tlp.panel.draw();
  const libRoot = new THREE.Group(); libRoot.add(lib.group, apron(LIB.center, LIB.apothem));
  await writeAsset('library', libRoot, LIB.center, 0, lib.colliders);
  place('Library', 'library', 'Architecture', LIB.center);

  const libIn = buildLibraryInterior(m, FONTS);
  await writeAsset('library-lanterns', libIn.group, LIB.center, 0);
  place('Library category lanterns', 'library-lanterns', 'Library', LIB.center);

  const table = buildTable(m, FONTS); table.group.position.copy(LIB.center); table.colliders.position.copy(LIB.center);
  await writeAsset('connect-table', table.group, LIB.center, 0, table.colliders);
  place('Connect table', 'connect-table', 'Library', LIB.center);

  {
    const g = chairGeometries(); const chair = new THREE.Group();
    chair.add(new THREE.Mesh(g.wood, m.walnut), new THREE.Mesh(g.vel, m.velvet), new THREE.Mesh(g.gold, m.gilt));
    await writeAsset('library-chair', chair);
    libLayout('table').seats.forEach((s, i) => place(`Library chair ${i + 1}`, 'library-chair', 'Library chairs', s.pos, s.rotY));
  }

  // --- colonnade ---
  const col = buildColonnade(m); const colPivot = PATH_CURVE.getPointAt(0.5).setY(0);
  await writeAsset('colonnade', col.group, colPivot, 0, col.colliders);
  place('Colonnade', 'colonnade', 'Architecture', colPivot);

  // --- garden ---
  const pool = buildPool(m, null, false);
  const poolCol = new THREE.Group(); { const c = new THREE.Mesh(new THREE.BoxGeometry(POOL.width + POOL_COPING * 2, 2.2, POOL.length + POOL_COPING * 2)); c.position.y = 1.0; poolCol.add(c); }
  await writeAsset('reflecting-pool', pool.group, V(0, 0, 0), 0, poolCol);
  place('Reflecting pool', 'reflecting-pool', 'Garden', POOL.center, POOL.rotY);

  await writeAsset('garden-bench', gardenBench(m));
  BENCHES.forEach((p, i) => place(`Garden bench ${i + 1}`, 'garden-bench', 'Garden benches', p, Math.atan2(POOL.center.x - p.x, POOL.center.z - p.z)));

  await writeAsset('garden-lantern', poolLantern(m, T.glow('255,210,150')).group);
  POOL_LANTERNS().forEach((p, i) => place(`Pool lantern ${i + 1}`, 'garden-lantern', 'Garden lanterns', p));

  await writeAsset('portal-pad', portalPad(m));
  PORTAL_SITES.forEach((p, i) => place(`Portal site ${i + 1}`, 'portal-pad', 'Portal sites', p));

  { const { geo, mat } = cypressParts(); mat.name = 'Cypress'; await writeAsset('cypress', new THREE.Mesh(geo, mat)); }
  CYPRESS_SPOTS.forEach(([x, z, s], i) => place(`Cypress ${i + 1}`, 'cypress', 'Trees', V(x, 0, z), (i * 2.39996) % (Math.PI * 2), [s, r3(s * (0.95 + (i % 4) * 0.08)), s]));

  for (let i = 0; i < MAPLE_SPOTS.length; i++) {
    const [x, z, s] = MAPLE_SPOTS[i];
    const tree = buildMaples(m, [[0, 0, s]], i);
    // keep each tree's colour family from the full world (crimson, amber, green by index)
    const key = `maple-${i + 1}`; await writeAsset(key, tree.group);
    place(`Maple ${i + 1}`, key, 'Trees', V(x, 0, z));
  }
  for (let i = 0; i < FLOWER_BEDS.length; i++) {
    const [x, z, rx, rz, pal] = FLOWER_BEDS[i];
    const key = `flower-bed-${i + 1}`; await writeAsset(key, buildFlowers([[0, 0, rx, rz, pal]]));
    place(`Flower bed ${i + 1}`, key, 'Flower beds', V(x, 0, z));
  }

  // --- lawn and backdrop ---
  {
    const lawn = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), m.grass); ground.rotation.x = -Math.PI / 2; ground.position.set(12, -0.02, 2); lawn.add(ground);
    (m.grass.map as THREE.Texture | null)?.repeat.multiplyScalar(220 / 400);
    const lawnCol = new THREE.Group(); { const c = new THREE.Mesh(new THREE.BoxGeometry(220, 0.2, 220)); c.position.set(12, -0.12, 2); lawnCol.add(c); }
    await writeAsset('lawn', lawn, V(0, 0, 0), 0, lawnCol);
    place('Lawn', 'lawn', 'Grounds', V(0, 0, 0));
    const back = new THREE.Group();
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x0a1411, roughness: 1, side: THREE.DoubleSide }); hillMat.name = 'Hills';
    back.add(new THREE.Mesh(hillRing(), hillMat));
    const far = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 9, 7), Object.assign(new THREE.MeshStandardMaterial({ color: 0x0c1a14, roughness: 1 }), { name: 'FarForest' }), 220);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < 220; i++) { const a = T.rand() * Math.PI * 2, r = 62 + T.rand() * 55, s = 0.7 + T.rand() * 1.1; mtx.compose(V(11 + Math.cos(a) * r, 4 * s, Math.sin(a) * r), new THREE.Quaternion(), V(s, s, s)); far.setMatrixAt(i, mtx); }
    back.add(far);
    await writeAsset('backdrop-hills', back);
    place('Hills and far forest', 'backdrop-hills', 'Grounds', V(0, 0, 0));
  }

  // --- Evo's white colonnade as the garden folly ---
  {
    const scene = await new Promise<THREE.Group | null>(res => new GLTFLoader().load('models/hall.glb', g => res(g.scene), undefined, () => res(null)));
    if (scene) {
      const mat = new THREE.MeshPhysicalMaterial({ color: 0xece5d6, roughness: 0.32, clearcoat: 0.3 }); mat.name = 'WhiteStone';
      scene.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) mesh.material = mat; });
      scene.scale.setScalar(9);
      const root = new THREE.Group(); root.add(scene);
      const fc = new THREE.Group(); { const c = new THREE.Mesh(new THREE.BoxGeometry(9.5, 3, 1)); c.position.set(0, 1.5, -4.3); fc.add(c); }
      await writeAsset('garden-folly', root, V(0, 0, 0), 0, fc);
      place('Garden folly (Evo colonnade)', 'garden-folly', 'Garden', V(0, 0, 33), Math.PI);
    } else log('folly model missing, skipped');
  }

  const manifest = {
    name: 'XR Guild Hall',
    generated: new Date().toISOString(),
    units: 'metres, y up; rotationY in degrees about +y; each asset is baked around its own pivot',
    spawn: { position: SPAWN.pos.toArray().map(r3), lookAt: SPAWN.look.toArray() },
    assets, placements,
  };
  await save('manifest.json', btoa(unescape(encodeURIComponent(JSON.stringify(manifest, null, 2)))));
  log(`done: ${Object.keys(assets).length} assets, ${placements.length} placements`);
  return manifest;
}
