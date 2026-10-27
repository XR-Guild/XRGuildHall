import * as THREE from 'three';
import type { AuroraSky } from './sky';

/**
 * Four skies, chosen by each visitor for themselves (Comfort menu). The choice is remembered on this device only.
 * Aurora is the animated procedural sky; Blue sky, Meteors and Sunset are Evo's sky images from the Arrival.space build
 * (public/skies/, 2048×1024 equirectangular). Every sky is rendered into the same cube target, so the background,
 * the reflecting pool and the fountain all follow it. Lighting and fog change with the sky so day reads as day.
 */
export type SkyId = 'aurora' | 'blue' | 'meteors' | 'sunset';
export const SKIES: { id: SkyId; name: string }[] = [
  { id: 'aurora', name: 'Aurora' }, { id: 'blue', name: 'Blue sky' }, { id: 'meteors', name: 'Meteors' }, { id: 'sunset', name: 'Sunset' },
];

interface Look { fog: number; fogDensity: number; exposure: number; sun: number; sunI: number; sunPos: [number, number, number]; hemiSky: number; hemiGround: number; hemiI: number; hallDay: number; twinkle: number; night: boolean }
const LOOKS: Record<SkyId, Look> = {
  aurora: { fog: 0x08111a, fogDensity: 0.0048, exposure: 1.05, sun: 0xa9c2ff, sunI: 0.55, sunPos: [-30, 40, -20], hemiSky: 0x3b7f78, hemiGround: 0x0a120e, hemiI: 0.35, hallDay: 0.35, twinkle: 0, night: true },
  meteors: { fog: 0x070a16, fogDensity: 0.0045, exposure: 1.08, sun: 0x9fb2ff, sunI: 0.5, sunPos: [-30, 40, -20], hemiSky: 0x2c3a6a, hemiGround: 0x0a0c12, hemiI: 0.4, hallDay: 0.35, twinkle: 1, night: true },
  blue: { fog: 0xaec6d6, fogDensity: 0.0032, exposure: 0.95, sun: 0xfff1dc, sunI: 2.4, sunPos: [40, 60, 30], hemiSky: 0xcfe3ff, hemiGround: 0x4b5a35, hemiI: 1.1, hallDay: 0.9, twinkle: 0, night: false },
  sunset: { fog: 0x8a6070, fogDensity: 0.0036, exposure: 1.0, sun: 0xffa36b, sunI: 1.7, sunPos: [-60, 18, 40], hemiSky: 0xffb69a, hemiGround: 0x2d1d2c, hemiI: 0.75, hallDay: 0.55, twinkle: 0, night: false },
};

const KEY = 'xrgh.sky';
export const savedSky = (): SkyId => { try { const v = localStorage.getItem(KEY) as SkyId; return LOOKS[v] ? v : 'aurora'; } catch { return 'aurora'; } };

export interface SkyRig {
  sky: AuroraSky; renderer: THREE.WebGLRenderer; scene: THREE.Scene;
  sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; hallDaylight?: THREE.HemisphereLight | null;
  /** Re-capture interior reflections after the sky changes. */
  recapture: () => void;
  base: string;
}

export function makeSkySwitcher(r: SkyRig) {
  const loader = new THREE.TextureLoader();
  const cache = new Map<SkyId, THREE.Texture>();
  let current: SkyId = 'aurora', token = 0;
  const load = (id: SkyId) => new Promise<THREE.Texture>((res, rej) => {
    const c = cache.get(id); if (c) return res(c);
    loader.load(`${r.base}skies/${id}.jpg`, t => { t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; cache.set(id, t); res(t); }, undefined, rej);
  });
  const look = (id: SkyId) => {
    const L = LOOKS[id];
    (r.scene.fog as THREE.FogExp2).color.setHex(L.fog); (r.scene.fog as THREE.FogExp2).density = L.fogDensity;
    r.renderer.toneMappingExposure = L.exposure;
    r.sun.color.setHex(L.sun); r.sun.intensity = L.sunI; r.sun.position.set(...L.sunPos);
    r.hemi.color.setHex(L.hemiSky); r.hemi.groundColor.setHex(L.hemiGround); r.hemi.intensity = L.hemiI;
    if (r.hallDaylight) r.hallDaylight.intensity = L.hallDay;
  };
  /** Switch sky. Resolves once the new sky is showing. */
  async function set(id: SkyId) {
    if (!LOOKS[id]) id = 'aurora';
    const my = ++token;
    try { localStorage.setItem(KEY, id); } catch { /* private mode */ }
    if (id === 'aurora') { r.sky.setImage(null); }
    else {
      let tex: THREE.Texture;
      try { tex = await load(id); } catch { console.warn('[sky] could not load', id); return current; }
      if (my !== token) return current;
      r.sky.setImage(tex, { twinkle: LOOKS[id].twinkle });
    }
    current = id; look(id); r.recapture();
    return current;
  }
  return { set, get current() { return current; }, isNight: () => LOOKS[current].night };
}
