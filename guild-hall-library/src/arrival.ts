import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import type { Seat } from './seating';

/**
 * Arrival.space art layer: the world as Evo built it in Arrival, placed from public/arrival/manifest.json (written by
 * scripts/arrival/make-manifest.mjs from Evo's engine export). Arrival uses the same coordinates as this world.
 * Plugin pieces are static meshes baked from the live Arrival runtime; their behaviour (seal hunt, sitting, sounds)
 * is not part of this layer. Collision meshes come back separately so they can join locomotion.
 */
export interface ArrivalItem {
  name: string; group: string; pos: [number, number, number]; quat: [number, number, number, number]; scale?: [number, number, number];
  file?: string; image?: string; size?: [number, number]; collision?: string;
}
export interface ArrivalManifest { items: ArrivalItem[] }

const BASE = 'arrival/';

/**
 * Remove V3's own geometry where the Arrival art replaces it. Lights stay, and so does everything under `keep`
 * (click targets, the live screen, the stained glass, the animated birds).
 */
export function removeV3(groups: THREE.Object3D[], keep: Iterable<THREE.Object3D>) {
  const kept = new Set(keep);
  const isKept = (o: THREE.Object3D, root: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p && p !== root.parent; p = p.parent) if (kept.has(p)) return true; return false; };
  const drop: THREE.Object3D[] = [];
  for (const g of groups) g.traverse(o => { if (((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) && !isKept(o, g)) drop.push(o); });
  // sprites share one geometry across the whole scene, so only mesh geometry is freed
  for (const o of drop) { o.removeFromParent(); if (!(o as THREE.Sprite).isSprite) (o as THREE.Mesh).geometry?.dispose(); }
  return drop.length;
}

/**
 * Seat points on Evo's furniture, after her sit-anywhere and stage-seating plugins: matched by node name, in that
 * node's own units, as [x, z, turn in degrees]. The sitter faces the node's +Z turned by `turn`.
 */
const SEAT_POINTS: { re: RegExp; pts: [number, number, number][] }[] = [
  { re: /^garden-bench$/, pts: [[-0.6, 0, 0], [0, 0, 0], [0.6, 0, 0]] },
  { re: /^tripo_node_2deaa81a-/, pts: [[0.05, -0.27, 90], [0.05, 0, 90], [0.05, 0.27, 90]] }, // green velvet sofa, front at +X
  { re: /^tripo_node_(0afe2972|9c011463)-/, pts: [[-0.14, 0.08, 0], [0.14, 0.08, 0]] }, // velvet loveseats
  { re: /^tripo_node_de228606-/, pts: [[-0.5, -0.82, 0], [0.5, -0.82, 0], [-0.5, 0.82, 180], [0.5, 0.82, 180]] }, // picnic tables
  { re: /^stage-chair(_\d+)?$/, pts: [[0, 0.04, 0]] }, // panel chairs on the stage
];

/** Every seat on the Arrival furniture. The cushion height is found by a ray down onto the model. */
export function arrivalSeats(root: THREE.Object3D): Seat[] {
  root.updateMatrixWorld(true);
  const seats: Seat[] = [], rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), fwd = new THREE.Vector3();
  const visit = (n: THREE.Object3D, floor: number) => {
    const t = SEAT_POINTS.find(t => t.re.test(n.name));
    if (!t) { for (const c of n.children) visit(c, floor); return; }
    fwd.set(0, 0, 1).transformDirection(n.matrixWorld);
    const yaw = Math.atan2(fwd.x, fwd.z);
    for (const [x, z, turn] of t.pts) {
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(n.matrixWorld);
      rc.set(p.clone().setY(p.y + 2), down);
      const hit = rc.intersectObject(n, true)[0];
      if (hit) seats.push({ pos: p.setY(floor), rotY: yaw + THREE.MathUtils.degToRad(turn), top: hit.point.y - floor });
    }
  };
  for (const item of root.children) visit(item, item.position.y);
  return seats;
}

export async function loadArrival(onProgress?: (f: number) => void) {
  const manifest: ArrivalManifest | null = await fetch(BASE + 'manifest.json').then(r => r.ok ? r.json() : null).catch(() => null);
  if (!manifest?.items.length) return null;

  const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(BASE + 'draco/'));
  const texLoader = new THREE.TextureLoader();
  const root = new THREE.Group(); root.name = 'ArrivalArt';
  const colliders = new THREE.Group(); colliders.name = 'ArrivalColliders'; colliders.visible = false;
  const cache = new Map<string, Promise<THREE.Group>>();
  const used = new Set<string>();
  const load = (file: string) => {
    if (!cache.has(file)) cache.set(file, loader.loadAsync(BASE + file).then(g => g.scene));
    return cache.get(file)!;
  };
  const instance = async (file: string) => { const src = await load(file); const o = used.has(file) ? src.clone(true) : src; used.add(file); return o; };
  const place = (o: THREE.Object3D, it: ArrivalItem) => {
    o.position.fromArray(it.pos); o.quaternion.fromArray(it.quat); if (it.scale) o.scale.fromArray(it.scale);
  };
  const image = async (it: ArrivalItem) => {
    const tex = await texLoader.loadAsync(BASE + it.image); tex.colorSpace = THREE.SRGBColorSpace;
    const [w, h] = it.size ?? [1, 1];
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })));
    return g;
  };

  const queue = [...manifest.items];
  let done = 0, placed = 0;
  const worker = async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      try {
        const obj = it.image ? await image(it) : await instance(it.file!);
        obj.name = it.name; place(obj, it);
        obj.traverse(m => { if ((m as THREE.Mesh).isMesh) { m.receiveShadow = true; m.userData.arrival = it.group; } });
        root.add(obj); placed++;
        if (it.collision) { const c = await instance(it.collision); c.name = it.name + ' collision'; place(c, it); colliders.add(c); }
      } catch (e) { console.warn('[arrival] failed', it.file ?? it.image, e); }
      onProgress?.(++done / manifest.items.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.info(`[arrival] placed ${placed}/${manifest.items.length} pieces`);
  return { root, colliders };
}
