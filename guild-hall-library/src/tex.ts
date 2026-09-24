import * as THREE from 'three';

// ---------- noise ----------
const P = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = 1337;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
}
const fade = (t: number) => t * t * (3 - 2 * t);
function hash2(x: number, y: number) { return P[(P[x & 255] + y) & 255] / 255; }
export function vnoise(x: number, y: number, period = 256) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const a = hash2(x0, y0), b = hash2(x1, y0), c = hash2(x0, y1), d = hash2(x1, y1);
  const u = fade(xf), v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, oct = 5, period = 256) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, period * f); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
let seed = 42;
export const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}
function tex(c: HTMLCanvasElement, srgb = true, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: number[], b: number[], t: number) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ---------- labradorite ----------
// Dark grey-green stone with lamellar "schiller" flashes of blue, teal and gold.
export function labradorite(size = 1024) {
  const [c, g] = canvas(size);
  const [ct, gt] = canvas(size / 2); // thickness map for iridescence
  const img = g.createImageData(size, size);
  const base0 = hex('#0d1817'), base1 = hex('#1d2f2c'), blue = hex('#2f6fd0'), teal = hex('#27b39b'), gold = hex('#c7a13c'), green = hex('#3f8f5a');
  const per = 8; // tileable
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * per, v = y / size * per;
    const w = fbm(u * 0.7 + 3.1, v * 0.7 + 1.7, 4, per * 0.7 | 0 || 1);
    const n = fbm(u, v, 5, per);
    let col = mix3(base0, base1, n);
    // lamellae: warped parallel streaks
    const s = Math.sin((u * 0.9 + v * 1.7) * 3.2 + w * 9.0);
    const streak = smooth(0.55, 0.98, s) * smooth(0.45, 0.75, fbm(u * 0.5 + 9, v * 0.5 + 4, 3, 4));
    const hueSel = fbm(u * 0.35 + 20, v * 0.35 + 11, 3, 3);
    let flash = hueSel < 0.42 ? blue : hueSel < 0.55 ? teal : hueSel < 0.66 ? green : gold;
    col = mix3(col, flash, streak * 0.75);
    // fine crystal fractures
    const fr = Math.abs(fbm(u * 2.3 + 5, v * 2.3, 3, per * 2) - 0.5);
    col = mix3(col, [8, 12, 12], smooth(0.02, 0.0, fr) * 0.6);
    const i = (y * size + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const ti = gt.createImageData(size / 2, size / 2);
  for (let y = 0; y < size / 2; y++) for (let x = 0; x < size / 2; x++) {
    const u = x / (size / 2) * per, v = y / (size / 2) * per;
    const val = fbm(u * 0.8 + 7, v * 0.8 + 2, 4, per * 0.8 | 0 || 1) * 255;
    const i = (y * size / 2 + x) * 4;
    ti.data[i] = ti.data[i + 1] = ti.data[i + 2] = val; ti.data[i + 3] = 255;
  }
  gt.putImageData(ti, 0, 0);
  return { map: tex(c), thickness: tex(ct, false) };
}

// ---------- walnut ----------
export function walnut(size = 1024) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const a = hex('#2a170c'), b = hex('#5b3920'), d = hex('#7a5232');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const warp = fbm(u * 3, v * 12, 4, 12) * 1.6;
    const ring = Math.sin((v * 42 + warp * 6) * Math.PI);
    const t = 0.5 + 0.5 * ring;
    let col = mix3(a, b, t * 0.8 + fbm(u * 40, v * 2, 3, 40) * 0.25);
    col = mix3(col, d, smooth(0.8, 1.0, t) * 0.35);
    const pore = vnoise(u * 400, v * 30, 400);
    col = mix3(col, [20, 10, 5], smooth(0.8, 0.95, pore) * 0.4);
    const i = (y * size + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}

// ---------- marble (tileable cream with veins) ----------
export function marble(size = 1024, base = '#e4ddcc', vein = '#8f8a7e', repeat = 1) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const b0 = hex(base), v0 = hex(vein);
  const per = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * per, v = y / size * per;
    const n = fbm(u, v, 5, per);
    const turb = Math.abs(Math.sin((u + v * 0.6) * 2.4 + n * 7));
    let col = mix3(b0, mix3(b0, [255, 255, 255], 0.3), fbm(u * 2 + 3, v * 2, 3, per * 2));
    col = mix3(col, v0, smooth(0.12, 0.0, turb) * 0.55);
    const i = (y * size + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, true, repeat);
}

// ---------- mosaic floor ----------
// Radial Art Nouveau rosette: cream marble field, whiplash petals in labradorite
// greens and blues, gold tesserae lines. Drawn at `size` px for the floor disc.
export function mosaicFloor(size = 2048) {
  const [c, g] = canvas(size);
  const m = marble(512, '#ddd5c2', '#9a9384');
  const pat = g.createPattern(m.image as HTMLCanvasElement, 'repeat')!;
  g.fillStyle = pat; g.fillRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2, R = size / 2;
  const gold = '#c79a3e', deep = '#10302b', lab = '#1f4e57', teal = '#2c8a7b', ink = '#0b1a1a';
  const ring = (r0: number, r1: number, fill: string | CanvasPattern) => {
    g.beginPath(); g.arc(cx, cy, r1, 0, Math.PI * 2); g.arc(cx, cy, r0, 0, Math.PI * 2, true); g.fillStyle = fill; g.fill();
  };
  const line = (r: number, w: number, col = gold) => { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.lineWidth = w; g.strokeStyle = col; g.stroke(); };
  // dark green marble for bands
  const dm = marble(512, '#16362f', '#3b6b5f');
  const dpat = g.createPattern(dm.image as HTMLCanvasElement, 'repeat')!;
  ring(R * 0.93, R * 1.0, dpat);
  line(R * 0.93, 6); line(R * 0.985, 3);
  // outer tesserae band
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    g.save(); g.translate(cx + Math.cos(a) * R * 0.955, cy + Math.sin(a) * R * 0.955); g.rotate(a);
    g.fillStyle = i % 3 === 0 ? gold : i % 3 === 1 ? teal : lab; g.fillRect(-6, -6, 12, 12); g.restore();
  }
  ring(R * 0.62, R * 0.66, dpat); line(R * 0.62, 5); line(R * 0.66, 5);
  // whiplash petals (24)
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    g.save(); g.translate(cx, cy); g.rotate(a);
    const r0 = R * 0.67, r1 = R * 0.915;
    g.beginPath();
    g.moveTo(r0, 0);
    g.bezierCurveTo(r0 + (r1 - r0) * 0.3, R * 0.09, r0 + (r1 - r0) * 0.75, -R * 0.06, r1, R * 0.02);
    g.bezierCurveTo(r0 + (r1 - r0) * 0.7, R * 0.015, r0 + (r1 - r0) * 0.35, R * 0.02, r0, 0);
    g.closePath();
    g.fillStyle = i % 2 ? lab : teal; g.fill();
    g.lineWidth = 4; g.strokeStyle = gold; g.stroke();
    // tendril
    g.beginPath(); g.moveTo(r0 + (r1 - r0) * 0.2, 0);
    g.bezierCurveTo(r0 + (r1 - r0) * 0.45, -R * 0.07, r0 + (r1 - r0) * 0.7, R * 0.05, r0 + (r1 - r0) * 0.92, -R * 0.045);
    g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(r0 + (r1 - r0) * 0.92, -R * 0.045, 7, 0, Math.PI * 2); g.fillStyle = gold; g.fill();
    g.restore();
  }
  // inner field: labradorite disc under table
  ring(R * 0.0, R * 0.2, dpat);
  line(R * 0.2, 8); line(R * 0.215, 3);
  // 16-point star rosette between 0.22 and 0.6
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.beginPath(); g.moveTo(R * 0.22, -R * 0.05); g.quadraticCurveTo(R * 0.45, 0, R * 0.6, 0); g.quadraticCurveTo(R * 0.45, 0, R * 0.22, R * 0.05); g.closePath();
    g.fillStyle = i % 2 ? deep : lab; g.globalAlpha = 0.92; g.fill(); g.globalAlpha = 1;
    g.lineWidth = 3; g.strokeStyle = gold; g.stroke();
    g.restore();
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    g.beginPath(); g.arc(cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6, 6, 0, Math.PI * 2); g.fillStyle = gold; g.fill();
  }
  // grout grain
  g.globalAlpha = 0.06; g.strokeStyle = ink;
  for (let i = 0; i < 90; i++) { g.beginPath(); g.arc(cx, cy, (i / 90) * R, 0, Math.PI * 2); g.lineWidth = 1; g.stroke(); }
  g.globalAlpha = 1;
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------- wall lacquer damask (tileable) ----------
export function wallDamask(size = 512) {
  const [c, g] = canvas(size);
  const grd = g.createLinearGradient(0, 0, size, size);
  grd.addColorStop(0, '#11302b'); grd.addColorStop(1, '#0d2622');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm(x / size * 8, y / size * 8, 4, 8);
    const i = (y * size + x) * 4;
    img.data[i] *= 0.8 + n * 0.4; img.data[i + 1] *= 0.8 + n * 0.4; img.data[i + 2] *= 0.8 + n * 0.4;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(201,160,70,0.22)'; g.lineWidth = 3;
  const motif = (ox: number, oy: number) => {
    g.save(); g.translate(ox, oy);
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(size * 0.12, -size * 0.05, size * 0.2, size * 0.1, size * 0.08, size * 0.18);
      g.bezierCurveTo(size * 0.02, size * 0.22, -size * 0.04, size * 0.14, size * 0.02, size * 0.1); g.stroke();
    }
    g.beginPath(); g.arc(0, 0, size * 0.03, 0, Math.PI * 2); g.stroke();
    g.restore();
  };
  motif(size / 2, size / 2); motif(0, 0); motif(size, 0); motif(0, size); motif(size, size);
  return tex(c);
}

// ---------- frieze band text ----------
export function frieze(font: string) {
  const W = 4096, H = 256;
  const [c, g] = canvas(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#0c1d33'); grd.addColorStop(0.5, '#132a45'); grd.addColorStop(1, '#0c1d33');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = '#c9a24c'; g.fillRect(0, 10, W, 5); g.fillRect(0, H - 15, W, 5); g.fillRect(0, 24, W, 2); g.fillRect(0, H - 26, W, 2);
  const phrases = ['PAST · MORE HUMAN', 'PRESENT · MORE CONNECTED', 'FUTURE · MORE REAL', 'HUMANITY · TECHNOLOGY · IMAGINATION · TOGETHER'];
  g.font = `96px ${font}`; g.textBaseline = 'middle'; g.textAlign = 'center';
  const seg = W / phrases.length;
  phrases.forEach((p, i) => {
    const x = seg * i + seg / 2;
    const gg = g.createLinearGradient(0, 70, 0, 190);
    gg.addColorStop(0, '#f3dc9a'); gg.addColorStop(0.5, '#c99a3e'); gg.addColorStop(1, '#8a6423');
    g.fillStyle = gg;
    let fs = 96; g.font = `${fs}px ${font}`;
    while (g.measureText(p).width > seg - 220 && fs > 50) { fs -= 4; g.font = `${fs}px ${font}`; }
    g.fillText(p, x, H / 2 + 6);
    // star separator
    const sx = seg * (i + 1);
    g.save(); g.translate(sx, H / 2); g.fillStyle = '#e2bf6a';
    g.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; const r = k % 2 ? 12 : 34; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.restore();
  });
  const t = tex(c); t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------- dome mural ----------
// Equirect hemisphere: canvas top = zenith, bottom = springing line.
// Three eras across the azimuth: Past (sepia gold), Present (teal), Future (indigo).
export function domeMural() {
  const W = 4096, H = 1024;
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  const past = hex('#8a6431'), pastHi = hex('#d8b373'), present = hex('#15545a'), presentHi = hex('#5fd0c0'), future = hex('#231c5c'), futureHi = hex('#9b86ff'), night = hex('#07101f');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    // era weights around azimuth (wrap)
    const eraT = (u * 3) % 3;
    const e0 = Math.max(0, 1 - Math.min(Math.abs(eraT - 0.5), 3 - Math.abs(eraT - 0.5)) / 0.85);
    const e1 = Math.max(0, 1 - Math.abs(eraT - 1.5) / 0.85);
    const e2 = Math.max(0, 1 - Math.abs(eraT - 2.5) / 0.85);
    const sw = e0 + e1 + e2 + 1e-4;
    const swirl = fbm(u * 10 + Math.sin(v * 6) * 0.8, v * 5 + fbm(u * 6, v * 6, 3, 6) * 2.5, 5, 10);
    let lo = mix3(mix3(past, present, e1 / sw), future, e2 / sw);
    let hi = mix3(mix3(pastHi, presentHi, e1 / sw), futureHi, e2 / sw);
    let col = mix3(night, lo, 0.35 + v * 0.55);
    col = mix3(col, hi, smooth(0.55, 0.85, swirl) * (0.35 + 0.35 * v));
    // brighter toward zenith center (radiant)
    col = mix3(col, [210, 230, 255], smooth(0.18, 0.0, v) * 0.25);
    const i = (y * W + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // sweeping gold constellation lines
  seed = 7;
  g.lineCap = 'round';
  for (let k = 0; k < 140; k++) {
    const x0 = rand() * W, y0 = 120 + rand() * (H - 260);
    g.strokeStyle = `rgba(233,196,112,${0.12 + rand() * 0.35})`; g.lineWidth = 1 + rand() * 2;
    g.beginPath(); g.moveTo(x0, y0);
    let x = x0, y = y0;
    for (let j = 0; j < 3; j++) { x += (rand() - 0.5) * 180; y += (rand() - 0.5) * 90; g.lineTo(x, y); g.fillStyle = '#f2d58f'; }
    g.stroke();
  }
  for (let k = 0; k < 900; k++) {
    const x = rand() * W, y = rand() * H * 0.9; const r = rand() * 2.4 + 0.4;
    g.fillStyle = `rgba(250,236,200,${0.3 + rand() * 0.6})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // line-art device icons along the lower band, one set per era
  const gold = (a = 0.9) => `rgba(236,198,110,${a})`;
  const icon = (fn: () => void, x: number, y: number, s: number) => { g.save(); g.translate(x, y); g.scale(s, s); g.strokeStyle = gold(); g.lineWidth = 3 / s * 1.2; g.fillStyle = 'rgba(236,198,110,0.12)'; fn(); g.restore(); };
  const stereoscope = () => {
    g.beginPath(); g.roundRect(-60, -24, 120, 48, 10); g.fill(); g.stroke();
    g.beginPath(); g.arc(-25, 0, 14, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(25, 0, 14, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0, 24); g.lineTo(0, 150); g.stroke(); g.beginPath(); g.moveTo(-50, 150); g.lineTo(50, 150); g.stroke();
    g.beginPath(); g.rect(-45, 90, 90, 40); g.stroke();
  };
  const headset = () => {
    g.beginPath(); g.roundRect(-80, -38, 160, 76, 30); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(0, 0, 150, 60, 0, Math.PI * 0.08, Math.PI * 0.92, true); g.stroke();
    g.beginPath(); g.arc(-34, 4, 16, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(34, 4, 16, 0, Math.PI * 2); g.stroke();
  };
  const glasses = () => {
    g.beginPath(); g.roundRect(-95, -26, 80, 52, 22); g.fill(); g.stroke(); g.beginPath(); g.roundRect(15, -26, 80, 52, 22); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-15, -8); g.quadraticCurveTo(0, -18, 15, -8); g.stroke();
    g.beginPath(); g.moveTo(-95, -14); g.lineTo(-130, -20); g.moveTo(95, -14); g.lineTo(130, -20); g.stroke();
  };
  const orbit = () => { g.beginPath(); g.ellipse(0, 0, 110, 36, -0.3, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.arc(98, -30, 8, 0, Math.PI * 2); g.stroke(); };
  const eye = () => { g.beginPath(); g.moveTo(-90, 0); g.quadraticCurveTo(0, -60, 90, 0); g.quadraticCurveTo(0, 60, -90, 0); g.stroke(); g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill(); g.stroke(); };
  const net = () => { const pts: number[][] = []; seed = 99; for (let i = 0; i < 11; i++) pts.push([(rand() - 0.5) * 220, (rand() - 0.5) * 120]); g.beginPath(); pts.forEach((p, i) => pts.forEach((q, j) => { if (j > i && Math.hypot(p[0] - q[0], p[1] - q[1]) < 110) { g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); } })); g.stroke(); pts.forEach(p => { g.beginPath(); g.arc(p[0], p[1], 5, 0, Math.PI * 2); g.fillStyle = gold(); g.fill(); }); };
  const sets = [[eye, stereoscope], [headset, net], [glasses, orbit]];
  sets.forEach((set, era) => {
    set.forEach((fn, k) => icon(fn, W * (era / 3 + 1 / 6) + (k - 0.5) * W * 0.12, H * 0.74, 1.4));
  });
  const t = tex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.x = -1; // viewed from inside
  return t;
}

// ---------- grass / gravel ----------
export function grass(size = 512) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const a = hex('#0e1f12'), b = hex('#1f3a1d'), d = hex('#2c4a24');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * 16, v = y / size * 16;
    const n = fbm(u, v, 5, 16);
    const blade = vnoise(x * 0.9, y * 0.25, 1000);
    let col = mix3(a, b, n);
    col = mix3(col, d, smooth(0.7, 1, blade) * 0.4);
    const i = (y * size + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}
export function gravel(size = 512) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = vnoise(x * 0.35, y * 0.35, 512) * 0.6 + fbm(x / size * 8, y / size * 8, 3, 8) * 0.4;
    const v = 120 + n * 90;
    const i = (y * size + x) * 4;
    img.data[i] = v; img.data[i + 1] = v * 0.96; img.data[i + 2] = v * 0.9; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}

// ---------- water normal map (tileable) ----------
export function waterNormal(size = 256) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const h = (x: number, y: number) => fbm(x / size * 8, y / size * 8, 4, 8);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const nx = -dx * 6, ny = -dy * 6, nz = 1; const l = Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}

// ---------- radial glow sprite ----------
export function glow(color = '255,220,160') {
  const [c, g] = canvas(128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${color},1)`); grd.addColorStop(0.25, `rgba(${color},0.45)`); grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function contactShadow() {
  const [c, g] = canvas(128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.65)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- text label ----------
export function labelTexture(lines: { text: string; font: string; color: string }[], w = 512, h = 160, bg = 'rgba(8,20,20,0.82)', border = '#c9a24c') {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill();
  g.strokeStyle = border; g.lineWidth = 3; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const step = h / (lines.length + 1);
  lines.forEach((l, i) => { g.font = l.font; g.fillStyle = l.color; g.fillText(l.text, w / 2, step * (i + 1)); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
