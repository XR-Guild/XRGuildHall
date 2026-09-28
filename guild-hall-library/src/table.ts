import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Mats } from './mats';
import * as T from './tex';
import { LINEAGE } from './data/news';

export const TABLE_TOP = 0.78;
const lathe = (profile: [number, number][], mat: THREE.Material, seg = 64) =>
  new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);

export interface Device { id: string; index: number; object: THREE.Group; home: THREE.Matrix4; era: string; }

export interface TableBuilt {
  group: THREE.Group;
  colliders: THREE.Group;
  devices: Device[];
  featured: THREE.Group;
  hologram: THREE.Group;
  callouts: THREE.Sprite[];
  light: THREE.PointLight;
  update: (t: number, dt: number, reduced: boolean) => void;
}

const ERA_COL: Record<string, number> = { past: 0xe0b35a, present: 0x46e0c8, future: 0xa48bff };

export function buildTable(m: Mats, font: { display: string; body: string; mono: string }): TableBuilt {
  const group = new THREE.Group(); group.name = 'ConnectTable';
  const colliders = new THREE.Group();

  // ---------- table ----------
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.06, 96), m.labradorite);
  top.position.y = TABLE_TOP - 0.03; group.add(top);
  const band = lathe([[1.12, TABLE_TOP - 0.06], [1.62, TABLE_TOP - 0.06], [1.62, TABLE_TOP], [1.12, TABLE_TOP]], m.walnut, 128);
  group.add(band);
  for (const [r, t] of [[1.125, 0.012], [1.615, 0.03], [1.4, 0.006]] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 160), m.gilt); ring.rotation.x = Math.PI / 2; ring.position.y = TABLE_TOP - (r > 1.6 ? 0.03 : 0.001); group.add(ring);
  }
  // labradorite cabochons set in the walnut band
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const cab = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), m.labradorite);
    cab.scale.set(1.6, 0.35, 1); cab.position.set(Math.cos(a) * 1.5, TABLE_TOP, Math.sin(a) * 1.5); cab.rotation.y = -a; group.add(cab);
  }
  // era timeline ring: glowing arcs, gold → teal → violet (the futuristic inlay)
  const eras = [['past', 0, 0.36], ['present', 0.36, 0.78], ['future', 0.78, 1.0]] as const;
  for (const [era, a0, a1] of eras) {
    const mat = new THREE.MeshStandardMaterial({ color: ERA_COL[era], emissive: ERA_COL[era], emissiveIntensity: 1.8, roughness: 0.3 });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.008, 6, 120, (a1 - a0) * Math.PI * 2 - 0.02), mat);
    arc.rotation.x = -Math.PI / 2; arc.rotation.z = a0 * Math.PI * 2 + Math.PI / 2 + 0.01; arc.position.y = TABLE_TOP + 0.002; group.add(arc);
  }
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(1.48, 1.48, 0.14, 96, 1, true), m.walnut); apron.position.y = TABLE_TOP - 0.13; group.add(apron);
  const bead = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.02, 8, 128), m.gilt); bead.rotation.x = Math.PI / 2; bead.position.y = TABLE_TOP - 0.2; group.add(bead);
  const under = new THREE.Mesh(new THREE.CircleGeometry(1.48, 64), m.walnutDark); under.rotation.x = Math.PI / 2; under.position.y = TABLE_TOP - 0.2; group.add(under);
  const ped = lathe([[0.62, 0], [0.64, 0.05], [0.5, 0.09], [0.3, 0.18], [0.22, 0.32], [0.24, 0.45], [0.36, 0.52], [0.5, TABLE_TOP - 0.2], [0, TABLE_TOP - 0.2]], m.walnut);
  group.add(ped);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.06, 64), m.labradoriteDark); foot.position.y = 0.03; group.add(foot);
  const footRing = new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.02, 8, 96), m.gilt); footRing.rotation.x = Math.PI / 2; footRing.position.y = 0.06; group.add(footRing);
  // whiplash legs
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const c = Math.cos(a), s = Math.sin(a);
    const P = (r: number, y: number, side = 0) => new THREE.Vector3(c * r - s * side, y, s * r + c * side);
    const curve = new THREE.CatmullRomCurve3([P(0.3, 0.46), P(0.62, 0.5), P(0.98, 0.42, 0.06), P(1.08, 0.24, 0.03), P(0.86, 0.14, -0.04), P(0.94, 0.06), P(1.12, 0.05, 0.05), P(1.16, 0.12, 0.08)], false, 'centripetal');
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.028, 10), m.gilt));
    const up = new THREE.CatmullRomCurve3([P(0.98, 0.42, 0.06), P(1.2, TABLE_TOP - 0.2, 0.02), P(1.42, TABLE_TOP - 0.19)]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(up, 40, 0.02, 8), m.gilt));
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), m.labradorite); leaf.scale.set(1, 0.6, 2.2); leaf.position.copy(P(1.16, 0.12, 0.08)); leaf.rotation.y = -a; group.add(leaf);
  }
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1.64, 1.64, 1.2, 24), new THREE.MeshBasicMaterial()); col.position.y = 0.6; colliders.add(col);

  // (the old curved benches are replaced by the seating presets in seating.ts)

  // ---------- devices on plinths ----------
  const devices: Device[] = [];
  const past = LINEAGE.filter(l => l.era !== 'future');
  past.forEach((l, i) => {
    // spread along the timeline ring: past arc then present arc
    const frac = l.era === 'past' ? 0.05 + (i / 3) * 0.3 : 0.42 + ((i - 3) / 3) * 0.34;
    const a = frac * Math.PI * 2 + Math.PI / 2;
    const pos = new THREE.Vector3(Math.cos(a) * 1.33, TABLE_TOP, -Math.sin(a) * 1.33);
    const plinth = new THREE.Group(); plinth.position.copy(pos); group.add(plinth);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.03, 48), m.labradoriteDark); disc.position.y = 0.015; plinth.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.008, 6, 48), m.gilt); rim.rotation.x = Math.PI / 2; rim.position.y = 0.03; plinth.add(rim);
    const dev = makeDevice(i, m);
    dev.position.copy(pos).setY(TABLE_TOP + 0.03);
    dev.lookAt(0, dev.position.y, 0); dev.rotateY(Math.PI);
    dev.userData = { kind: 'device', index: i, keep: true };
    group.add(dev);
    dev.updateMatrix();
    devices.push({ id: `lineage-${i}`, index: i, object: dev, home: dev.matrix.clone(), era: l.era });
    // plaque facing outward, tilted up
    const tex = T.labelTexture([
      { text: l.year, font: `600 44px ${font.mono}`, color: '#' + new THREE.Color(ERA_COL[l.era]).getHexString() },
      { text: l.name, font: `40px ${font.body}`, color: '#efe6cf' },
    ], 512, 150);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.088), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    const out = pos.clone().setY(0).normalize();
    plaque.position.copy(pos).addScaledVector(out, 0.2).setY(TABLE_TOP + 0.03);
    plaque.lookAt(plaque.position.clone().add(out).setY(TABLE_TOP + 0.9)); group.add(plaque);
  });

  // ---------- hologram dais + featured VR Glasses (illustrative) ----------
  const hologram = new THREE.Group(); hologram.userData.keep = true; group.add(hologram);
  const dais = lathe([[0.3, 0], [0.3, 0.02], [0.22, 0.05], [0.16, 0.08], [0.18, 0.1], [0, 0.1]], m.gilt, 48); dais.position.y = TABLE_TOP; hologram.add(dais);
  const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.012, 48), m.emissiveCyan); emitter.position.y = TABLE_TOP + 0.105; hologram.add(emitter);
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv=uv; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vP; uniform float uTime;
      void main(){ float a = pow(1.-vUv.y, 1.6)*0.32; float scan = 0.75+0.25*sin(vP.y*140.-uTime*3.);
      vec3 c = mix(vec3(0.3,0.95,1.0), vec3(0.62,0.52,1.0), vUv.y); gl_FragColor = vec4(c*a*scan, a); }`,
  });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.14, 0.95, 64, 1, true), coneMat);
  cone.position.y = TABLE_TOP + 0.11 + 0.475; hologram.add(cone);
  const featured = makeFeaturedGlasses(m);
  featured.position.set(0, TABLE_TOP + 0.62, 0); featured.scale.setScalar(2.6);
  const puck = makePuck(m); puck.position.set(0, TABLE_TOP + 0.125, 0.0); hologram.add(puck);
  featured.userData = { kind: 'featured' };
  hologram.add(featured);
  const light = new THREE.PointLight(0x7fe9ff, 6, 5, 2); light.position.set(0, TABLE_TOP + 0.5, 0); hologram.add(light);
  const note = T.labelTexture([{ text: 'Illustrative model · not an official Meta render', font: `30px ${font.body}`, color: '#bfe9ee' }], 720, 70, 'rgba(6,24,30,0.7)', '#4fd8e8');
  const noteM = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.06), new THREE.MeshBasicMaterial({ map: note, transparent: true, depthWrite: false }));
  noteM.position.set(0, TABLE_TOP + 0.3, 0); hologram.add(noteM);

  const specs = ['~100 g visor', '70° × 66° FOV', '2412 × 2288 / eye', '120 Hz · 37 PPD', '$1,299.99', 'Spring 2027'];
  const callouts: THREE.Sprite[] = specs.map((s, i) => {
    const t = T.labelTexture([{ text: s, font: `600 46px ${font.mono}`, color: '#dffbff' }], 512, 96, 'rgba(8,30,40,0.72)', '#6fe6f2');
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    sp.scale.set(0.3, 0.056, 1); sp.userData.phase = (i / specs.length) * Math.PI * 2; sp.userData.h = TABLE_TOP + 0.95 + (i % 2) * 0.14;
    hologram.add(sp); return sp;
  });

  const update = (t: number, _dt: number, reduced: boolean) => {
    const sp = reduced ? 0.04 : 0.25;
    featured.rotation.y = t * sp;
    featured.position.y = TABLE_TOP + 0.66 + (reduced ? 0 : Math.sin(t * 0.9) * 0.02);
    coneMat.uniforms.uTime.value = t;
    callouts.forEach(c => {
      const a = c.userData.phase + t * (reduced ? 0.01 : 0.08);
      c.position.set(Math.cos(a) * 0.62, c.userData.h, Math.sin(a) * 0.62);
    });
  };
  return { group, colliders, devices, featured, hologram, callouts, light, update };
}

// Generic, brand-free period devices built from primitives.
function makeDevice(i: number, m: Mats) {
  const g = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, metalness: 1, roughness: 0.08 });
  const black = m.blackMetal;
  const plastic = new THREE.MeshPhysicalMaterial({ color: 0xe9ebee, roughness: 0.35, clearcoat: 0.5 });
  const darkPlastic = new THREE.MeshPhysicalMaterial({ color: 0x1b1d22, roughness: 0.4, clearcoat: 0.6 });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x223a44, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  switch (i) {
    case 0: { // Wheatstone mirror stereoscope
      add(new THREE.BoxGeometry(0.32, 0.015, 0.12), m.walnut, 0, 0.008);
      for (const s of [-1, 1]) {
        add(new THREE.BoxGeometry(0.012, 0.16, 0.11), m.walnut, s * 0.15, 0.09);
        add(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0xcdb58a, roughness: 0.9 }), s * 0.143, 0.1, 0, 0, -s * Math.PI / 2);
        add(new THREE.BoxGeometry(0.003, 0.09, 0.07), silver, s * 0.028, 0.08, 0, 0, s * Math.PI / 4);
      }
      add(new THREE.BoxGeometry(0.06, 0.02, 0.02), m.gilt, 0, 0.13, 0.04);
      break;
    }
    case 1: { // Holmes hand stereoscope
      const hood = add(new THREE.CylinderGeometry(0.045, 0.07, 0.06, 4, 1), m.walnut, 0, 0.1, -0.02, Math.PI / 2, Math.PI / 4, 0); hood.scale.set(1.6, 1, 0.7);
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 20), lens, -0.03, 0.1, 0.012, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 20), lens, 0.03, 0.1, 0.012, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 8), m.gilt, 0, 0.08, 0.1, Math.PI / 2);
      const card = add(new THREE.BoxGeometry(0.15, 0.075, 0.003), new THREE.MeshStandardMaterial({ color: 0xd8c298, roughness: 0.8 }), 0, 0.095, 0.17);
      card.userData.card = true;
      add(new THREE.CylinderGeometry(0.008, 0.01, 0.08, 10), m.walnut, 0, 0.04, -0.02);
      break;
    }
    case 2: { // Sutherland-style head-mounted display
      const band = add(new THREE.TorusGeometry(0.075, 0.008, 8, 40), black, 0, 0.1, 0, Math.PI / 2); band.scale.set(1, 1.2, 1);
      for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(0.014, 0.02, 0.11, 16), black, s * 0.07, 0.1, 0.05, Math.PI / 2 - 0.3); add(new THREE.CircleGeometry(0.014, 16), lens, s * 0.07, 0.085, 0.105, -0.3); }
      add(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 8), silver, 0, 0.22, -0.02);
      add(new THREE.SphereGeometry(0.014, 12, 8), m.gilt, 0, 0.33, -0.02);
      add(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 8), silver, 0.06, 0.37, -0.02, 0, 0, Math.PI / 2.3);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 16), black, 0, 0.012, 0);
      break;
    }
    case 3: { // early consumer headset + strap
      add(new RoundedBoxGeometry(0.17, 0.09, 0.09, 4, 0.02), darkPlastic, 0, 0.08, 0.02);
      const strap = add(new THREE.TorusGeometry(0.1, 0.012, 8, 40, Math.PI * 1.3), darkPlastic, 0, 0.08, -0.04, Math.PI / 2, 0, Math.PI * -0.15 + Math.PI);
      strap.scale.set(0.95, 1.2, 1);
      add(new THREE.BoxGeometry(0.02, 0.02, 0.003), m.emissiveCyan, 0.06, 0.1, 0.066);
      break;
    }
    case 4: { // standalone headset with halo strap
      const v = add(new RoundedBoxGeometry(0.18, 0.1, 0.085, 5, 0.035), plastic, 0, 0.085, 0.03);
      add(new RoundedBoxGeometry(0.165, 0.07, 0.01, 3, 0.02), darkPlastic, 0, 0.085, 0.074);
      const halo = add(new THREE.TorusGeometry(0.1, 0.014, 8, 48), plastic, 0, 0.1, -0.05, Math.PI / 2 - 0.25); halo.scale.set(0.95, 1.15, 1);
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.008, 10, 8), darkPlastic, s * 0.05, 0.12, 0.08);
      v.userData.x = 1;
      break;
    }
    case 5: { // AI camera glasses (generic thick frames)
      const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x14110f, roughness: 0.25, clearcoat: 1 });
      for (const s of [-1, 1]) {
        const sh = new THREE.Shape(); sh.absellipse(0, 0, 0.034, 0.026, 0, Math.PI * 2, false);
        const ho = new THREE.Path(); ho.absellipse(0, 0, 0.026, 0.019, 0, Math.PI * 2, true); sh.holes.push(ho);
        add(new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, curveSegments: 32 }), frameMat, s * 0.038, 0.06, 0.04);
        const l = add(new THREE.CircleGeometry(0.026, 32), lens, s * 0.038, 0.06, 0.044); l.scale.y = 0.73;
        add(new THREE.BoxGeometry(0.006, 0.01, 0.13), frameMat, s * 0.075, 0.066, -0.02);
        add(new THREE.CylinderGeometry(0.004, 0.004, 0.003, 12), m.emissiveCyan, s * 0.068, 0.078, 0.05, Math.PI / 2);
      }
      add(new THREE.BoxGeometry(0.014, 0.006, 0.008), frameMat, 0, 0.068, 0.044);
      add(new THREE.BoxGeometry(0.12, 0.02, 0.012), m.walnut, 0, 0.01, 0.0);
      break;
    }
  }
  g.traverse(o => { (o as THREE.Mesh).castShadow = false; });
  return g;
}

// Illustrative lightweight visor + tethered compute puck. Generic shapes only.
function makeFeaturedGlasses(m: Mats) {
  const g = new THREE.Group();
  const mag = new THREE.MeshStandardMaterial({ color: 0x5b6068, metalness: 0.92, roughness: 0.26 });
  const front = new THREE.MeshPhysicalMaterial({ color: 0x07090d, roughness: 0.04, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [260, 640] });
  const rr = (w: number, h: number, r: number) => { const s = new THREE.Shape(); s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); return s; };
  // visor: slightly wrapped by bending the extruded plate around a cylinder
  const bend = (geo: THREE.BufferGeometry, R: number) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const a = x / R; p.setXYZ(i, Math.sin(a) * (R + z), p.getY(i), Math.cos(a) * (R + z) - R); } geo.computeVertexNormals(); return geo; };
  const frameGeo = bend(new THREE.ExtrudeGeometry(rr(0.17, 0.056, 0.02), { depth: 0.014, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 3, curveSegments: 10, steps: 1 }), 0.14);
  const frame = new THREE.Mesh(frameGeo, mag); frame.position.z = -0.012; g.add(frame);
  const faceGeo = bend(new THREE.ExtrudeGeometry(rr(0.158, 0.046, 0.016), { depth: 0.004, bevelEnabled: false, curveSegments: 10 }), 0.14);
  const face = new THREE.Mesh(faceGeo, front); face.position.z = 0.0045; g.add(face);
  // nose bridge notch + status light
  const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 20, Math.PI), mag); bridge.rotation.z = Math.PI; bridge.position.set(0, -0.028, -0.004); g.add(bridge);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), m.emissiveCyan); led.position.set(0.064, 0.02, 0.008); g.add(led);
  // temples
  for (const s of [-1, 1]) {
    const tpts = [new THREE.Vector3(s * 0.083, 0.012, -0.02), new THREE.Vector3(s * 0.088, 0.012, -0.08), new THREE.Vector3(s * 0.086, 0.006, -0.14), new THREE.Vector3(s * 0.078, -0.016, -0.165)];
    const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tpts), 24, 0.0055, 8), mag); t.scale.y = 1.8; g.add(t);
  }
  // optical tether from the left temple down to the puck resting on the dais
  const fiberMat = new THREE.MeshStandardMaterial({ color: 0xbff8ff, emissive: 0x3fd8ff, emissiveIntensity: 1.4 });
  const fiber = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.078, -0.016, -0.165), new THREE.Vector3(-0.07, -0.05, -0.17), new THREE.Vector3(-0.05, -0.12, -0.1), new THREE.Vector3(-0.03, -0.18, -0.04)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(fiber, 40, 0.0018, 6), fiberMat));
  return g;
}

function makePuck(m: Mats) {
  const mag = new THREE.MeshStandardMaterial({ color: 0x4a4e55, metalness: 0.9, roughness: 0.3 });
  const g = new THREE.Group();
  const puck = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.04, 0.13, 4, 0.018), mag); g.add(puck);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.003, 0.004), m.emissiveCyan); strip.position.set(0, 0.012, 0.066); g.add(strip);
  return g;
}
