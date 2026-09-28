import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Peer } from './net/presence';

/**
 * Avatar renderer built for crowds:
 *  - everyone is drawn as an instanced mannequin (two draw calls for 200 people)
 *  - the nearest few (default 12) with a VRM get their real avatar via @pixiv/three-vrm, with a procedural idle / walk / sit
 *  - nameplates + speaking rings only for the nearest 16; chat bubbles for the nearest 8
 *  - a personal-space bubble hides anyone who walks into you (0.6 m)
 */
const MAX = 220, NEAR_VRM = 12, NEAR_TAGS = 16, BUBBLE = 0.6;

type VrmSlot = { url: string; root: THREE.Object3D; vrm: any; lastUsed: number };

export class Avatars {
  group = new THREE.Group();
  private body: THREE.InstancedMesh; private head: THREE.InstancedMesh;
  private tags: { sprite: THREE.Sprite; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; key: string }[] = [];
  private rings: THREE.Sprite[] = [];
  private bubbles: { sprite: THREE.Sprite; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; key: string }[] = [];
  private vrms = new Map<string, VrmSlot>();
  private loading = new Set<string>();
  private failed = new Set<string>();
  private bufCache = new Map<string, Promise<ArrayBuffer>>();
  private vrmLib: Promise<any> | null = null;
  fetchAvatar: ((url: string) => Promise<ArrayBuffer>) | null = null; // VIVERSE: avatarClient.getAvatarFileWithSDK
  vrmEnabled = true;
  maxVrm = NEAR_VRM;

  constructor(private fonts: { display: string; body: string }) {
    this.group.name = 'Avatars';
    const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.72, 4, 12); bodyGeo.translate(0, 0.78, 0);
    const headGeo = new THREE.SphereGeometry(0.13, 16, 12); headGeo.translate(0, 1.47, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.15, envMapIntensity: 0.8 });
    const hmat = new THREE.MeshPhysicalMaterial({ roughness: 0.2, clearcoat: 1, color: 0xf4efe2, envMapIntensity: 1 });
    this.body = new THREE.InstancedMesh(bodyGeo, mat, MAX); this.head = new THREE.InstancedMesh(headGeo, hmat, MAX);
    for (const im of [this.body, this.head]) { im.count = 0; im.frustumCulled = false; this.group.add(im); }
    for (let i = 0; i < NEAR_TAGS; i++) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 96; const ctx = c.getContext('2d')!;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sprite.scale.set(0.9, 0.17, 1); sprite.visible = false; sprite.renderOrder = 10;
      this.group.add(sprite); this.tags.push({ sprite, ctx, tex, key: '' });
      const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex(), color: 0x5fe0c6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); ring.scale.setScalar(0.34); ring.visible = false; this.group.add(ring); this.rings.push(ring);
    }
    for (let i = 0; i < 8; i++) {
      const c = document.createElement('canvas'); c.width = 640; c.height = 200; const ctx = c.getContext('2d')!;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sprite.scale.set(1.2, 0.375, 1); sprite.visible = false; sprite.renderOrder = 11;
      this.group.add(sprite); this.bubbles.push({ sprite, ctx, tex, key: '' });
    }
  }

  private lib() { return (this.vrmLib ??= import('@pixiv/three-vrm')); }
  private buffer(url: string) {
    let p = this.bufCache.get(url);
    if (!p) { p = (this.fetchAvatar ? this.fetchAvatar(url) : fetch(url).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })); this.bufCache.set(url, p); }
    return p;
  }
  private async loadVrm(id: string, url: string) {
    if (this.loading.size >= 2 || this.loading.has(id)) return;
    this.loading.add(id);
    try {
      const [{ VRMLoaderPlugin, VRMUtils }, buf] = await Promise.all([this.lib(), this.buffer(url)]);
      const loader = new GLTFLoader(); loader.register((p: any) => new VRMLoaderPlugin(p));
      const gltf: any = await loader.parseAsync(buf.slice(0), '');
      const vrm = gltf.userData.vrm; if (!vrm) throw new Error('not a VRM');
      VRMUtils.removeUnnecessaryVertices(gltf.scene); VRMUtils.combineSkeletons?.(gltf.scene); VRMUtils.rotateVRM0(vrm);
      vrm.scene.traverse((o: any) => { o.frustumCulled = false; });
      const root = new THREE.Group(); root.add(vrm.scene); this.group.add(root);
      this.vrms.set(id, { url, root, vrm, lastUsed: performance.now() });
    } catch (e) { console.warn('[avatars] VRM failed, using mannequin', e); this.failed.add(url); }
    finally { this.loading.delete(id); }
  }
  private dropVrm(id: string) {
    const s = this.vrms.get(id); if (!s) return;
    s.root.removeFromParent();
    s.root.traverse((o: any) => { o.geometry?.dispose?.(); const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; mats.forEach((m: any) => { m.map?.dispose?.(); m.dispose?.(); }); });
    this.vrms.delete(id);
  }

  update(peers: Map<string, Peer>, me: THREE.Vector3, camera: THREE.Camera, dt: number, t: number, speaking: Set<string>) {
    const list = [...peers.values()].map(p => ({ p, d: Math.hypot(p.rp.x - me.x, p.rp.z - me.z) })).sort((a, b) => a.d - b.d);
    const now = performance.now();
    // decide who gets a VRM
    const wantVrm = new Set<string>();
    if (this.vrmEnabled) for (const { p, d } of list) { if (wantVrm.size >= this.maxVrm) break; if (p.avatar && !this.failed.has(p.avatar) && d < 18) wantVrm.add(p.id); }
    for (const id of wantVrm) { const p = peers.get(id)!; const s = this.vrms.get(id); if (s && s.url !== p.avatar) this.dropVrm(id); if (!this.vrms.has(id)) this.loadVrm(id, p.avatar!); }
    for (const [id, s] of this.vrms) { if (!wantVrm.has(id)) { if (now - s.lastUsed > 20000 || !peers.has(id)) this.dropVrm(id); else s.root.visible = false; } }

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    let n = 0;
    for (const { p, d } of list) {
      if (n >= MAX) break;
      const hidden = d < BUBBLE;
      const slot = wantVrm.has(p.id) ? this.vrms.get(p.id) : undefined;
      if (slot) {
        slot.lastUsed = now; slot.root.visible = !hidden;
        slot.root.position.copy(p.rp); slot.root.rotation.y = p.rry;
        pose(slot.vrm, p, t);
        slot.vrm.update(dt);
        continue;
      }
      const seated = !!p.seat;
      const s = hidden ? 0.0001 : 1;
      q.setFromAxisAngle(up, p.rry);
      m.compose(p.rp.clone().setY(p.rp.y + (seated ? -0.28 : 0)), q, new THREE.Vector3(s, s * (seated ? 0.86 : 1), s));
      this.body.setMatrixAt(n, m); this.head.setMatrixAt(n, m);
      this.body.setColorAt(n, col.setHex(p.color)); n++;
    }
    this.body.count = this.head.count = n;
    this.body.instanceMatrix.needsUpdate = this.head.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;

    // nameplates + speaking rings
    this.tags.forEach((tg, i) => {
      const e = list[i]; const ring = this.rings[i];
      if (!e || e.d > 14 || e.d < BUBBLE) { tg.sprite.visible = false; ring.visible = false; return; }
      const p = e.p, h = p.seat ? 1.45 : 1.95;
      const key = p.name + '|' + p.onStage;
      if (tg.key !== key) { drawTag(tg.ctx, p.name, p.onStage, this.fonts); tg.tex.needsUpdate = true; tg.key = key; }
      tg.sprite.visible = true; tg.sprite.position.set(p.rp.x, p.rp.y + h, p.rp.z);
      const sp = speaking.has(p.id);
      ring.visible = sp; if (sp) { ring.position.set(p.rp.x, p.rp.y + h + 0.17, p.rp.z); ring.material.opacity = 0.6 + Math.sin(t * 9) * 0.3; }
    });
    // chat bubbles
    const talkers = list.filter(e => e.p.bubble && e.d < 16 && e.d >= BUBBLE).slice(0, this.bubbles.length);
    this.bubbles.forEach((b, i) => {
      const e = talkers[i]; if (!e) { b.sprite.visible = false; return; }
      const p = e.p; const key = p.id + p.bubble!.text;
      if (b.key !== key) { drawBubble(b.ctx, p.bubble!.text, this.fonts); b.tex.needsUpdate = true; b.key = key; }
      b.sprite.visible = true; b.sprite.position.set(p.rp.x, p.rp.y + (p.seat ? 1.8 : 2.32), p.rp.z);
    });
    void camera;
  }
  dispose() { for (const id of [...this.vrms.keys()]) this.dropVrm(id); }
}

/** Procedural pose on the normalized humanoid rig: idle breathing, walk cycle from speed, and sitting. */
function pose(vrm: any, p: Peer, t: number) {
  const h = vrm.humanoid; if (!h) return;
  const b = (n: string) => h.getNormalizedBoneNode(n);
  const hips = b('hips'), lUL = b('leftUpperLeg'), rUL = b('rightUpperLeg'), lLL = b('leftLowerLeg'), rLL = b('rightLowerLeg');
  const lUA = b('leftUpperArm'), rUA = b('rightUpperArm'), spine = b('spine'), lLA = b('leftLowerArm'), rLA = b('rightLowerArm');
  const seated = !!p.seat;
  const walk = Math.min(1, p.speed / 1.2) * (seated ? 0 : 1);
  const ph = t * 7;
  if (hips) { hips.position.y = seated ? -0.42 : Math.abs(Math.sin(ph)) * 0.03 * walk; hips.position.z = seated ? -0.06 : 0; }
  const swing = Math.sin(ph) * 0.55 * walk;
  if (lUL) lUL.rotation.x = seated ? -1.45 : swing;
  if (rUL) rUL.rotation.x = seated ? -1.45 : -swing;
  if (lLL) lLL.rotation.x = seated ? 1.5 : Math.max(0, -Math.sin(ph)) * 0.8 * walk;
  if (rLL) rLL.rotation.x = seated ? 1.5 : Math.max(0, Math.sin(ph)) * 0.8 * walk;
  if (lUA) { lUA.rotation.z = 1.2; lUA.rotation.x = -swing * 0.6; }
  if (rUA) { rUA.rotation.z = -1.2; rUA.rotation.x = swing * 0.6; }
  if (lLA) lLA.rotation.y = seated ? 0.5 : 0.15; if (rLA) rLA.rotation.y = seated ? -0.5 : -0.15;
  if (spine) spine.rotation.x = Math.sin(t * 1.6) * 0.02 + (seated ? 0.05 : 0);
}

function ringTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 26, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(64, 64, 26, Math.PI - 0.9, Math.PI + 0.9); g.stroke();
  const t = new THREE.CanvasTexture(c); return t;
}
function drawTag(g: CanvasRenderingContext2D, name: string, stage: boolean, f: { display: string; body: string }) {
  g.clearRect(0, 0, 512, 96);
  g.font = `600 40px ${f.body}`; const w = Math.min(500, g.measureText(name).width + 56);
  g.fillStyle = 'rgba(8,22,20,0.82)'; g.beginPath(); g.roundRect((512 - w) / 2, 14, w, 68, 34); g.fill();
  g.strokeStyle = stage ? '#f1d58f' : 'rgba(216,174,90,0.6)'; g.lineWidth = stage ? 4 : 2; g.stroke();
  g.fillStyle = '#efe6cf'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 256, 50, 470);
}
function drawBubble(g: CanvasRenderingContext2D, text: string, f: { display: string; body: string }) {
  g.clearRect(0, 0, 640, 200);
  g.fillStyle = 'rgba(244,239,226,0.95)'; g.beginPath(); g.roundRect(10, 10, 620, 150, 28); g.fill();
  g.beginPath(); g.moveTo(300, 158); g.lineTo(320, 192); g.lineTo(340, 158); g.fill();
  g.fillStyle = '#10231f'; g.font = `34px ${f.body}`; g.textBaseline = 'top'; g.textAlign = 'left';
  const words = text.split(/\s+/); let line = '', y = 30, lines = 0;
  for (const w of words) { const tt = line ? line + ' ' + w : w; if (g.measureText(tt).width > 580) { g.fillText(line, 30, y); y += 40; line = w; if (++lines === 2) { line = line + '…'; break; } } else line = tt; }
  g.fillText(line, 30, y);
}
