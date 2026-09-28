import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Merge static meshes under `root` by material into a few big meshes, to keep
 * the draw-call count inside a standalone headset's budget. Anything flagged
 * `userData.keep` (or under such a parent) is left alone, as are instanced
 * meshes, multi-material meshes, sprites and lights.
 */
export function bakeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const remove: THREE.Mesh[] = [];
  const kept = (o: THREE.Object3D) => { let p: THREE.Object3D | null = o; while (p && p !== root) { if (p.userData.keep) return true; p = p.parent; } return false; };
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as any).isInstancedMesh || Array.isArray(m.material) || kept(m) || m.renderOrder !== 0) return;
    const mat = m.material as THREE.Material;
    if (mat.transparent) return;
    let g = m.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.clearGroups();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    (buckets.get(mat) ?? buckets.set(mat, []).get(mat)!).push(g);
    remove.push(m);
  });
  for (const m of remove) m.parent?.remove(m);
  let n = 0;
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'baked:' + (mat.name || mat.type);
    root.add(mesh); n++;
    geos.forEach(g => g.dispose());
  }
  // prune now-empty groups
  const empty: THREE.Object3D[] = [];
  root.traverse(o => { if (o !== root && o.type === 'Group' && o.children.length === 0 && !o.userData.keep) empty.push(o); });
  empty.forEach(o => o.parent?.remove(o));
  return { merged: remove.length, into: n };
}
