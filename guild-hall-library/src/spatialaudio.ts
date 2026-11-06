import * as THREE from 'three';

/**
 * Web Audio parameter writes are costly on headset browsers (Quest Browser profiled them at several percent of the main
 * thread when made every frame), so per-frame callers go through these and only write when something has moved.
 */
const EPS = 0.005;

export class ListenerPose {
  private last = new Float32Array(9).fill(NaN);
  private p = new THREE.Vector3(); private q = new THREE.Quaternion();
  private f = new THREE.Vector3(); private u = new THREE.Vector3();

  write(ctx: BaseAudioContext, obj: THREE.Object3D) {
    const { p, q, f, u } = this;
    obj.getWorldPosition(p); obj.getWorldQuaternion(q); f.set(0, 0, -1).applyQuaternion(q); u.set(0, 1, 0).applyQuaternion(q);
    const next = [p.x, p.y, p.z, f.x, f.y, f.z, u.x, u.y, u.z];
    if (next.every((v, i) => Math.abs(v - this.last[i]) < EPS)) return;
    this.last.set(next);
    const L = ctx.listener, t = ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.05); L.positionY.setTargetAtTime(p.y, t, 0.05); L.positionZ.setTargetAtTime(p.z, t, 0.05);
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z;
    } else (L as any).setPosition(p.x, p.y, p.z);
  }
}

/** Moves a panner to (x, y, z), gliding over `glide` seconds (0 jumps), unless it is already there. */
export function placePanner(pan: PannerNode, last: THREE.Vector3, x: number, y: number, z: number, glide = 0) {
  if (Math.abs(last.x - x) < EPS && Math.abs(last.y - y) < EPS && Math.abs(last.z - z) < EPS) return;
  last.set(x, y, z);
  if (glide > 0) {
    const t = pan.context.currentTime;
    pan.positionX.setTargetAtTime(x, t, glide); pan.positionY.setTargetAtTime(y, t, glide); pan.positionZ.setTargetAtTime(z, t, glide);
  } else { pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z; }
}
