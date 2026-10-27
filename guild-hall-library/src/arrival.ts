import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * Arrival.space art layer: places the GLB pieces from the Arrival build into this world, from public/arrival/manifest.json
 * (written by scripts/arrival/make-manifest.mjs from an `arrival pull`). Rotations are Arrival's (PlayCanvas) degrees,
 * which match three.js 'ZYX' order. V3 groups listed in hideV3 are hidden but still answer clicks, so seats and
 * grabbables keep working underneath the new art.
 */
export interface ArrivalItem {
  name?: string; file: string; pos: [number, number, number]; rot: [number, number, number];
  scale?: number | [number, number, number]; hidden?: boolean; priority?: number; group?: string;
  castShadow?: boolean; collide?: boolean; collisionOnly?: boolean;
}
export interface ArrivalManifest { hideV3?: string[]; items: ArrivalItem[] }

const BASE = 'arrival/';

export async function loadArrival(scene: THREE.Scene) {
  const manifest: ArrivalManifest | null = await fetch(BASE + 'manifest.json').then(r => r.ok ? r.json() : null).catch(() => null);
  const items = manifest?.items.filter(it => !it.hidden) ?? [];
  if (!manifest || (!items.length && !manifest.hideV3?.length)) return null;

  const hide = new Set(manifest.hideV3);
  if (hide.size) scene.traverse(o => { if (hide.has(o.name)) { o.visible = false; o.userData.arrivalHidden = true; } });

  const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(BASE + 'draco/'));
  const root = new THREE.Group(); root.name = 'arrival-layer'; scene.add(root);
  const cache = new Map<string, Promise<THREE.Group>>();
  const used = new Set<string>();
  const load = (file: string) => {
    if (!cache.has(file)) cache.set(file, loader.loadAsync(BASE + 'models/' + file).then(g => g.scene));
    return cache.get(file)!;
  };

  const queue = [...items].sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));
  let placed = 0;
  const worker = async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      try {
        const src = await load(it.file);
        const obj = used.has(it.file) ? src.clone(true) : src;
        used.add(it.file);
        obj.name = it.name || it.file;
        obj.position.fromArray(it.pos);
        obj.rotation.set(THREE.MathUtils.degToRad(it.rot[0]), THREE.MathUtils.degToRad(it.rot[1]), THREE.MathUtils.degToRad(it.rot[2]), 'ZYX');
        const s = it.scale ?? 1; Array.isArray(s) ? obj.scale.fromArray(s) : obj.scale.setScalar(s);
        obj.traverse(m => {
          if (!(m as THREE.Mesh).isMesh) return;
          m.castShadow = !!it.castShadow; m.receiveShadow = true;
          m.userData.arrival = it.group || 'art';
          if (it.collide) m.userData.walkable = true;
        });
        if (it.collisionOnly) obj.visible = false;
        root.add(obj); placed++;
      } catch (e) { console.warn('[arrival] failed', it.file, e); }
    }
  };
  // a few at a time so the main thread stays responsive while the art streams in
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.info(`[arrival] placed ${placed}/${items.length} pieces`);
  return root;
}
