import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Mats } from './mats';
import { CanvasPanel, INK, type Fonts } from './panel';
import { PATH_CURVE, V } from './site';
import { leafTexture, jasmineTexture, lilyTexture } from './tex3';

/**
 * Garden additions first made in the Arrival.space build (Sept 29 – Oct 2026), rebuilt procedurally for V3:
 *  - labradorite fountain with the portal-ring motif, clear of the portal pads, with rippling water and a spray
 *  - pond with lily pads, fed by a spring stream in the back garden
 *  - a few gentle birds, procedural birdsong, and the sound of the fountain and stream (Comfort → Garden sounds)
 *  - grapevine along the colonnade lintels (amber and red leaves, grape clusters, tendrils); ivy with jasmine built but hidden
 *  - XR Guild Principles and Code of Conduct boards outside, with an "I'm in" button that stores nothing
 * Everything is lightweight: instanced or merged, a handful of draw calls, no textures over 256 px.
 */
export const FOUNTAIN = V(6, 0, -24);
export const BOARD_SPOTS = [{ pos: V(19.5, 0, -12.6), ry: -0.15 }, { pos: V(23.6, 0, -13.2), ry: 0.12 }];
export const POND = { center: V(-4, 0, -30), rx: 5.2, rz: 3.2 };
const SPRING = V(-14, 0, -35.5);
const BOARDS = BOARD_SPOTS;

const PRINCIPLES: [string, string, string][] = [
  ['I', 'Every Person Matters', 'Mutual respect enables safer participation for everyone. The quietest voices are often the most important to hear.'],
  ['II', 'HCI should prioritize the well-being of humans & communities', 'Cognitive liberty is a human right to be free from external manipulation, and to decide for ourselves what to think and do.'],
  ['III', 'Design and interaction patterns that trick, confuse or exploit should be exposed and redesigned for safety', 'We must avoid and dismantle harmful interaction patterns affecting social development.'],
  ['IV', 'People have the right to know and control how their personal information is collected and used', 'This includes the right to inspect or revoke access at any time.'],
  ['V', 'We should support a thriving ecosystem of creatorship', 'We recognize that today, everything is essentially a remix.'],
  ['VI', 'We are responsible for our decisions, individually and collectively', 'We have a duty to help mitigate serious problems wherever possible.'],
  ['VII', 'We strive to share knowledge, foster dialogue and learning', 'And to actively address serious challenges to create a more informed and responsible community.'],
];
const CONDUCT = [
  'Be kind and respectful. Harassment, hate and unwanted contact are not welcome here.',
  'Respect personal space. Anyone who walks into you fades out; you can mute or block anyone.',
  'Mics stay off until you choose to talk. This world records no voice.',
  'Only your name, avatar, position and seat are shared. No gaze, hand or device data.',
  'Hosts and Guild admins may spotlight speakers, mute the hall and change seating for events.',
];

// ---------- water ----------
const waterVert = /* glsl */ `
varying vec3 vW; varying vec2 vUv;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const waterFrag = /* glsl */ `
uniform samplerCube uEnv; uniform float uTime; uniform vec3 uDeep; uniform vec3 uTint; uniform float uAmp; uniform vec3 uCenter;
uniform vec4 uDrops[6]; uniform float uFlow; uniform float uOpacity;
varying vec3 vW; varying vec2 vUv;
float h(vec2 p){
  float d = length(p - uCenter.xz), a = 0.0;
  if (uFlow > 0.0) { a = sin(vUv.y * 40.0 - uTime * 6.0 + sin(vUv.x * 9.0) * 1.5) * 0.5 + sin(vUv.y * 17.0 - uTime * 4.0 + vUv.x * 5.0) * 0.5; return a * uAmp; }
  a += sin(d * 9.0 - uTime * 3.2) / (1.0 + d * 1.6);
  for (int i = 0; i < 6; i++) { vec4 dr = uDrops[i]; float age = uTime - dr.z; if (age < 0.0 || age > 2.5) continue;
    float r = length(p - dr.xy); a += sin(r * 14.0 - age * 9.0) * exp(-age * 1.6) * exp(-pow(r - age * 0.7, 2.0) * 6.0) * 1.2; }
  a += sin(p.x * 3.1 + uTime * 0.9) * 0.15 + sin(p.y * 2.7 - uTime * 0.7) * 0.15;
  return a * uAmp;
}
void main(){
  float e = 0.03; vec2 p = vW.xz;
  vec3 n = normalize(vec3(h(p - vec2(e, 0.0)) - h(p + vec2(e, 0.0)), 2.0 * e, h(p - vec2(0.0, e)) - h(p + vec2(0.0, e))));
  vec3 v = normalize(cameraPosition - vW);
  vec3 r = reflect(-v, n);
  vec3 env = textureCube(uEnv, r).rgb;
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 col = mix(uDeep, env * uTint, clamp(fres + 0.25, 0.0, 1.0));
  float spec = pow(max(dot(r, normalize(vec3(0.3, 0.8, 0.2))), 0.0), 80.0);
  col += spec * 0.6;
  gl_FragColor = vec4(col, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** Plain glossy stand-in for the water shader, used when the world is exported to GLB (Arrival, Blender). */
const exportWater = (deep: number) => Object.assign(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(deep).lerp(new THREE.Color(0x5fb8b0), 0.35), roughness: 0.05, metalness: 0, clearcoat: 1, transmission: 0 }), { name: 'Water' });
function waterMaterial(env: THREE.Texture, o: { deep: number; tint?: number; amp: number; center: THREE.Vector3; flow?: boolean; opacity?: number }) {
  return new THREE.ShaderMaterial({
    vertexShader: waterVert, fragmentShader: waterFrag, transparent: (o.opacity ?? 1) < 1, side: THREE.DoubleSide,
    uniforms: {
      uEnv: { value: env }, uTime: { value: 0 }, uDeep: { value: new THREE.Color(o.deep) }, uTint: { value: new THREE.Color(o.tint ?? 0xbfe8e0) },
      uAmp: { value: o.amp }, uCenter: { value: o.center.clone() }, uFlow: { value: o.flow ? 1 : 0 }, uOpacity: { value: o.opacity ?? 1 },
      uDrops: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0)) },
    },
  });
}

const lathe = (pts: [number, number][], mat: THREE.Material, seg = 48) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), mat);

export function buildArrivalAdds(m: Mats, env: THREE.Texture, fonts: Fonts, openLink: (url: string) => void, inXR: () => boolean) {
  const group = new THREE.Group(); group.name = 'ArrivalAdds';
  const colliders = new THREE.Group();
  const waters: THREE.ShaderMaterial[] = [];
  const panels: { panel: CanvasPanel; label: string }[] = [];
  const animated = new THREE.Group(); animated.userData.keep = true; group.add(animated);
  /** Named parts, for the GLB export (src/export.ts) and the Blender scene. */
  const parts: Record<string, THREE.Object3D> = {};

  // ================= fountain =================
  {
    const f = new THREE.Group(); f.name = 'Fountain'; f.position.copy(FOUNTAIN); group.add(f); parts.fountain = f;
    // portal-ring motif on the ground: labradorite band between gilt rings, like the portal pads
    const band = new THREE.Mesh(new THREE.RingGeometry(2.75, 3.25, 72).rotateX(-Math.PI / 2), m.labradorite); band.position.y = 0.012; f.add(band);
    for (const r of [2.72, 3.28]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 96), m.gilt); t.rotation.x = Math.PI / 2; t.position.y = 0.02; f.add(t); }
    const apron = new THREE.Mesh(new THREE.CircleGeometry(2.75, 72).rotateX(-Math.PI / 2), m.marble); apron.position.y = 0.008; f.add(apron);
    // basin
    f.add(lathe([[0, 0.05], [2.25, 0.05], [2.25, 0.5], [2.45, 0.56], [2.5, 0.62], [2.38, 0.66], [2.15, 0.6], [2.12, 0.1], [0, 0.1]], m.labradoriteDark, 72));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.44, 0.04, 6, 96), m.gilt); rim.rotation.x = Math.PI / 2; rim.position.y = 0.64; f.add(rim);
    // pedestal and upper bowl
    f.add(lathe([[0, 0.1], [0.42, 0.1], [0.3, 0.4], [0.22, 1.0], [0.26, 1.2], [0.95, 1.36], [1.0, 1.46], [0.9, 1.5], [0.2, 1.42], [0.12, 1.6], [0.16, 1.7], [0.08, 1.9], [0, 1.9]], m.labradoriteDark, 48));
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.03, 6, 64), m.gilt); rim2.rotation.x = Math.PI / 2; rim2.position.y = 1.48; f.add(rim2);
    // the portal ring itself, small and gilt, floating over the jet
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 64), m.gilt); ring.position.y = 2.75; ring.rotation.x = Math.PI / 2; ring.name = 'FountainRing'; ring.userData.keep = true; animated.add(ring); ring.position.add(FOUNTAIN); parts.fountainRing = ring;
    const lowW = waterMaterial(env, { deep: 0x0b3a3c, amp: 0.035, center: FOUNTAIN }); waters.push(lowW);
    const low = new THREE.Mesh(new THREE.RingGeometry(0.4, 2.14, 72).rotateX(-Math.PI / 2), lowW); low.userData.exportMat = exportWater(0x0b3a3c); low.position.y = 0.48; low.renderOrder = 0; low.userData.keep = true; f.add(low);
    const upW = waterMaterial(env, { deep: 0x0d4446, amp: 0.02, center: FOUNTAIN.clone().setY(1.44) }); waters.push(upW);
    const up = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48).rotateX(-Math.PI / 2), upW); up.userData.exportMat = exportWater(0x0d4446); up.position.y = 1.44; up.userData.keep = true; f.add(up);
    // collider: you walk around the basin, not through it
    const c = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 3, 24), new THREE.MeshBasicMaterial()); c.position.set(FOUNTAIN.x, 1.5, FOUNTAIN.z); colliders.add(c);
  }
  // spray: one Points draw call, animated in the vertex shader
  const N = 420;
  const seeds = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2; seeds.set([Math.random(), a, 0.15 + Math.random() * 0.55, Math.random() < 0.3 ? 1 : 0], i * 4); }
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  sprayGeo.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 4));
  sprayGeo.boundingSphere = new THREE.Sphere(V(0, 2, 0), 4);
  const sprayMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 300 } },
    vertexShader: /* glsl */ `
      attribute vec4 seed; uniform float uTime; uniform float uScale; varying float vA;
      void main(){
        float T = seed.w > 0.5 ? 1.15 : 0.9;                  // flight time: the tall jet, or the low arcs into the bowl
        float t = fract(uTime / T + seed.x) * T;
        float up = seed.w > 0.5 ? 4.6 : 2.4, out_ = seed.w > 0.5 ? 0.12 : seed.z * 1.4;
        vec3 p = vec3(cos(seed.y) * out_ * t, 1.95 + up * t - 4.9 * t * t, sin(seed.y) * out_ * t);
        vA = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(T * 0.75, T, t));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = uScale * 0.025 / -mv.z;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; gl_FragColor = vec4(0.82, 0.95, 1.0, vA * 0.55 * (1.0 - d * 4.0)); }`,
  });
  const spray = new THREE.Points(sprayGeo, sprayMat); spray.position.copy(FOUNTAIN); spray.frustumCulled = false; animated.add(spray);

  // ================= pond and spring stream =================
  {
    const pond = new THREE.Group(); pond.name = 'Pond'; group.add(pond); parts.pond = pond;
    const P = POND, shape = new THREE.Shape();
    const rAt = (a: number) => 1 + 0.12 * Math.sin(a * 3 + 0.6) + 0.07 * Math.sin(a * 5 + 1.9);
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2, r = rAt(a); const x = Math.cos(a) * P.rx * r, z = Math.sin(a) * P.rz * r; i ? shape.lineTo(x, z) : shape.moveTo(x, z); }
    const pw = waterMaterial(env, { deep: 0x0a2422, tint: 0x9fd0c8, amp: 0.012, center: P.center }); waters.push(pw);
    const water = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48).rotateX(Math.PI / 2), pw); water.userData.exportMat = exportWater(0x0a2422); water.position.copy(P.center).setY(0.03); water.userData.keep = true; pond.add(water);
    // bank: a dark rim just under the water's edge
    const bankShape = new THREE.Shape(); for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2, r = rAt(a) * 1.08; const x = Math.cos(a) * P.rx * r, z = Math.sin(a) * P.rz * r; i ? bankShape.lineTo(x, z) : bankShape.moveTo(x, z); }
    const bank = new THREE.Mesh(new THREE.ShapeGeometry(bankShape, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b2a22, roughness: 1, side: THREE.DoubleSide })); bank.position.copy(P.center).setY(0.015); pond.add(bank);
    // stones round the edge
    const stones: THREE.Matrix4[] = []; const q = new THREE.Quaternion(), e = new THREE.Euler();
    const addStone = (x: number, z: number, s: number) => { e.set(Math.random(), Math.random() * 6, Math.random()); q.setFromEuler(e); stones.push(new THREE.Matrix4().compose(V(x, s * 0.25, z), q, V(s, s * 0.55, s * 0.9))); };
    for (let i = 0; i < 46; i++) { const a = (i / 46) * Math.PI * 2 + Math.random() * 0.05, r = rAt(a) * (1.1 + Math.random() * 0.06); addStone(P.center.x + Math.cos(a) * P.rx * r, P.center.z + Math.sin(a) * P.rz * r, 0.25 + Math.random() * 0.3); }
    // the spring: a rock pile at the head of the stream
    for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * 1.3; addStone(SPRING.x + Math.cos(a) * d, SPRING.z + Math.sin(a) * d, 0.35 + Math.random() * 0.55); }
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6d6a60, roughness: 0.95, flatShading: true });
    const st = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), stoneMat, stones.length); stones.forEach((mx, i) => st.setMatrixAt(i, mx)); pond.add(st);
    // lily pads and a few flowers
    const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(0.36, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lilyTexture(), alphaTest: 0.5, roughness: 0.6, side: THREE.DoubleSide }), 14);
    for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 0.75; pads.setMatrixAt(i, new THREE.Matrix4().compose(V(P.center.x + Math.cos(a) * P.rx * d, 0.045, P.center.z + Math.sin(a) * P.rz * d), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.random() * 6), V(1, 1, 1).multiplyScalar(0.7 + Math.random() * 0.6))); }
    pads.userData.keep = true; pond.add(pads);
    const bloom = new THREE.InstancedMesh(new THREE.ConeGeometry(0.11, 0.12, 8, 1, true).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xf2b6cf, emissive: 0x3a1020, roughness: 0.5, side: THREE.DoubleSide }), 5);
    for (let i = 0; i < 5; i++) { const mx = new THREE.Matrix4(); pads.getMatrixAt(i * 2, mx); const p = V(0, 0, 0).setFromMatrixPosition(mx); bloom.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x + 0.08, 0.1, p.z)); }
    pond.add(bloom);
    // stream: a winding ribbon from the spring to the pond, with flowing water
    const curve = new THREE.CatmullRomCurve3([SPRING.clone().add(V(0.9, 0, 0.8)), V(-11.5, 0, -33.6), V(-9.6, 0, -33.4), V(-8.4, 0, -31.8)]);
    const Ns = 60, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= Ns; i++) {
      const t = i / Ns, p = curve.getPointAt(t), tan = curve.getTangentAt(t), side = V(-tan.z, 0, tan.x).normalize();
      const w = 0.32 + 0.12 * Math.sin(t * 9);
      for (const s of [-1, 1]) { const q2 = p.clone().addScaledVector(side, s * w); pos.push(q2.x, 0.035, q2.z); uv.push(s < 0 ? 0 : 1, t); }
      if (i < Ns) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setIndex(idx); sg.computeVertexNormals();
    const sw = waterMaterial(env, { deep: 0x123c3a, tint: 0xcfeee6, amp: 0.02, center: SPRING, flow: true }); waters.push(sw);
    const stream = new THREE.Mesh(sg, sw); stream.userData.exportMat = exportWater(0x123c3a); stream.userData.keep = true; pond.add(stream);
    // pond collider (low walls so you walk round it, not across it)
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const c = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3, 0.4), new THREE.MeshBasicMaterial()); c.position.set(P.center.x + Math.cos(a) * P.rx * 1.02, 1.5, P.center.z + Math.sin(a) * P.rz * 1.02); c.rotation.y = -a + Math.PI / 2; colliders.add(c); }
  }

  // ================= colonnade vines =================
  const vines = buildVines();
  group.add(vines.grape); parts.grapevine = vines.grape;
  vines.ivy.visible = false; // the Arrival build shows the grapevine and keeps ivy-with-jasmine hidden; flip to try it
  group.add(vines.ivy); parts.ivy = vines.ivy;

  // ================= birds =================
  const birds = new THREE.Group(); birds.name = 'Birds'; animated.add(birds);
  const birdMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.9, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry(); wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.08, 0, 0, -0.1, 0.36, 0, -0.02], 3)); wingGeo.computeVertexNormals();
  const flock: { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; c: THREE.Vector3; r: number; h: number; sp: number; ph: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), birdMat); body.scale.set(0.8, 0.7, 1.9); g.add(body);
    const wl = new THREE.Mesh(wingGeo, birdMat), wr = new THREE.Mesh(wingGeo, birdMat); wr.scale.x = -1; g.add(wl, wr);
    g.scale.setScalar(1.6); birds.add(g);
    flock.push({ g, wl, wr, c: V(14 + (i % 2) * 8, 0, -6 + i * 3), r: 14 + i * 4, h: 10 + i * 1.3, sp: (0.05 + i * 0.012) * (i % 2 ? 1 : -1), ph: i * 1.7 });
  }

  // ================= principles and code of conduct boards =================
  let signedUp = false; // session only: nothing is stored or sent
  const boardPanel = (title: string, draw: (p: CanvasPanel) => void) => {
    const p = new CanvasPanel(1.7, 2.3, 520, pp => { pp.bg(); pp.text(title, 56, 54, { font: `600 22px ${fonts.mono}`, color: INK.teal }); draw(pp); });
    p.fonts = fonts; p.draw(); return p;
  };
  const principles = boardPanel('THE XR GUILD® PRINCIPLES', p => {
    let y = 92; const W = p.W;
    for (const [n, head, body] of PRINCIPLES) {
      p.text(n, 56, y, { font: `30px ${fonts.display}`, color: INK.goldHi });
      const hh = p.wrap(head, 120, y + 2, W - 176, 30, { font: `600 25px ${fonts.body}`, color: INK.text, maxLines: 3 });
      y += Math.max(36, hh) + 2;
      y += p.wrap(body, 120, y, W - 176, 26, { font: `21px ${fonts.body}`, color: INK.dim, maxLines: 3 }) + 14;
    }
    p.text('principles.xrguild.org · CC BY', 56, p.H - 62, { font: `20px ${fonts.mono}`, color: INK.dim });
  });
  const conduct = boardPanel('GUILD HALL CODE OF CONDUCT', p => {
    let y = 96; const W = p.W;
    p.text('Before you join others', 56, y, { font: `48px ${fonts.display}`, color: INK.goldHi }); y += 76;
    for (const line of CONDUCT) { p.text('◆', 56, y + 2, { font: `20px ${fonts.body}`, color: INK.gold }); y += p.wrap(line, 92, y, W - 148, 31, { font: `25px ${fonts.body}` }) + 16; }
    y += 10;
    p.button('in', 56, y, W - 112, 84, signedUp ? 'You’re in. Thank you!' : 'I’m in', () => { signedUp = !signedUp; }, { active: signedUp, font: `600 34px ${fonts.body}` }); y += 104;
    p.wrap('Pressing “I’m in” is a promise to yourself and the room. Nothing is saved or sent.', 56, y, W - 112, 26, { font: `italic 21px ${fonts.body}`, color: INK.dim, maxLines: 3 }); y += 70;
    p.button('read', 56, y, W - 112, 60, 'Read the principles at xrguild.org', () => { if (!inXR()) openLink('https://www.xrguild.org/principles'); });
  });
  [principles, conduct].forEach((pnl, i) => {
    const b = BOARDS[i], g = new THREE.Group(); g.name = i === 0 ? 'PrinciplesBoard' : 'ConductBoard'; g.position.copy(b.pos); g.rotation.y = b.ry; group.add(g); parts[i === 0 ? 'principlesBoard' : 'conductBoard'] = g;
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.86, 2.46, 0.08), m.walnut); fr.position.set(0, 1.55, -0.05); g.add(fr);
    for (const sx of [-0.8, 0.8]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), m.walnutDark); post.position.set(sx, 0.4, -0.06); g.add(post); }
    const crest: THREE.Vector3[] = []; for (let k = 0; k <= 24; k++) { const x = -0.93 + (k / 24) * 1.86; crest.push(V(x, 2.8 + Math.sin((k / 24) * Math.PI) * 0.22, -0.02)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(crest), 32, 0.03, 6), m.gilt));
    const holder = new THREE.Group(); holder.userData.keep = true; holder.position.set(0, 1.55, 0.0); g.add(holder);
    pnl.mesh.position.z = 0.0; holder.add(pnl.mesh);
    panels.push({ panel: pnl, label: i === 0 ? 'XR Guild principles' : 'Code of conduct · I’m in' });
    const c = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3, 0.5), new THREE.MeshBasicMaterial()); c.position.set(b.pos.x, 1.5, b.pos.z); c.rotation.y = b.ry; colliders.add(c);
  });

  // ================= garden sound =================
  const sound = new GardenSound([FOUNTAIN.clone().setY(1), SPRING.clone().setY(0.4), V(-9, 0.2, -32.5)]);

  const drops = waters.slice(0, 2);
  let nextDrop = 0, dropIdx = 0;
  const update = (t: number, dt: number, reduced: boolean, listener: THREE.Object3D) => {
    for (const w of waters) w.uniforms.uTime.value = reduced ? 0 : t;
    sprayMat.uniforms.uTime.value = reduced ? 0.4 : t;
    spray.visible = !reduced;
    // droplets landing in the basins start rings
    if (!reduced && t > nextDrop) {
      nextDrop = t + 0.18 + Math.random() * 0.25;
      const w = drops[dropIdx % 2]; dropIdx++;
      const isLow = w === drops[0], a = Math.random() * Math.PI * 2, r = isLow ? 0.8 + Math.random() * 1.1 : Math.random() * 0.7;
      const arr = w.uniforms.uDrops.value as THREE.Vector4[]; arr.shift(); arr.push(new THREE.Vector4(FOUNTAIN.x + Math.cos(a) * r, FOUNTAIN.z + Math.sin(a) * r, t, 0));
    }
    const ring = animated.getObjectByName('FountainRing'); if (ring && !reduced) { ring.rotation.z = t * 0.25; ring.position.y = 2.75 + Math.sin(t * 0.8) * 0.06; }
    birds.visible = !reduced;
    if (!reduced) for (const b of flock) {
      const a = b.ph + t * b.sp, p = V(b.c.x + Math.cos(a) * b.r, b.h + Math.sin(t * 0.3 + b.ph) * 1.2, b.c.z + Math.sin(a) * b.r);
      const ahead = V(b.c.x + Math.cos(a + Math.sign(b.sp) * 0.05) * b.r, p.y, b.c.z + Math.sin(a + Math.sign(b.sp) * 0.05) * b.r);
      b.g.position.copy(p); b.g.lookAt(ahead);
      const glide = Math.sin(t * 0.5 + b.ph) > 0.4, flap = glide ? 0.12 : Math.sin(t * 11 + b.ph) * 0.7;
      b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
    }
    void dt;
    sound.update(listener, t);
  };
  return { group, colliders, panels, update, sound, vines, parts, setIvy: (on: boolean) => { vines.ivy.visible = on; } };
}

// ---------- vines along the colonnade ----------
function lintelCurves() {
  // must match src/walk.ts: gilt lintels run along both sides at capY + 0.8, 2.05 m from the path centre line
  const len = PATH_CURVE.getLength(), pairs = Math.max(6, Math.round(len / 2.3)), colOff = 1.7 + 0.35, y = 3.3 + 0.8, up = V(0, 1, 0);
  const sides: THREE.Vector3[][] = [[], []], cols: THREE.Vector3[] = [];
  for (let i = 0; i <= pairs; i++) {
    const t = 0.04 + (i / pairs) * 0.92, p = PATH_CURVE.getPointAt(t), tan = PATH_CURVE.getTangentAt(t).setY(0).normalize(), side = new THREE.Vector3().crossVectors(up, tan).normalize();
    [-1, 1].forEach((s, si) => { const c = p.clone().addScaledVector(side, s * colOff); sides[si].push(c.clone().setY(y)); if (i % 2 === 0) cols.push(c); });
  }
  return { curves: sides.map(pts => new THREE.CatmullRomCurve3(pts)), cols, y };
}

function buildVines() {
  const { curves, cols } = lintelCurves();
  const grape = new THREE.Group(); grape.name = 'Grapevine';
  const ivy = new THREE.Group(); ivy.name = 'IvyJasmine';
  const leafGeo = new THREE.PlaneGeometry(0.26, 0.26); leafGeo.translate(0, -0.1, 0);
  const grapeMat = new THREE.MeshStandardMaterial({ map: leafTexture('grape'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, vertexColors: false });
  const palette = [0xc8761e, 0xb54a1c, 0x8f2a17, 0xd99a2b, 0x9a3b1a, 0x6f7a24].map(c => new THREE.Color(c));
  const mats: THREE.Matrix4[] = [], cols2: THREE.Color[] = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  const place = (p: THREE.Vector3, s: number, droop: number) => { e.set(droop + (Math.random() - 0.5) * 0.8, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.9); q.setFromEuler(e); mats.push(new THREE.Matrix4().compose(p, q, V(s, s, s))); cols2.push(palette[Math.floor(Math.random() * palette.length)]); };
  const clusters: THREE.Vector3[] = [];
  for (const c of curves) {
    const L = c.getLength(), n = Math.round(L / 0.09);
    for (let i = 0; i < n; i++) {
      const t = i / n, p = c.getPointAt(t);
      // the vine wanders along the lintel, with leaves above, beside and hanging below it
      p.y += Math.sin(t * 40) * 0.08 + (Math.random() - 0.5) * 0.18 - 0.05; p.x += (Math.random() - 0.5) * 0.2; p.z += (Math.random() - 0.5) * 0.2;
      place(p, 0.8 + Math.random() * 0.6, 0.4);
      if (Math.random() < 0.035) clusters.push(c.getPointAt(t).add(V(0, -0.2, 0)));
    }
  }
  const leaves = new THREE.InstancedMesh(leafGeo, grapeMat, mats.length);
  mats.forEach((mx, i) => { leaves.setMatrixAt(i, mx); leaves.setColorAt(i, cols2[i]); });
  grape.add(leaves);
  // grape clusters: one merged cluster shape, instanced
  const berries: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 22; k++) { const yy = -k * 0.012, rr = 0.06 * (1 - k / 26); const a = k * 2.4; const g = new THREE.SphereGeometry(0.026, 7, 5); g.translate(Math.cos(a) * rr, yy - Math.random() * 0.02, Math.sin(a) * rr); berries.push(g.toNonIndexed()); }
  const clusterGeo = mergeGeometries(berries); berries.forEach(g => g.dispose());
  const grapeBerry = new THREE.InstancedMesh(clusterGeo, new THREE.MeshPhysicalMaterial({ color: 0x3b1d4a, roughness: 0.35, clearcoat: 0.6, sheen: 0.4, sheenColor: new THREE.Color(0x8a6aa8) }), clusters.length);
  clusters.forEach((p, i) => grapeBerry.setMatrixAt(i, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), i), V(1, 1, 1).multiplyScalar(0.9 + Math.random() * 0.4))));
  grape.add(grapeBerry);
  // tendrils: a few curls of thin stem
  const tendrilMat = new THREE.MeshStandardMaterial({ color: 0x6b5a2a, roughness: 0.8 });
  const tg: THREE.BufferGeometry[] = [];
  for (const c of curves) for (let i = 0; i < 14; i++) {
    const p0 = c.getPointAt(Math.random()); const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) { const u = k / 16, a = u * 12; pts.push(p0.clone().add(V(Math.cos(a) * 0.05 * (1 - u), -u * 0.35, Math.sin(a) * 0.05 * (1 - u)))); }
    tg.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.004, 3).toNonIndexed());
  }
  grape.add(new THREE.Mesh(mergeGeometries(tg), tendrilMat));

  // ivy with jasmine: climbing the arch-bearing columns and along the lintels
  const ivyMat = new THREE.MeshStandardMaterial({ map: leafTexture('ivy'), alphaTest: 0.5, side: THREE.DoubleSide, color: 0x2f6a34, roughness: 0.6 });
  const ivyM: THREE.Matrix4[] = [], jas: THREE.Matrix4[] = [];
  for (const c of cols) for (let i = 0; i < 60; i++) { const u = i / 60, a = u * 9 + Math.random() * 0.4; const p = c.clone().add(V(Math.cos(a) * 0.27, 0.5 + u * 3.3, Math.sin(a) * 0.27)); e.set(Math.random() - 0.5, a + Math.PI / 2, Math.random() - 0.5); ivyM.push(new THREE.Matrix4().compose(p, q.setFromEuler(e).clone(), V(0.7, 0.7, 0.7))); if (Math.random() < 0.25) jas.push(new THREE.Matrix4().compose(p.clone().add(V(0, 0.04, 0)), q.clone(), V(0.5, 0.5, 0.5))); }
  for (const c of curves) { const L = c.getLength(), n = Math.round(L / 0.12); for (let i = 0; i < n; i++) { const p = c.getPointAt(i / n).add(V((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2 - 0.08, (Math.random() - 0.5) * 0.2)); e.set(Math.random() - 0.2, Math.random() * 6, Math.random() - 0.5); ivyM.push(new THREE.Matrix4().compose(p, q.setFromEuler(e).clone(), V(0.75, 0.75, 0.75))); if (Math.random() < 0.3) jas.push(new THREE.Matrix4().compose(p.clone().add(V(0, -0.05, 0)), q.clone(), V(0.5, 0.5, 0.5))); } }
  const ivyLeaves = new THREE.InstancedMesh(leafGeo, ivyMat, ivyM.length); ivyM.forEach((mx, i) => ivyLeaves.setMatrixAt(i, mx)); ivy.add(ivyLeaves);
  const flowers = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.09), new THREE.MeshStandardMaterial({ map: jasmineTexture(), alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x302820, roughness: 0.5 }), jas.length);
  jas.forEach((mx, i) => flowers.setMatrixAt(i, mx)); ivy.add(flowers);
  return { grape, ivy };
}

// ---------- procedural garden sound: birdsong, the fountain and the stream ----------
/**
 * Everything is synthesised: no audio files. Birdsong is a few short frequency sweeps from a random tree near you;
 * water is filtered noise placed at the fountain, the spring and the stream. Starts after the visitor's first click
 * (browsers require a gesture), and Comfort → Garden sounds turns it off.
 */
export class GardenSound {
  ctx: AudioContext | null = null;
  enabled = true;
  night = true;
  private master: GainNode | null = null;
  private nextSong = 0;
  private trees: THREE.Vector3[] = [V(12, 6, -20), V(-9, 6, -24), V(44, 6, 14), V(-20, 6, 17), V(47, 6, -24), V(37, 6, 30), V(-13, 6, 26), V(6, 6, 24)];
  constructor(private waters: THREE.Vector3[]) {}
  start() {
    if (this.ctx || !this.enabled) { this.ctx?.resume(); return; }
    const ctx = this.ctx = new AudioContext();
    this.master = new GainNode(ctx, { gain: 0.5 }); this.master.connect(ctx.destination);
    // one shared noise buffer, looped
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.waters.forEach((p, i) => {
      const src = new AudioBufferSourceNode(ctx, { buffer: buf, loop: true, loopStart: Math.random(), playbackRate: 0.9 + i * 0.07 });
      const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: i === 0 ? 900 : 1500, Q: 0.6 });
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: i === 0 ? 2600 : 3400 });
      const g = new GainNode(ctx, { gain: i === 0 ? 0.32 : 0.16 });
      // slow wobble so the water burbles instead of hissing
      const lfo = new OscillatorNode(ctx, { frequency: 0.6 + i * 0.4 }), lg = new GainNode(ctx, { gain: i === 0 ? 0.08 : 0.06 }); lfo.connect(lg).connect(g.gain); lfo.start();
      const pan = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: i === 0 ? 2.5 : 1.5, rolloffFactor: 1.6, maxDistance: 40, positionX: p.x, positionY: p.y, positionZ: p.z });
      src.connect(bp).connect(lp).connect(g).connect(pan).connect(this.master!); src.start();
    });
  }
  setEnabled(on: boolean) { this.enabled = on; if (this.master) this.master.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx!.currentTime, 0.3); if (on) this.start(); }
  private song(at: THREE.Vector3) {
    const ctx = this.ctx!, t0 = ctx.currentTime + 0.05;
    const pan = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 4, rolloffFactor: 1.2, maxDistance: 60, positionX: at.x, positionY: at.y, positionZ: at.z });
    pan.connect(this.master!);
    const notes = 3 + Math.floor(Math.random() * 6), base = this.night ? 1400 + Math.random() * 500 : 2600 + Math.random() * 1600;
    let t = t0;
    for (let k = 0; k < notes; k++) {
      const o = new OscillatorNode(ctx, { type: 'sine', frequency: base }), g = new GainNode(ctx, { gain: 0 });
      const dur = 0.05 + Math.random() * 0.1, f1 = base * (0.8 + Math.random() * 0.6);
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(this.night ? 0.05 : 0.09, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      o.connect(g).connect(pan); o.start(t); o.stop(t + dur + 0.02);
      t += dur + 0.03 + Math.random() * 0.08;
    }
    setTimeout(() => pan.disconnect(), (t - t0 + 0.5) * 1000);
  }
  update(listener: THREE.Object3D, time: number) {
    const ctx = this.ctx; if (!ctx || !this.enabled) return;
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), f = new THREE.Vector3(0, 0, -1), u = new THREE.Vector3(0, 1, 0);
    listener.getWorldPosition(p); listener.getWorldQuaternion(q); f.applyQuaternion(q); u.applyQuaternion(q);
    const L = ctx.listener;
    if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z; }
    if (time > this.nextSong) {
      this.nextSong = time + (this.night ? 9 : 2.5) + Math.random() * (this.night ? 14 : 6);
      const near = this.trees.filter(tr => tr.distanceTo(p) < 35);
      if (near.length) this.song(near[Math.floor(Math.random() * near.length)]);
    }
  }
}
