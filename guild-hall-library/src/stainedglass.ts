import * as THREE from 'three';
import type { GrandHall } from './grandhall';

/**
 * Evo's stained glass from the Arrival.space build (stainedglasswindow and stained-glass-rotunda plugins, Oct 2026):
 *  - the 12 clerestory roses get their own window art, glowing inside, and a second pane outside that reads the
 *    right way round, lit like glass by day and glowing faintly at night
 *  - the dome is lined with 12 Art Nouveau gores and an oculus medallion, following the hall dome's profile
 * Images live in public/stained-glass/; until they load (or if they fail) the hall keeps its placeholder glass.
 */
const BASE = 'stained-glass/';

/** window art by the rose's angle round the hall (degrees from -Z towards -X, the Arrival layout) */
const WINDOWS: Record<number, string> = {
  0: 'rotunda-window-03', 30: 'codefrau-stained-glass', 60: 'rotunda-window-02', 90: 'rotunda-window-04',
  120: 'rotunda-window-05', 150: 'rotunda-window-06', 180: 'rotunda-window-01', 210: 'rotunda-window-07',
  240: 'rotunda-window-08', 270: 'rotunda-window-09', 300: 'rotunda-window-10', 330: 'rotunda-window-11',
};
const PANE = { glow: 1.36, imageFill: 0.98, outsideOffset: 0.05, dayGlow: 0.35, nightGlow: 0.8 };
const DOME = { glow: 0.95, oculusGlow: 1.2, shrink: 0.985, drop: 0.1, firstPanel: 10 };

// [height, radius] of the hall dome's inner surface (GH.wallTop + 0.2, radius CR + 0.05, rise 0.5), base to oculus edge
const PROFILE: [number, number][] = [
  [15.2, 14.54], [15.68, 14.51], [16.15, 14.42], [16.62, 14.26], [17.08, 14.05], [17.54, 13.77],
  [17.98, 13.44], [18.42, 13.04], [18.84, 12.6], [19.24, 12.09], [19.63, 11.54], [20.0, 10.94],
  [20.34, 10.28], [20.67, 9.59], [20.97, 8.85], [21.25, 8.08], [21.5, 7.27], [21.72, 6.43],
  [21.92, 5.57], [22.085, 4.675], [22.224, 3.765],
];
const CAP: [number, number][] = [[22.224, 3.765], [22.332, 2.837], [22.41, 1.6], [22.45, 0.8], [22.47, 0]];

const loader = new THREE.TextureLoader();
const load = (name: string, flipY = true) => loader.loadAsync(BASE + name + '.webp').then(t => {
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = flipY; t.anisotropy = 8; return t;
});

export function dressStainedGlass(hall: GrandHall) {
  const outsides: THREE.MeshStandardMaterial[] = [];
  let night = false;

  for (const rose of hall.roses) {
    const p = rose.getWorldPosition(new THREE.Vector3()).sub(hall.group.position);
    const deg = (Math.round(THREE.MathUtils.radToDeg(Math.atan2(-p.x, -p.z)) / 30) * 30 + 360) % 360;
    const file = WINDOWS[deg]; if (!file) continue;
    load(file).then(tex => {
      tex.repeat.setScalar(PANE.imageFill); tex.offset.setScalar((1 - PANE.imageFill) / 2);
      const old = rose.material as THREE.MeshStandardMaterial; old.map?.dispose(); old.dispose();
      rose.material = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color().setScalar(PANE.glow) });
      // turned round so it reads the right way from outside
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, color: 0x8c8c8c, emissive: 0xffffff, emissiveIntensity: night ? PANE.nightGlow : PANE.dayGlow, roughness: 0.1, metalness: 0 });
      const out = new THREE.Mesh(rose.geometry, mat); out.rotation.y = Math.PI; out.position.z = -PANE.outsideOffset; out.name = 'ClereRoseOutside';
      rose.add(out); outsides.push(mat);
    }).catch(e => console.warn('[stained glass]', file, e));
  }

  // dome gores: arc-length resampled profile, 12 gores of 30 degrees, atlas 6 x 2 panels (top of panel = top of dome)
  const { shrink: k, drop: dy } = DOME, rBase = PROFILE[0][1];
  const s = [0];
  for (let i = 1; i < PROFILE.length; i++) s.push(s[i - 1] + Math.hypot(PROFILE[i][0] - PROFILE[i - 1][0], PROFILE[i][1] - PROFILE[i - 1][1]));
  const S = s[s.length - 1], rows = 40, cols = 10, half = Math.PI / 12;
  const at = (st: number) => {
    let i = 1; while (i < s.length - 1 && s[i] < st) i++;
    const f = (st - s[i - 1]) / (s[i] - s[i - 1] || 1);
    return [PROFILE[i - 1][0] + f * (PROFILE[i][0] - PROFILE[i - 1][0]), PROFILE[i - 1][1] + f * (PROFILE[i][1] - PROFILE[i - 1][1])];
  };
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let g = 0; g < 12; g++) {
    const phi = g * Math.PI / 6, panel = (g + DOME.firstPanel) % 12, cu = panel % 6, cv = Math.floor(panel / 6), start = pos.length / 3;
    for (let r = 0; r <= rows; r++) {
      const frac = r / rows, [y, rad] = at(S * frac), w = rad / rBase;
      for (let c = 0; c <= cols; c++) {
        const t = -half + (2 * half * c) / cols, a = phi + t;
        pos.push(-rad * k * Math.sin(a), y - dy, -rad * k * Math.cos(a));
        uv.push((cu + 0.5 - (t / (2 * half)) * w) / 6, (cv + 1 - frac) / 2);
      }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a0 = start + r * (cols + 1) + c, a1 = a0 + 1, b0 = a0 + cols + 1, b1 = b0 + 1;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const cpos: number[] = [], cuv: number[] = [], cidx: number[] = [], segs = 72, rTop = CAP[0][1] * k;
  for (const [y, rad] of CAP) for (let j = 0; j <= segs; j++) {
    const a = (j / segs) * Math.PI * 2, x = Math.sin(a) * rad * k, z = Math.cos(a) * rad * k;
    cpos.push(x, y - dy, z); cuv.push(0.5 + (x / rTop) * 0.485, 0.5 + (z / rTop) * 0.485);
  }
  for (let ring = 0; ring < CAP.length - 1; ring++) for (let j = 0; j < segs; j++) {
    const a0 = ring * (segs + 1) + j, a1 = a0 + 1, b0 = a0 + segs + 1, b1 = b0 + 1;
    cidx.push(a0, b0, a1, a1, b0, b1);
  }
  const geo = (p: number[], t: number[], i: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(t, 2)); g.setIndex(i);
    return g;
  };
  // front faces point into the hall, so the lining doesn't show through the gap under the outer dome.
  // The Arrival UVs put v = 0 at the image top, so these two textures are not flipped.
  Promise.all([load('rotunda-dome-atlas-2048', false), load('rotunda-oculus', false)]).then(([atlas, oculus]) => {
    const rotunda = new THREE.Group(); rotunda.name = 'StainedGlassRotunda'; rotunda.userData.keep = true;
    rotunda.add(new THREE.Mesh(geo(pos, uv, idx), new THREE.MeshBasicMaterial({ map: atlas, color: new THREE.Color().setScalar(DOME.glow) })));
    rotunda.add(new THREE.Mesh(geo(cpos, cuv, cidx), new THREE.MeshBasicMaterial({ map: oculus, color: new THREE.Color().setScalar(DOME.oculusGlow) })));
    hall.group.add(rotunda);
    if (hall.dome) hall.dome.visible = false; // fully covered by the gores
  }).catch(e => console.warn('[stained glass] rotunda', e));

  return {
    /** outside panes glow brighter under the night skies */
    setNight(n: boolean) { night = n; for (const m of outsides) m.emissiveIntensity = n ? PANE.nightGlow : PANE.dayGlow; },
  };
}
