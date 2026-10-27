import * as THREE from 'three';
import { fbm } from './tex';

/**
 * V3 textures ported from the Arrival.space build (Sept–Oct 2026 changes):
 *  - simpler Guild Hall floor: deep green marble with a quiet gilt grid, keeping the labradorite compass
 *  - Library floor: red marble with flashes of labradorite; labradorite-and-gold compass at the centre
 *  - grapevine and ivy leaves, jasmine flowers and lily pads for the colonnade vines and the pond
 */
function canvas(w: number, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!] as const; }
function tex(c: HTMLCanvasElement, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; return t;
}
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: number[], b: number[], t: number) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Marble with veins and optional labradorite flashes. Tileable. */
function veinedMarble(size: number, base: string, base2: string, vein: string, flashes: number) {
  const [c, g] = canvas(size); const img = g.createImageData(size, size);
  const b0 = hex(base), b1 = hex(base2), v0 = hex(vein), blue = hex('#2f6fd0'), teal = hex('#27b39b'), gold = hex('#c7a13c');
  const per = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * per, v = y / size * per;
    const n = fbm(u, v, 5, per);
    let col = mix3(b0, b1, fbm(u * 1.5 + 7, v * 1.5 + 3, 4, per * 2));
    const turb = Math.abs(Math.sin((u * 0.8 + v) * 2.2 + n * 8));
    col = mix3(col, v0, smooth(0.1, 0.0, turb) * 0.6);
    if (flashes > 0) {
      const f = smooth(0.62, 0.8, fbm(u * 1.2 + 31, v * 1.2 + 17, 4, per * 2)) * smooth(0.5, 0.95, Math.sin((u * 1.7 - v * 0.9) * 5 + n * 6));
      const h = fbm(u * 0.4 + 2, v * 0.4 + 9, 2, 2);
      col = mix3(col, h < 0.45 ? blue : h < 0.6 ? teal : gold, f * flashes);
    }
    const i = (y * size + x) * 4; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Guild Hall floor: deep green marble, a quiet gilt grid every metre and a half. */
export function hallFloorV3(size = 1024) {
  const c = veinedMarble(size, '#0f2f2a', '#173f37', '#4f8f80', 0.25);
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(214,170,86,0.55)'; g.lineWidth = Math.max(2, size / 512);
  for (let i = 0; i <= 2; i++) { const p = (i / 2) * size; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke(); }
  return tex(c, 1);
}

/** Library floor: red marble with labradorite flashes. */
export function libraryFloorV3(size = 1024) { return tex(veinedMarble(size, '#5a1418', '#7d2224', '#c25a48', 0.55), 1); }

/**
 * Compass medallion (transparent outside the disc): sixteen-point star in labradorite blues and teal on
 * a dark ground, with gilt rings and a gold centre. `hole` leaves the middle empty (for the Connect table).
 */
export function compassDecal(size = 1024, hole = 0) {
  const [c, g] = canvas(size); const R = size / 2;
  g.translate(R, R);
  const ring = (r: number, w: number, col: string) => { g.beginPath(); g.arc(0, 0, r * R, 0, Math.PI * 2); g.lineWidth = w * R; g.strokeStyle = col; g.stroke(); };
  g.beginPath(); g.arc(0, 0, R * 0.98, 0, Math.PI * 2); g.fillStyle = '#0b1c1e'; g.fill();
  // labradorite ground
  const lg = g.createRadialGradient(0, 0, R * 0.1, 0, 0, R); lg.addColorStop(0, '#1a3b55'); lg.addColorStop(0.6, '#123236'); lg.addColorStop(1, '#0d2224');
  g.beginPath(); g.arc(0, 0, R * 0.9, 0, Math.PI * 2); g.fillStyle = lg; g.fill();
  const star = (n: number, r0: number, r1: number, fillA: string, fillB: string, rot = 0) => {
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2, da = Math.PI / n;
      for (const [s, f] of [[1, fillA], [-1, fillB]] as const) {
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r1 * R, Math.sin(a) * r1 * R); g.lineTo(Math.cos(a + s * da) * r0 * R, Math.sin(a + s * da) * r0 * R); g.closePath(); g.fillStyle = f; g.fill();
      }
    }
  };
  star(16, 0.22, 0.62, '#1f5e8a', '#173f66', Math.PI / 16);
  star(8, 0.26, 0.86, '#27b39b', '#1b7f72');
  star(4, 0.3, 0.95, '#3f86d8', '#2a5fa6', 0);
  // gold edges on the cardinal points
  g.strokeStyle = 'rgba(232,194,106,0.9)'; g.lineWidth = R * 0.008;
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a + Math.PI / 4) * 0.3 * R, Math.sin(a + Math.PI / 4) * 0.3 * R); g.lineTo(Math.cos(a) * 0.95 * R, Math.sin(a) * 0.95 * R); g.lineTo(Math.cos(a - Math.PI / 4) * 0.3 * R, Math.sin(a - Math.PI / 4) * 0.3 * R); g.stroke(); }
  ring(0.97, 0.018, '#d8ae5a'); ring(0.9, 0.008, '#e8c26a'); ring(0.66, 0.006, 'rgba(232,194,106,.7)');
  const cg = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.2); cg.addColorStop(0, '#f2d79a'); cg.addColorStop(1, '#a8802f');
  g.beginPath(); g.arc(0, 0, R * 0.16, 0, Math.PI * 2); g.fillStyle = cg; g.fill(); ring(0.16, 0.01, '#5a3f12');
  if (hole > 0) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, 0, hole * R, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over'; ring(hole + 0.008, 0.012, '#d8ae5a'); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/** A leaf card: one leaf drawn into a transparent texture. kind: grape (five-lobed) or ivy (three-lobed). */
export function leafTexture(kind: 'grape' | 'ivy', size = 128) {
  const [c, g] = canvas(size); const s = size / 2;
  g.translate(s, s * 1.05);
  const lobes = kind === 'grape' ? 5 : 3, spread = kind === 'grape' ? 2.3 : 1.6;
  g.beginPath();
  // polar leaf outline: r(a) with lobes, a in [0, 2π), tip pointing up
  for (let i = 0; i <= 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    const lobe = Math.pow(Math.abs(Math.cos(a * lobes / 2)), 0.6);
    const r = s * 0.82 * (0.55 + 0.45 * lobe) * (0.75 + 0.25 * Math.sin(a));
    const x = Math.cos(a - Math.PI / 2) * r, y = Math.sin(a - Math.PI / 2) * r * 0.95;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  const grd = g.createRadialGradient(0, 0, 2, 0, 0, s); grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#b8b8b8');
  g.fillStyle = grd; g.fill();
  g.strokeStyle = 'rgba(60,40,20,0.45)'; g.lineWidth = 2;
  for (let k = 0; k < lobes; k++) { const a = -Math.PI / 2 + (k - (lobes - 1) / 2) * (spread / lobes) * 1.3; g.beginPath(); g.moveTo(0, s * 0.1); g.lineTo(Math.cos(a) * s * 0.7, Math.sin(a) * s * 0.7); g.stroke(); }
  return new THREE.CanvasTexture(c);
}

/** Five-petal white jasmine flower on transparency. */
export function jasmineTexture(size = 64) {
  const [c, g] = canvas(size); const s = size / 2; g.translate(s, s);
  for (let k = 0; k < 5; k++) { g.save(); g.rotate((k / 5) * Math.PI * 2); g.beginPath(); g.ellipse(0, -s * 0.45, s * 0.2, s * 0.42, 0, 0, Math.PI * 2); g.fillStyle = '#fbf7ee'; g.fill(); g.restore(); }
  g.beginPath(); g.arc(0, 0, s * 0.14, 0, Math.PI * 2); g.fillStyle = '#f2d36b'; g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Lily pad: notched green disc with veins. */
export function lilyTexture(size = 128) {
  const [c, g] = canvas(size); const s = size / 2; g.translate(s, s);
  g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s * 0.95, 0.18, Math.PI * 2 - 0.18); g.closePath();
  const grd = g.createRadialGradient(0, 0, 2, 0, 0, s); grd.addColorStop(0, '#5f9a4a'); grd.addColorStop(1, '#2f5f2a'); g.fillStyle = grd; g.fill();
  g.strokeStyle = 'rgba(200,230,170,0.35)'; g.lineWidth = 1.5;
  for (let k = 0; k < 14; k++) { const a = 0.3 + (k / 13) * (Math.PI * 2 - 0.6); g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.9); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
