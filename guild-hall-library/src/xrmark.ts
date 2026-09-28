import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The XR monogram used on every capital: an X and an R sharing one upright stroke
 * (the X's right tips meet the R's stem). Simple, readable at a distance, and bevelled so it catches light.
 * Unit height 1, centred at the origin, facing +z. Built once and reused.
 */
let cached: THREE.BufferGeometry | null = null;
export function xrMonogramGeometry() {
  if (cached) return cached;
  const w = 0.16, d = 0.06;
  const ext = { depth: d, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.014, bevelSegments: 2, curveSegments: 18 };
  const parts: THREE.BufferGeometry[] = [];
  const poly = (pts: [number, number][]) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath(); parts.push(new THREE.ExtrudeGeometry(sh, ext)); };
  const diag = (x0: number, y0: number, x1: number, y1: number) => poly([[x0 - w / 2, y0], [x0 + w / 2, y0], [x1 + w / 2, y1], [x1 - w / 2, y1]]);
  // X
  diag(-0.9, 0.5, -0.02, -0.5);
  diag(-0.9, -0.5, -0.02, 0.5);
  // shared stem
  poly([[-0.04, -0.5], [0.12, -0.5], [0.12, 0.5], [-0.04, 0.5]]);
  // R bowl: top bar, half ring, middle bar
  const cx = 0.3, cy = 0.25, ro = 0.25, ri = ro - w;
  poly([[0.1, 0.5 - w], [cx, 0.5 - w], [cx, 0.5], [0.1, 0.5]]);
  poly([[0.1, 0], [cx, 0], [cx, w], [0.1, w]]);
  const ring = new THREE.Shape(); ring.absarc(cx, cy, ro, Math.PI / 2, -Math.PI / 2, true); ring.absarc(cx, cy, ri, -Math.PI / 2, Math.PI / 2, false); ring.closePath();
  parts.push(new THREE.ExtrudeGeometry(ring, ext));
  // R leg
  diag(0.26, 0.04, 0.6, -0.5);
  const g = mergeGeometries(parts.map(p => p.toNonIndexed()));
  parts.forEach(p => p.dispose());
  g.translate(0.15, 0, -d / 2); g.computeVertexNormals();
  cached = g; return g;
}

/** A monogram mesh `h` metres tall. */
export function xrMonogram(mat: THREE.Material, h: number) {
  const m = new THREE.Mesh(xrMonogramGeometry(), mat); m.scale.setScalar(h); return m;
}
