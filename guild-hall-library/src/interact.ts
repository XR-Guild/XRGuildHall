import * as THREE from 'three';
import type { World } from '@iwsdk/core';
import { CanvasPanel } from './panel';

export interface Handler {
  label?: string;
  onClick?: (hit: THREE.Intersection) => void;
  onHover?: (hit: THREE.Intersection | null) => void;
}

/**
 * One raycast path for mouse, touch and XR rays (controllers or hands).
 * Targets are registered Object3Ds; blockers occlude (walls).
 */
export class Interactor {
  private targets = new Map<THREE.Object3D, Handler>();
  private list: THREE.Object3D[] = [];
  blockers: THREE.Object3D[] = [];
  walkables: THREE.Object3D[] = [];
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private pointerDirty = false;
  private hovered: { obj: THREE.Object3D; h: Handler } | null = null;
  private xrHover: Record<string, THREE.Intersection | null> = { left: null, right: null };
  private reticles: Record<string, THREE.Mesh> = {};
  tooltip: HTMLElement | null = null;
  onTeleport: ((p: THREE.Vector3) => void) | null = null;

  constructor(private world: World, private canvas: HTMLCanvasElement) {
    this.ray.far = 40;
    canvas.addEventListener('pointermove', e => { this.setNdc(e); this.pointerDirty = true; this.lastPointer = e; });
    canvas.addEventListener('pointerleave', () => this.clearHover());
    let down: { x: number; y: number; t: number } | null = null;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener('pointerup', e => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 450;
      down = null;
      if (moved < 7 && quick) { this.setNdc(e); this.clickAtPointer(this.isDoubleTap(e)); }
    });
    canvas.addEventListener('dblclick', e => {
      if (this.world.session) return;
      this.setNdc(e as PointerEvent); this.ray.setFromCamera(this.ndc, this.world.camera); this.tryTeleport();
    });
    for (const k of ['left', 'right']) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.014, 24), new THREE.MeshBasicMaterial({ color: 0x5fe0c6, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
      r.renderOrder = 999; r.visible = false; world.scene.add(r); this.reticles[k] = r;
    }
  }
  private lastPointer: PointerEvent | null = null;
  private lastTap = 0;
  private isDoubleTap(e: PointerEvent) {
    if (e.pointerType !== 'touch') return false;
    const now = performance.now(); const dbl = now - this.lastTap < 350; this.lastTap = now; return dbl;
  }
  private setNdc(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  add(obj: THREE.Object3D, h: Handler) { this.targets.set(obj, h); this.list.push(obj); }
  addPanel(panel: CanvasPanel, label?: string) {
    this.add(panel.mesh, {
      label,
      onClick: hit => hit.uv && panel.click(hit.uv),
      onHover: hit => { const id = panel.setHover(hit?.uv ?? null); this.canvas.style.cursor = id ? 'pointer' : hit ? 'default' : ''; },
    });
  }

  private owner(o: THREE.Object3D | null): { obj: THREE.Object3D; h: Handler } | null {
    while (o) { const h = this.targets.get(o); if (h) return { obj: o, h }; o = o.parent; }
    return null;
  }
  private cast(): { hit: THREE.Intersection; t: { obj: THREE.Object3D; h: Handler } } | null {
    const hits = this.ray.intersectObjects(this.list, true);
    if (!hits.length) return null;
    const first = hits[0];
    if (this.blockers.length) {
      const b = this.ray.intersectObjects(this.blockers, true)[0];
      if (b && b.distance < first.distance - 0.05) return null;
    }
    const t = this.owner(first.object);
    return t ? { hit: first, t } : null;
  }

  private clearHover() {
    if (this.hovered) { this.hovered.h.onHover?.(null); this.hovered = null; }
    this.canvas.style.cursor = '';
    if (this.tooltip) this.tooltip.hidden = true;
  }

  private clickAtPointer(dbl: boolean) {
    if (this.world.session) return;
    this.ray.setFromCamera(this.ndc, this.world.camera);
    const r = this.cast();
    if (r) { r.t.h.onClick?.(r.hit); return; }
    if (dbl) this.tryTeleport();
  }
  private tryTeleport() {
    const hit = this.ray.intersectObjects(this.walkables, true)[0];
    if (!hit || !hit.face) return;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (n.y < 0.8) return;
    if (this.blockers.length) { const b = this.ray.intersectObjects(this.blockers, true)[0]; if (b && b.distance < hit.distance - 0.1) return; }
    this.onTeleport?.(hit.point);
  }

  /** Call once per frame. */
  update() {
    const session = this.world.session;
    if (!session) {
      for (const r of Object.values(this.reticles)) r.visible = false;
      if (!this.pointerDirty) return;
      this.pointerDirty = false;
      this.ray.setFromCamera(this.ndc, this.world.camera);
      const r = this.cast();
      if (this.hovered && (!r || r.t.obj !== this.hovered.obj)) { this.hovered.h.onHover?.(null); this.hovered = null; }
      if (r) {
        this.hovered = r.t; r.t.h.onHover?.(r.hit);
        if (!r.t.obj.userData.panel) this.canvas.style.cursor = 'pointer';
        if (this.tooltip && r.t.h.label && this.lastPointer) {
          this.tooltip.hidden = false; this.tooltip.textContent = r.t.h.label;
          this.tooltip.style.transform = `translate(${this.lastPointer.clientX + 14}px, ${this.lastPointer.clientY + 12}px)`;
        } else if (this.tooltip) this.tooltip.hidden = true;
      } else { this.canvas.style.cursor = ''; if (this.tooltip) this.tooltip.hidden = true; }
      return;
    }
    // XR: raycast from each hand's target-ray space
    const spaces = this.world.player.raySpaces as unknown as Record<string, THREE.Object3D>;
    for (const hand of ['left', 'right']) {
      const s = spaces[hand];
      const ret = this.reticles[hand];
      if (!s) { ret.visible = false; continue; }
      s.updateMatrixWorld();
      const o = new THREE.Vector3().setFromMatrixPosition(s.matrixWorld);
      const d = new THREE.Vector3(0, 0, -1).transformDirection(s.matrixWorld);
      this.ray.set(o, d);
      const r = this.cast();
      const prev = this.xrHover[hand];
      if (prev && (!r || this.owner(prev.object)?.obj !== r.t.obj)) this.owner(prev.object)?.h.onHover?.(null);
      this.xrHover[hand] = r ? r.hit : null;
      if (r) {
        r.t.h.onHover?.(r.hit);
        ret.visible = true; ret.position.copy(r.hit.point).addScaledVector(d, -0.01);
        ret.lookAt(o);
      } else ret.visible = false;
    }
  }

  /** XR select from a given hand. */
  selectXR(hand: string) {
    const hit = this.xrHover[hand];
    if (!hit) return;
    this.owner(hit.object)?.h.onClick?.(hit);
  }
}
