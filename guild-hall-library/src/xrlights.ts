import * as THREE from 'three';

/**
 * three.js shades every lit pixel against every light in the scene, and a change in the number of lights recompiles
 * every material. In a headset the world's point lights are stood in for by a fixed handful of pool lights that copy
 * whichever sources matter most where you are, so the per-pixel cost is bounded and walking between rooms never
 * changes the light count.
 */
export class XRLightPool {
  private pool: THREE.PointLight[];
  private sources: THREE.PointLight[] = [];
  private chosen: THREE.PointLight[] = [];
  private at = new THREE.Vector3();

  constructor(private scene: THREE.Scene, size: number) {
    this.pool = Array.from({ length: size }, () => { const l = new THREE.PointLight(0, 0); l.name = 'XRPoolLight'; return l; });
  }

  start() {
    this.sources = [];
    this.scene.traverse(o => { if ((o as THREE.PointLight).isPointLight && o.name !== 'XRPoolLight') this.sources.push(o as THREE.PointLight); });
    for (const s of this.sources) s.visible = false;
    this.scene.add(...this.pool);
    this.chosen = [];
  }

  stop() {
    for (const l of this.pool) l.removeFromParent();
    for (const s of this.sources) s.visible = true;
    this.sources = [];
  }

  /** `eligible` keeps lights out of rooms you aren't in; the strongest eligible ones at `pos` fill the pool. */
  update(pos: THREE.Vector3, eligible: (l: THREE.PointLight) => boolean) {
    if (!this.sources.length) return;
    const score = (l: THREE.PointLight) => {
      if (!eligible(l)) return 0;
      const d = l.getWorldPosition(this.at).distanceTo(pos);
      if (l.distance > 0 && d > l.distance * 1.5) return 0;
      return l.intensity / Math.max(d * d, 1);
    };
    const ranked = this.sources.map(l => ({ l, s: score(l) })).filter(e => e.s > 0).sort((a, b) => b.s - a.s);
    const top = ranked.slice(0, this.pool.length);
    // a light already in the pool keeps its place until a rival is clearly stronger, so lights don't flicker in and out at a boundary
    const weakest = top.length ? top[top.length - 1].s : 0;
    const keep = this.chosen.filter(l => { const s = score(l); return s > 0 && s * 1.5 >= weakest; });
    const next = [...keep, ...top.map(e => e.l).filter(l => !keep.includes(l))].slice(0, this.pool.length);
    this.chosen = next;
    this.pool.forEach((p, i) => {
      const s = next[i];
      if (!s) { p.intensity = 0; return; }
      s.getWorldPosition(p.position);
      p.color.copy(s.color); p.intensity = s.intensity; p.distance = s.distance; p.decay = s.decay;
    });
  }
}
