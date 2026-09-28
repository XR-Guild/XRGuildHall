import * as THREE from 'three';
import type { Mats } from './mats';
import * as T from './tex';
import { CATS } from './search';
import { LIB } from './site';

export interface LibraryBuilt {
  group: THREE.Group;
  lanterns: { object: THREE.Object3D; catId: string }[];
  glows: THREE.Sprite[];
  update: (t: number, reduced: boolean) => void;
}

/**
 * Library chamber furnishings: nine category lanterns (labradorite crystals on gilt stands),
 * set in an arc on the north-west side so the door, shelves, and seating stay clear.
 */
export function buildLibraryInterior(m: Mats, font: { display: string; body: string; mono: string }): LibraryBuilt {
  const group = new THREE.Group(); group.name = 'LibraryInterior';
  const glows: THREE.Sprite[] = [];
  const spinners: THREE.Object3D[] = [];
  const lanterns: { object: THREE.Object3D; catId: string }[] = [];
  const hues = [0x5fe0c6, 0xd8ae5a, 0xa791ff];
  const glowTex = T.glow('150,240,220');
  const C = LIB.center;
  CATS.forEach((c, i) => {
    const th = Math.PI * 1.62 + (i / (CATS.length - 1)) * Math.PI * 0.62; // from WNW round through north to NNE
    const r = LIB.apothem - 1.35;
    const st = new THREE.Group(); st.position.set(C.x + Math.sin(th) * r, 0, C.z - Math.cos(th) * r); group.add(st);
    const stand = new THREE.Mesh(new THREE.LatheGeometry([[0.2, 0], [0.2, 0.03], [0.08, 0.08], [0.04, 0.3], [0.035, 0.85], [0.08, 0.95], [0.12, 1.02], [0, 1.02]].map(([a, b]) => new THREE.Vector2(a, b)), 32), m.gilt);
    st.add(stand);
    const col = hues[i % 3];
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshPhysicalMaterial({ color: 0x1b3a3a, emissive: col, emissiveIntensity: 0.9, roughness: 0.1, clearcoat: 1, iridescence: 1, iridescenceThicknessRange: [200, 700] }));
    crystal.scale.y = 1.6; crystal.position.y = 1.22; crystal.userData.keep = true; spinners.push(crystal); st.add(crystal);
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    g.scale.setScalar(0.8); g.position.y = 1.22; st.add(g); glows.push(g);
    const tex = T.labelTexture([{ text: c.name, font: `34px ${font.body}`, color: '#efe6cf' }, { text: `${c.count} works`, font: `26px ${font.mono}`, color: '#8fe3d0' }], 512, 120);
    const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    lbl.scale.set(0.62, 0.145, 1); lbl.position.y = 1.62; st.add(lbl);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.9, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.95; hit.userData = { kind: 'category', catId: c.id, keep: true }; st.add(hit);
    lanterns.push({ object: hit, catId: c.id });
  });
  const update = (t: number, reduced: boolean) => { if (!reduced) for (const o of spinners) o.rotation.y = t * 0.4; };
  return { group, lanterns, glows, update };
}
