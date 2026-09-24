import * as THREE from 'three';
import type { Mats } from './mats';
import * as T from './tex';
import { CATS } from './search';
import { APOTHEM } from './rotunda';

export const APSE_FRONT = -(APOTHEM + 0.5);
export const APSE_CENTER = new THREE.Vector3(0, 0, APSE_FRONT - 4.6);

export interface ApseBuilt {
  group: THREE.Group;
  colliders: THREE.Group;
  lanterns: { object: THREE.Object3D; catId: string }[];
  glows: THREE.Sprite[];
  light: THREE.PointLight;
  panelMount: THREE.Group;
  placeLibrary: (scene: THREE.Object3D) => void;
  update: (t: number, reduced: boolean) => void;
}

export function buildApse(m: Mats, font: { display: string; body: string; mono: string }, domeMat?: THREE.Material): ApseBuilt {
  const group = new THREE.Group(); group.name = 'LibraryApse';
  const colliders = new THREE.Group();
  const glows: THREE.Sprite[] = [];
  const spinners: THREE.Object3D[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => { const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); c.position.set(x, y, z); c.rotation.y = ry; colliders.add(c); };

  // front wall of the apse, with the arch that lines up with the rotunda's north bay
  const W = 7.0, H = 7.4;
  const sh = new THREE.Shape();
  sh.moveTo(-W, 0); sh.lineTo(-2.0, 0);
  for (let i = 0; i <= 28; i++) { const a = Math.PI - (i / 28) * Math.PI; sh.lineTo(2.0 * Math.cos(a), 4.6 + 1.9 * Math.sin(a)); }
  sh.lineTo(2.0, 0); sh.lineTo(W, 0); sh.lineTo(W, H); sh.lineTo(-W, H); sh.closePath();
  const fw = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false, curveSegments: 24 }), [m.wall, m.reveal]);
  fw.rotation.y = Math.PI; fw.position.set(0, 0, APSE_FRONT - 0.02); group.add(fw);
  // inner arch moulding on the apse side
  const ap: THREE.Vector3[] = [new THREE.Vector3(-2.0, 0, 0)];
  for (let i = 0; i <= 28; i++) { const a = Math.PI - (i / 28) * Math.PI; ap.push(new THREE.Vector3(2.0 * Math.cos(a), 4.6 + 1.9 * Math.sin(a), 0)); }
  ap.push(new THREE.Vector3(2.0, 0, 0));
  const moulding = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ap, false, 'centripetal'), 96, 0.06, 8), m.gilt);
  moulding.position.z = APSE_FRONT - 0.34; group.add(moulding);
  for (const s of [-1, 1]) box(W - 2.0, 3, 0.5, s * (2.0 + (W - 2.0) / 2), 1.5, APSE_FRONT - 0.15);

  // enclosure: half-ellipse walls + painted half-dome, so the library model reads as a room
  const RX = 7.4, RZ = 8.6, EH = 7.4;
  const wallIn = m.wall.clone(); wallIn.side = THREE.BackSide; wallIn.map = m.wall.map!.clone(); wallIn.map.repeat.set(14, 3.2); wallIn.map.needsUpdate = true;
  const encl = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, EH, 48, 1, true, Math.PI / 2, Math.PI), wallIn);
  encl.scale.set(RX, 1, RZ); encl.position.set(0, EH / 2, APSE_FRONT); group.add(encl);
  const extWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, EH + 0.6, 48, 1, true, Math.PI / 2, Math.PI), m.stoneExt);
  extWall.scale.set(RX + 0.4, 1, RZ + 0.4); extWall.position.set(0, (EH + 0.6) / 2, APSE_FRONT); group.add(extWall);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 16, Math.PI, Math.PI, 0, Math.PI / 2), domeMat ?? m.wall);
  cap.scale.set(RX, 3.6, RZ); cap.position.set(0, EH, APSE_FRONT); (cap.material as THREE.Material).side = THREE.BackSide; group.add(cap);
  const capExt = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 16, Math.PI, Math.PI, 0, Math.PI / 2), m.patina);
  capExt.scale.set(RX + 0.45, 4.0, RZ + 0.45); capExt.position.set(0, EH + 0.3, APSE_FRONT); group.add(capExt);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 64, Math.PI), m.gilt);
  ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI; ring.scale.set(RX - 0.05, RZ - 0.05, 1); ring.position.set(0, EH, APSE_FRONT); group.add(ring);
  const afloor = new THREE.Mesh(new THREE.CircleGeometry(1, 48, Math.PI, Math.PI), m.floorDark ?? m.marble);
  afloor.rotation.x = -Math.PI / 2; afloor.scale.set(RX, RZ, 1); afloor.position.set(0, -0.012, APSE_FRONT); group.add(afloor);

  // floor extension (the GLB carries its own mosaic floor; this fills the threshold)
  const thr = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.02, 0.8), m.marble); thr.position.set(0, 0.0, APSE_FRONT - 0.2); group.add(thr);
  box(14, 0.2, 10, 0, -0.1, APSE_CENTER.z - 0.5);
  // curved back wall colliders (half ellipse)
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    const x = Math.cos(a) * 7.2, z = APSE_FRONT - Math.sin(a) * 8.4;
    box(2.4, 3, 0.6, x, 1.5, z, Math.atan2(Math.sin(a) * 7.2, Math.cos(a) * 8.4));
  }

  // category lanterns: labradorite crystals on gilt stands, one per library category
  const lanterns: { object: THREE.Object3D; catId: string }[] = [];
  const hues = [0x5fe0c6, 0xd8ae5a, 0xa791ff];
  const glowTex = T.glow('150,240,220');
  CATS.forEach((c, i) => {
    const t = i / (CATS.length - 1);
    const a = Math.PI * (0.06 + t * 0.34);
    const pos = new THREE.Vector3(1.6 + Math.cos(a) * 1.1 + t * 2.6, 0, APSE_FRONT - 1.2 - t * 3.6);
    const st = new THREE.Group(); st.position.copy(pos); group.add(st);
    const stand = new THREE.Mesh(new THREE.LatheGeometry([[0.2, 0], [0.2, 0.03], [0.08, 0.08], [0.04, 0.3], [0.035, 0.85], [0.08, 0.95], [0.12, 1.02], [0, 1.02]].map(([r, y]) => new THREE.Vector2(r, y)), 32), m.gilt);
    st.add(stand);
    const col = hues[i % 3];
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshPhysicalMaterial({ color: 0x1b3a3a, emissive: col, emissiveIntensity: 0.9, roughness: 0.1, clearcoat: 1, iridescence: 1, iridescenceThicknessRange: [200, 700] }));
    crystal.scale.y = 1.6; crystal.position.y = 1.22; crystal.userData.spin = true; crystal.userData.keep = true; spinners.push(crystal); st.add(crystal);
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    g.scale.setScalar(0.8); g.position.y = 1.22; st.add(g); glows.push(g);
    const tex = T.labelTexture([{ text: c.name, font: `34px ${font.body}`, color: '#efe6cf' }, { text: `${c.count} works`, font: `26px ${font.mono}`, color: '#8fe3d0' }], 512, 120);
    const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    lbl.scale.set(0.62, 0.145, 1); lbl.position.y = 1.62; st.add(lbl);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.9, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.95; st.add(hit);
    hit.userData = { kind: 'category', catId: c.id, keep: true };
    lanterns.push({ object: hit, catId: c.id });
  });

  // easel that holds the library panel (panel attached later)
  const panelMount = new THREE.Group(); panelMount.userData.keep = true;
  panelMount.position.set(-3.9, 0, APSE_FRONT - 2.3);
  panelMount.lookAt(0.6, 0, APSE_FRONT + 0.8);
  group.add(panelMount);
  const frameW = 2.36, frameH = 1.5, cy = 1.62;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, 0.06), m.walnut); frame.position.set(0, cy, -0.04); panelMount.add(frame);
  const crest: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) { const x = -frameW / 2 + (i / 24) * frameW; crest.push(new THREE.Vector3(x, cy + frameH / 2 + 0.08 + Math.sin((i / 24) * Math.PI) * 0.22, 0)); }
  panelMount.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(crest), 64, 0.03, 8), m.gilt));
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, cy + frameH / 2, 12), m.walnut);
    leg.position.set(s * (frameW / 2 - 0.15), (cy + frameH / 2) / 2, -0.12); leg.rotation.x = 0.06; panelMount.add(leg);
  }

  const light = new THREE.PointLight(0xffcf96, 45, 18, 2); light.position.set(0, 4.2, APSE_CENTER.z); group.add(light);

  const placeLibrary = (scene: THREE.Object3D) => {
    scene.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveMap = mat.map; mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 0.3;
        mat.envMapIntensity = 0.6;
      }
    });
    scene.scale.setScalar(11.5);
    scene.position.set(0, 0, APSE_FRONT - 0.33 * 11.5);
    group.add(scene);
  };

  const update = (t: number, reduced: boolean) => {
    if (reduced) return;
    for (const o of spinners) o.rotation.y = t * 0.4;
  };
  return { group, colliders, lanterns, glows, light, panelMount, placeLibrary, update };
}
