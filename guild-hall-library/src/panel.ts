import * as THREE from 'three';

export interface Region { x: number; y: number; w: number; h: number; id: string; onClick: () => void; }
export interface Fonts { display: string; body: string; mono: string; }

export const INK = {
  bg: '#0b1917', bg2: '#10231f', line: 'rgba(212,168,87,0.55)', gold: '#d8ae5a', goldHi: '#f1d58f',
  text: '#ece4d0', dim: '#a9b3a9', teal: '#5fe0c6', violet: '#a791ff', amber: '#f0b454', hover: 'rgba(95,224,198,0.16)',
};

/** A flat, clickable canvas surface in the world. Redraws on demand. */
export class CanvasPanel {
  canvas = document.createElement('canvas');
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  regions: Region[] = [];
  hover: string | null = null;

  constructor(public widthM: number, public heightM: number, public pxPerM: number, public render: (p: CanvasPanel) => void) {
    this.canvas.width = Math.round(widthM * pxPerM);
    this.canvas.height = Math.round(heightM * pxPerM);
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), mat);
    this.mesh.userData.panel = this;
  }
  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }

  draw() {
    this.regions = [];
    this.render(this);
    this.texture.needsUpdate = true;
  }
  regionAt(uv: THREE.Vector2) {
    const x = uv.x * this.W, y = (1 - uv.y) * this.H;
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }
  click(uv: THREE.Vector2) { const r = this.regionAt(uv); if (r) { r.onClick(); this.draw(); return true; } return false; }
  setHover(uv: THREE.Vector2 | null) {
    const id = uv ? this.regionAt(uv)?.id ?? null : null;
    if (id !== this.hover) { this.hover = id; this.draw(); }
    return id;
  }

  // ---------- drawing helpers ----------
  bg(title?: string) {
    const g = this.ctx, W = this.W, H = this.H;
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#0e211d'); grd.addColorStop(1, '#081311');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // gilt frame with Nouveau corner flourishes
    g.strokeStyle = INK.gold; g.lineWidth = 6; g.strokeRect(14, 14, W - 28, H - 28);
    g.strokeStyle = INK.line; g.lineWidth = 2; g.strokeRect(28, 28, W - 56, H - 56);
    for (const [cx, cy, sx, sy] of [[28, 28, 1, 1], [W - 28, 28, -1, 1], [28, H - 28, 1, -1], [W - 28, H - 28, -1, -1]]) {
      g.save(); g.translate(cx, cy); g.scale(sx, sy); g.strokeStyle = INK.gold; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 60); g.bezierCurveTo(10, 20, 30, 10, 60, 0); g.stroke();
      g.beginPath(); g.moveTo(8, 40); g.bezierCurveTo(22, 30, 16, 16, 34, 10); g.stroke();
      g.beginPath(); g.arc(18, 18, 5, 0, Math.PI * 2); g.fillStyle = INK.gold; g.fill(); g.restore();
    }
    if (title) this.text(title, 60, 62, { font: `${Math.round(this.W / 26)}px ${this.fonts.display}`, color: INK.goldHi });
  }
  fonts: Fonts = { display: 'serif', body: 'sans-serif', mono: 'monospace' };

  text(s: string, x: number, y: number, o: { font?: string; color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline } = {}) {
    const g = this.ctx; g.font = o.font ?? `28px ${this.fonts.body}`; g.fillStyle = o.color ?? INK.text; g.textAlign = o.align ?? 'left'; g.textBaseline = o.baseline ?? 'top';
    g.fillText(s, x, y);
  }
  /** Wrap text into a box, returns height used. */
  wrap(s: string, x: number, y: number, maxW: number, lineH: number, o: { font?: string; color?: string; maxLines?: number } = {}) {
    const g = this.ctx; g.font = o.font ?? `28px ${this.fonts.body}`; g.fillStyle = o.color ?? INK.text; g.textAlign = 'left'; g.textBaseline = 'top';
    const words = s.split(/\s+/); let line = ''; let n = 0; const max = o.maxLines ?? 99;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (g.measureText(test).width > maxW && line) {
        if (n === max - 1) { let l = line; while (g.measureText(l + '…').width > maxW && l.length) l = l.slice(0, -1); g.fillText(l + '…', x, y + n * lineH); return (n + 1) * lineH; }
        g.fillText(line, x, y + n * lineH); n++; line = words[i];
      } else line = test;
    }
    if (line) { g.fillText(line, x, y + n * lineH); n++; }
    return n * lineH;
  }
  button(id: string, x: number, y: number, w: number, h: number, label: string, onClick: () => void, o: { active?: boolean; font?: string; accent?: string } = {}) {
    const g = this.ctx; const hov = this.hover === id; const acc = o.accent ?? INK.teal;
    g.beginPath(); g.roundRect(x, y, w, h, Math.min(18, h / 2));
    g.fillStyle = o.active ? 'rgba(216,174,90,0.22)' : hov ? INK.hover : 'rgba(255,255,255,0.04)'; g.fill();
    g.lineWidth = o.active ? 3 : 2; g.strokeStyle = o.active ? INK.gold : hov ? acc : 'rgba(216,174,90,0.35)'; g.stroke();
    g.font = o.font ?? `600 ${Math.round(h * 0.42)}px ${this.fonts.body}`; g.fillStyle = o.active ? INK.goldHi : INK.text; g.textAlign = 'center'; g.textBaseline = 'middle';
    let l = label; while (g.measureText(l).width > w - 20 && l.length > 3) l = l.slice(0, -2);
    if (l !== label) l = l.slice(0, -1) + '…';
    g.fillText(l, x + w / 2, y + h / 2 + 1);
    this.regions.push({ x, y, w, h, id, onClick });
  }
  rule(x: number, y: number, w: number, col = INK.line) { const g = this.ctx; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.stroke(); }
}
