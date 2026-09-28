import * as THREE from 'three';
import type { Mats } from './mats';
import * as T from './tex';
import { labradoriteColumn } from './chamber';
import { PATH_CURVE } from './site';

/**
 * The open colonnade between the two chambers: a teal stone path on an S-curve,
 * lined with labradorite columns and gilt lintels, open to the garden on both sides.
 */
export function buildColonnade(m: Mats) {
  const group = new THREE.Group(); group.name = 'Colonnade';
  const colliders = new THREE.Group();
  const glows: THREE.Sprite[] = [];
  const len = PATH_CURVE.getLength();
  const N = Math.round(len / 0.25);
  const W = 1.7; // half width of the path
  const up = new THREE.Vector3(0, 1, 0);
  const frame = (t: number) => {
    const p = PATH_CURVE.getPointAt(t), tan = PATH_CURVE.getTangentAt(t).setY(0).normalize();
    return { p, tan, side: new THREE.Vector3().crossVectors(up, tan).normalize() };
  };

  // teal path ribbon
  const tealTex = T.marble(512, '#2f6f68', '#8fd3c4', 2); tealTex.wrapS = tealTex.wrapT = THREE.RepeatWrapping;
  const teal = new THREE.MeshPhysicalMaterial({ map: tealTex, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.9 });
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const { p, side } = frame(i / N);
    for (const s of [-1, 1]) { const q = p.clone().addScaledVector(side, s * W); pos.push(q.x, 0.012, q.z); uv.push(s < 0 ? 0 : 1, (i / N) * len / 3.4); }
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { g.index!.array.reverse(); g.computeVertexNormals(); }
  const ribbon = new THREE.Mesh(g, teal); ribbon.name = 'TealPath'; group.add(ribbon);
  // gilt edging
  for (const s of [-1, 1]) {
    const edge: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) { const { p, side } = frame(i / 48); edge.push(p.clone().addScaledVector(side, s * (W + 0.03)).setY(0.02)); }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 96, 0.03, 6), m.gilt));
  }

  // columns + lintels
  const pairs = Math.max(4, Math.round(len / 2.8));
  const capY = 3.3, colOff = W + 0.35;
  const lintel: THREE.Vector3[][] = [[], []];
  const glowTex = T.glow('255,214,150');
  for (let i = 0; i <= pairs; i++) {
    const t = 0.04 + (i / pairs) * 0.92;
    const { p, side, tan } = frame(t);
    [-1, 1].forEach((s, si) => {
      const c = p.clone().addScaledVector(side, s * colOff);
      const col = labradoriteColumn(m, capY, 0.22); col.position.copy(c); group.add(col);
      const ab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.85), m.giltSatin); ab.position.set(c.x, capY + 0.92, c.z); ab.rotation.y = Math.atan2(tan.x, tan.z); group.add(ab);
      lintel[si].push(c.clone().setY(capY + 1.05));
      const cc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 3, 10), new THREE.MeshBasicMaterial()); cc.position.set(c.x, 1.5, c.z); colliders.add(cc);
    });
    // pointed gilt cross-rib over the path on every other pair
    if (i % 2 === 0) {
      const rib: THREE.Vector3[] = [];
      for (let k = 0; k <= 20; k++) {
        const u = k / 20, x = (u * 2 - 1) * colOff;
        const y = capY + 1.05 + (1 - Math.pow(Math.abs(u * 2 - 1), 1.35)) * 1.25; // gently pointed
        rib.push(p.clone().addScaledVector(side, x).setY(y));
      }
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rib), 40, 0.045, 8), m.gilt));
      // hanging lantern at the apex
      const lp = p.clone().setY(capY + 1.4);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), m.emissiveWarm); globe.position.copy(lp); group.add(globe);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.85, 5), m.giltSatin); chain.position.copy(lp).setY(lp.y + 0.5); group.add(chain);
      const gs = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd39a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
      gs.scale.setScalar(1.2); gs.position.copy(lp); group.add(gs); glows.push(gs);
    }
  }
  for (const L of lintel) {
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(L), L.length * 12, 0.07, 8), m.gilt));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(L.map(v => v.clone().setY(v.y + 0.18))), L.length * 12, 0.04, 6), m.giltSatin));
  }
  // two warm lights along the walk (kept few for headset budgets)
  const lights: THREE.PointLight[] = [];
  for (const t of [0.3, 0.72]) { const l = new THREE.PointLight(0xffc88a, 16, 9, 2); l.position.copy(PATH_CURVE.getPointAt(t)).setY(3.6); group.add(l); lights.push(l); }
  return { group, colliders, glows, lights };
}
