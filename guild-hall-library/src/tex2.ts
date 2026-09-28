import * as THREE from 'three';
import { fbm, vnoise } from './tex';

// Textures for the v3 Guild Hall: strong wood grain, stained glass (dome, clerestory),
// Moorish zellige tile with XR touches. All procedural, so nothing extra to download.

function canvas(w: number, h = w) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}
function tex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: number[], b: number[], t: number) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
let s = 9001; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

export type WoodTone = 'cherry' | 'walnut' | 'oak';
const TONES: Record<WoodTone, [string, string, string, string]> = {
  // earlywood, latewood (grain lines), highlight, pore
  cherry: ['#5a2616', '#33120a', '#7a3a22', '#1c0803'],
  walnut: ['#5a3a22', '#2c190c', '#7d5634', '#170b04'],
  oak: ['#9c7446', '#5e4022', '#c29a64', '#3a2612'],
};

/**
 * Flat-sawn boards: cathedral arches, long fibres, pores, plank seams and the odd knot.
 * Grain runs along V. `planks` boards across U. Returns colour + bump (for real relief under light).
 */
export function woodGrain(tone: WoodTone = 'walnut', size = 1024, planks = 4) {
  const [c, g] = canvas(size); const [cb, gb] = canvas(size / 2);
  const img = g.createImageData(size, size), bimg = gb.createImageData(size / 2, size / 2);
  const [e, l, hi, pore] = TONES[tone].map(hex);
  const pw = size / planks;
  const knots: [number, number, number][] = []; s = 4242 + tone.length;
  for (let i = 0; i < planks * 1.2; i++) if (rnd() < 0.5) knots.push([rnd() * size, rnd() * size, 8 + rnd() * 14]);
  const plankTint = Array.from({ length: planks }, () => 0.85 + rnd() * 0.3);
  const plankOff = Array.from({ length: planks }, () => rnd() * 50);
  const bumpAt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = Math.floor(x / pw), lx = (x % pw) / pw; // 0..1 across the board
    const v = y / size;
    const warp = fbm(lx * 2 + p * 7, v * 3 + plankOff[p], 4, 64) * 2.2;
    // cathedral figure: distance from the board's centre line bent into arches along V
    const arch = Math.abs(lx - 0.5) * 3.2 + Math.cos(v * Math.PI * 2 * 1.5 + plankOff[p]) * 0.35 + warp;
    const ring = arch * 11;
    const f = ring - Math.floor(ring);
    const late = smooth(0.55, 0.8, f) * (1 - smooth(0.85, 1.0, f)); // sharp latewood line
    const fibre = vnoise(x * 0.9 + p * 50, y * 0.04, 4096) * 0.5 + vnoise(x * 3.1, y * 0.12, 4096) * 0.5;
    let col = mix3(e, hi, fbm(lx * 3 + p, v * 8, 3, 64) * 0.55);
    col = mix3(col, l, late * 0.85 + (fibre - 0.5) * 0.35);
    // pores: fine dark dashes along the grain
    const pr = vnoise(x * 2.4 + p * 13, y * 0.35, 4096);
    col = mix3(col, pore, smooth(0.78, 0.93, pr) * 0.55);
    // knots
    let kb = 0;
    for (const [kx, ky, kr] of knots) {
      const dx = (x - kx) / kr, dy = (y - ky) / (kr * 1.7), d = Math.hypot(dx, dy);
      if (d < 3) { const kr2 = Math.sin(d * 7) * 0.5 + 0.5; col = mix3(col, l, (1 - smooth(0.6, 3, d)) * (0.4 + 0.5 * kr2)); if (d < 0.8) col = mix3(col, pore, 0.7 * (1 - d / 0.8)); kb += (1 - smooth(0, 3, d)) * 0.5; }
    }
    const t = plankTint[p]; col = [col[0] * t, col[1] * t, col[2] * t];
    // plank seams
    const seam = Math.min(x % pw, pw - (x % pw));
    if (seam < 1.5) col = mix3(col, [18, 8, 4], 0.85);
    const i = (y * size + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    bumpAt[y * size + x] = 0.55 - late * 0.25 - smooth(0.78, 0.93, pr) * 0.35 - (seam < 2 ? 0.5 : 0) + kb * 0.2;
  }
  g.putImageData(img, 0, 0);
  const hs = size / 2;
  for (let y = 0; y < hs; y++) for (let x = 0; x < hs; x++) { const v = Math.max(0, Math.min(1, bumpAt[(y * 2) * size + x * 2])) * 255; const i = (y * hs + x) * 4; bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = v; bimg.data[i + 3] = 255; }
  gb.putImageData(bimg, 0, 0);
  return { map: tex(c), bump: tex(cb, false) };
}

// ---------- XR glyphs shared by the stained glass ----------
type G = CanvasRenderingContext2D;
const glyph = {
  cube: (g: G, r: number) => { // a tesseract: cube in a cube, as in DeeDee's dome
    const sq = (k: number) => { g.strokeRect(-k, -k, 2 * k, 2 * k); };
    const a = r * 0.62, b = r * 0.32, o = r * 0.16;
    g.save(); g.translate(-o, o); sq(a); g.restore();
    g.save(); g.translate(o, -o); sq(b); g.restore();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.beginPath(); g.moveTo(-o + sx * a, o + sy * a); g.lineTo(o + sx * b, -o + sy * b); g.stroke(); }
  },
  headset: (g: G, r: number) => { g.beginPath(); g.roundRect(-r * 0.75, -r * 0.35, r * 1.5, r * 0.7, r * 0.25); g.stroke(); g.beginPath(); g.arc(-r * 0.32, 0, r * 0.16, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(r * 0.32, 0, r * 0.16, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(0, 0, r * 0.95, r * 0.55, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke(); },
  glasses: (g: G, r: number) => { g.beginPath(); g.roundRect(-r * 0.85, -r * 0.25, r * 0.7, r * 0.5, r * 0.2); g.stroke(); g.beginPath(); g.roundRect(r * 0.15, -r * 0.25, r * 0.7, r * 0.5, r * 0.2); g.stroke(); g.beginPath(); g.moveTo(-r * 0.15, -r * 0.08); g.quadraticCurveTo(0, -r * 0.2, r * 0.15, -r * 0.08); g.stroke(); },
  hand: (g: G, r: number) => { // tracked hand: joints as dots on a skeleton
    const tips = [[-0.45, -0.55], [-0.2, -0.75], [0.05, -0.8], [0.3, -0.68], [0.55, -0.2]];
    const base: [number, number] = [0, 0.35];
    g.beginPath(); g.arc(base[0] * r, base[1] * r, r * 0.08, 0, Math.PI * 2); g.stroke();
    for (const [tx, ty] of tips) { g.beginPath(); g.moveTo(base[0] * r, base[1] * r); g.lineTo(tx * r * 0.55, ty * r * 0.2); g.lineTo(tx * r, ty * r); g.stroke(); g.beginPath(); g.arc(tx * r, ty * r, r * 0.06, 0, Math.PI * 2); g.stroke(); }
  },
  eye: (g: G, r: number) => { g.beginPath(); g.moveTo(-r * 0.8, 0); g.quadraticCurveTo(0, -r * 0.6, r * 0.8, 0); g.quadraticCurveTo(0, r * 0.6, -r * 0.8, 0); g.stroke(); g.beginPath(); g.arc(0, 0, r * 0.22, 0, Math.PI * 2); g.stroke(); },
  globe: (g: G, r: number) => { g.beginPath(); g.arc(0, 0, r * 0.7, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(0, 0, r * 0.3, r * 0.7, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(-r * 0.7, 0); g.lineTo(r * 0.7, 0); g.stroke(); g.beginPath(); g.ellipse(0, -r * 0.35, r * 0.6, r * 0.1, 0, 0, Math.PI * 2); g.stroke(); },
};
export const GLYPHS = Object.keys(glyph) as (keyof typeof glyph)[];

/**
 * Stained-glass dome, drawn TOP-DOWN (a disc); the dome uses planar UVs from above.
 * 12 gores, leaded panes in banded colours, a ring of roundels with XR glyphs, XR GUILD around the oculus.
 * Text is mirrored so it reads correctly from the floor looking up.
 */
export function stainedDome(size = 2048, oculusFrac = 0.16) {
  const [c, g] = canvas(size); const R = size / 2;
  g.fillStyle = '#3a2a1a'; g.fillRect(0, 0, size, size);
  g.translate(R, R);
  const bands = ['#b8665a', '#d2b766', '#7b9f78', '#6c8cbc', '#8fb2c2', '#c98f5a', '#7e74ad', '#6aa39a'];
  const rings = 22;
  const rIn = R * oculusFrac;
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
    for (let j = 0; j < rings; j++) {
      const r0 = rIn + (R - rIn) * (j / rings), r1 = rIn + (R - rIn) * ((j + 1) / rings);
      const cols = 2 + Math.floor(j / 5);
      for (let q = 0; q < cols; q++) {
        const b0 = a0 + (a1 - a0) * (q / cols), b1 = a0 + (a1 - a0) * ((q + 1) / cols);
        const band = bands[(Math.floor(j / 3) + (k % 2) * 2 + (q % 2)) % bands.length];
        const [r_, g_, b_] = hex(band); const jit = 0.8 + rnd() * 0.35;
        g.fillStyle = `rgb(${Math.min(255, r_ * jit) | 0},${Math.min(255, g_ * jit) | 0},${Math.min(255, b_ * jit) | 0})`;
        g.beginPath(); g.arc(0, 0, r1, b0, b1); g.arc(0, 0, r0, b1, b0, true); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(40,28,18,0.9)'; g.lineWidth = size / 900; g.stroke();
      }
    }
    // gilt rib between gores
    g.strokeStyle = '#c9a24c'; g.lineWidth = size / 170;
    g.beginPath(); g.moveTo(Math.cos(a0) * rIn, Math.sin(a0) * rIn); g.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); g.stroke();
  }
  // two rings of roundels with glyphs (outer ring of 12, inner ring of 6)
  const roundel = (a: number, r: number, rr: number, gl: keyof typeof glyph) => {
    g.save(); g.translate(Math.cos(a) * r, Math.sin(a) * r); g.rotate(a + Math.PI / 2);
    g.fillStyle = '#4f7f5c'; g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d8b35a'; g.lineWidth = rr * 0.14; g.stroke();
    g.strokeStyle = '#e9d59a'; g.lineWidth = rr * 0.07; g.lineJoin = 'round'; glyph[gl](g, rr * 0.8);
    g.restore();
  };
  const outer: (keyof typeof glyph)[] = ['cube', 'headset', 'cube', 'glasses', 'cube', 'hand', 'cube', 'eye', 'cube', 'globe', 'cube', 'headset'];
  outer.forEach((gl, k) => roundel(((k + 0.5) / 12) * Math.PI * 2, R * 0.72, R * 0.09, gl));
  for (let k = 0; k < 6; k++) roundel(((k + 0.5) / 6) * Math.PI * 2, R * 0.42, R * 0.075, 'cube');
  // oculus ring with XR GUILD, mirrored for viewing from below
  g.fillStyle = '#e9edf0'; g.beginPath(); g.arc(0, 0, rIn * 1.02, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#c9a24c'; g.lineWidth = size / 140; g.beginPath(); g.arc(0, 0, rIn * 1.02, 0, Math.PI * 2); g.stroke();
  g.save(); g.scale(-1, 1);
  g.fillStyle = '#3b3a8c'; g.font = `700 ${Math.round(rIn * 0.34)}px 'Marcellus SC', Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const word = 'XR GUILD · XR GUILD · ';
  const step = (Math.PI * 2) / word.length;
  for (let i = 0; i < word.length; i++) { g.save(); g.rotate(i * step); g.translate(0, -rIn * 0.78); g.fillText(word[i], 0, 0); g.restore(); }
  g.restore();
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/** Clerestory rose windows: one glyph per panel in leaded glass. Placeholders for commissioned glass art. */
export function stainedRose(i: number, size = 512) {
  const [c, g] = canvas(size); const R = size / 2;
  const glyphs: (keyof typeof glyph)[] = ['cube', 'headset', 'glasses', 'hand', 'eye', 'globe'];
  const palettes = [['#5b86c4', '#e0b448'], ['#5e9e6a', '#c9504a'], ['#6d5fb0', '#e0b448'], ['#4fa39a', '#d88a3c'], ['#c9504a', '#5b86c4'], ['#d88a3c', '#5e9e6a']];
  const [p1, p2] = palettes[i % palettes.length];
  g.fillStyle = '#20160e'; g.fillRect(0, 0, size, size);
  g.translate(R, R);
  for (let k = 0; k < 16; k++) {
    const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
    for (let j = 0; j < 3; j++) {
      const r0 = R * (0.45 + j * 0.17), r1 = R * (0.62 + j * 0.17);
      g.fillStyle = (k + j) % 2 ? p1 : p2; g.globalAlpha = 0.75 + rnd() * 0.25;
      g.beginPath(); g.arc(0, 0, Math.min(r1, R * 0.97), a0, a1); g.arc(0, 0, r0, a1, a0, true); g.closePath(); g.fill();
      g.globalAlpha = 1; g.strokeStyle = '#2a1c10'; g.lineWidth = 3; g.stroke();
    }
  }
  g.fillStyle = '#e9edf0'; g.beginPath(); g.arc(0, 0, R * 0.45, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#c9a24c'; g.lineWidth = 10; g.stroke();
  g.strokeStyle = '#3b3a8c'; g.lineWidth = 12; g.lineJoin = 'round'; glyph[glyphs[i % glyphs.length]](g, R * 0.38);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/**
 * Zellige in the manner of the Alhambra: eight-point stars and crosses in cobalt, teal, white and gold,
 * each star centre carrying a tiny isometric cube (the XR touch). Tileable.
 */
export function zellige(size = 512, cells = 4) {
  const [c, g] = canvas(size); const cs = size / cells;
  g.fillStyle = '#f1ece0'; g.fillRect(0, 0, size, size);
  const star = (cx: number, cy: number, r: number) => {
    g.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 - Math.PI / 8; const rr = i % 2 ? r * 0.72 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.closePath();
  };
  const cube = (cx: number, cy: number, r: number) => {
    const p = (a: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const pts = [0, 1, 2, 3, 4, 5].map(i => p(-Math.PI / 2 + i * Math.PI / 3));
    g.fillStyle = '#e8c664'; g.beginPath(); g.moveTo(cx, cy); [pts[5], pts[0], pts[1]].forEach(q => g.lineTo(q[0], q[1])); g.closePath(); g.fill();
    g.fillStyle = '#b28a2e'; g.beginPath(); g.moveTo(cx, cy); [pts[1], pts[2], pts[3]].forEach(q => g.lineTo(q[0], q[1])); g.closePath(); g.fill();
    g.fillStyle = '#8a6a22'; g.beginPath(); g.moveTo(cx, cy); [pts[3], pts[4], pts[5]].forEach(q => g.lineTo(q[0], q[1])); g.closePath(); g.fill();
  };
  for (let y = 0; y <= cells; y++) for (let x = 0; x <= cells; x++) {
    const cx = x * cs, cy = y * cs;
    // star on the grid points
    star(cx, cy, cs * 0.42); g.fillStyle = (x + y) % 2 ? '#1f4f8f' : '#1f7f7a'; g.fill(); g.strokeStyle = '#f7f3ea'; g.lineWidth = cs * 0.035; g.stroke();
    cube(cx, cy, cs * 0.12);
    // cross (the negative shape) in the cell centre
    const mx = cx + cs / 2, my = cy + cs / 2, k = cs * 0.2;
    g.beginPath(); g.moveTo(mx - k, my - k * 0.35); g.lineTo(mx - k * 0.35, my - k * 0.35); g.lineTo(mx - k * 0.35, my - k); g.lineTo(mx + k * 0.35, my - k); g.lineTo(mx + k * 0.35, my - k * 0.35); g.lineTo(mx + k, my - k * 0.35); g.lineTo(mx + k, my + k * 0.35); g.lineTo(mx + k * 0.35, my + k * 0.35); g.lineTo(mx + k * 0.35, my + k); g.lineTo(mx - k * 0.35, my + k); g.lineTo(mx - k * 0.35, my + k * 0.35); g.lineTo(mx - k, my + k * 0.35); g.closePath();
    g.fillStyle = '#c69c3c'; g.fill(); g.stroke();
  }
  // glaze sheen variation
  const img = g.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = (y * size + x) * 4, n = 0.92 + fbm(x / size * 16, y / size * 16, 3, 16) * 0.16; img.data[i] *= n; img.data[i + 1] *= n; img.data[i + 2] *= n; }
  g.putImageData(img, 0, 0);
  return tex(c);
}

/** Thin border strip: interlaced gold band on cobalt (for the pool's inner edge and the coping face). */
export function zelligeBorder(w = 1024, h = 128) {
  const [c, g] = canvas(w, h);
  g.fillStyle = '#1d3f76'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#d9b457'; g.lineWidth = h * 0.08;
  for (let x = -h; x < w + h; x += h) { g.beginPath(); g.moveTo(x, h * 0.15); g.lineTo(x + h / 2, h * 0.85); g.lineTo(x + h, h * 0.15); g.stroke(); }
  g.strokeStyle = '#f1ece0'; g.lineWidth = h * 0.05; g.beginPath(); g.moveTo(0, h * 0.06); g.lineTo(w, h * 0.06); g.moveTo(0, h * 0.94); g.lineTo(w, h * 0.94); g.stroke();
  return tex(c);
}
