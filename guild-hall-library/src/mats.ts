import * as THREE from 'three';
import * as T from './tex';
import { woodGrain } from './tex2';

export interface Mats {
  labradorite: THREE.MeshPhysicalMaterial;
  labradoriteDark: THREE.MeshPhysicalMaterial;
  gilt: THREE.MeshStandardMaterial;
  giltSatin: THREE.MeshStandardMaterial;
  walnut: THREE.MeshPhysicalMaterial;
  walnutDark: THREE.MeshPhysicalMaterial;
  floor: THREE.MeshPhysicalMaterial;
  wall: THREE.MeshStandardMaterial;
  reveal: THREE.MeshStandardMaterial;
  stoneExt: THREE.MeshStandardMaterial;
  marble: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  velvet: THREE.MeshPhysicalMaterial;
  blackMetal: THREE.MeshStandardMaterial;
  holo: THREE.MeshBasicMaterial;
  emissiveWarm: THREE.MeshStandardMaterial;
  emissiveCyan: THREE.MeshStandardMaterial;
  patina: THREE.MeshStandardMaterial;
  grass: THREE.MeshStandardMaterial;
  gravel: THREE.MeshStandardMaterial;
  hedge: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  floorDark: THREE.MeshPhysicalMaterial;
  cherryWall: THREE.MeshPhysicalMaterial;
  hallFloor: THREE.MeshPhysicalMaterial;
  darkMarble: THREE.MeshPhysicalMaterial;
}

export function makeMats(): Mats {
  const lab = T.labradorite(1024);
  const labradorite = new THREE.MeshPhysicalMaterial({
    map: lab.map, color: 0xffffff, roughness: 0.14, metalness: 0.0,
    clearcoat: 1.0, clearcoatRoughness: 0.04,
    iridescence: 1.0, iridescenceIOR: 1.75, iridescenceThicknessRange: [180, 820], iridescenceThicknessMap: lab.thickness,
    envMapIntensity: 1.25, specularIntensity: 1.0,
  });
  const labradoriteDark = labradorite.clone();
  labradoriteDark.color.set(0x9fb8b4);
  labradoriteDark.map = lab.map.clone(); labradoriteDark.map.repeat.set(1, 3); labradoriteDark.map.needsUpdate = true;

  const gilt = new THREE.MeshStandardMaterial({ color: 0xd4a44c, metalness: 1.0, roughness: 0.22, envMapIntensity: 1.3 });
  const giltSatin = new THREE.MeshStandardMaterial({ color: 0xb98d3e, metalness: 1.0, roughness: 0.38, envMapIntensity: 1.1 });

  // v3: strong, well-textured grain on every wood surface (colour + bump for relief under light)
  const wg = woodGrain('walnut', 1024, 3);
  const walnut = new THREE.MeshPhysicalMaterial({ map: wg.map, bumpMap: wg.bump, bumpScale: 1.2, roughness: 0.46, clearcoat: 0.6, clearcoatRoughness: 0.16, envMapIntensity: 0.9 });
  const walnutDark = walnut.clone(); walnutDark.color.set(0x9a8a80);
  const cg = woodGrain('cherry', 1024, 6); cg.map.repeat.set(1, 1); cg.bump.repeat.set(1, 1);
  const cherryWall = new THREE.MeshPhysicalMaterial({ map: cg.map, bumpMap: cg.bump, bumpScale: 1.4, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.25, envMapIntensity: 0.7 });
  const hallFloor = new THREE.MeshPhysicalMaterial({ map: T.marble(1024, '#e6e8ec', '#6f7c8c', 3), roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1 });
  const darkMarble = new THREE.MeshPhysicalMaterial({ map: T.marble(512, '#1f2a36', '#9fb0c2', 1), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 });

  const floor = new THREE.MeshPhysicalMaterial({ map: T.mosaicFloor(2048), roughness: 0.2, clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.0 });

  const dm = T.wallDamask(512);
  const wall = new THREE.MeshStandardMaterial({ map: dm, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.6 });
  const reveal = new THREE.MeshStandardMaterial({ color: 0x163530, roughness: 0.6 });
  const stoneExt = new THREE.MeshStandardMaterial({ map: T.marble(512, '#bfb6a3', '#8d8575'), roughness: 0.8 });
  const marbleMat = new THREE.MeshPhysicalMaterial({ map: T.marble(512, '#e8e2d4', '#a39d90'), roughness: 0.3, clearcoat: 0.4, envMapIntensity: 0.8 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fd6cf, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.1, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide });
  const velvet = new THREE.MeshPhysicalMaterial({ color: 0x1e4a3f, roughness: 0.85, sheen: 1.0, sheenColor: new THREE.Color(0x6fb8a0), sheenRoughness: 0.5 });
  const blackMetal = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.85, roughness: 0.3 });
  const holo = new THREE.MeshBasicMaterial({ color: 0x66f0ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const emissiveWarm = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 2.2, roughness: 0.3 });
  const emissiveCyan = new THREE.MeshStandardMaterial({ color: 0x9ff6ff, emissive: 0x4fe3ff, emissiveIntensity: 2.4, roughness: 0.2 });
  const patina = new THREE.MeshStandardMaterial({ color: 0x3f7f6e, metalness: 0.6, roughness: 0.55 });
  const gtex = T.grass(512); gtex.repeat.set(60, 60);
  const grass = new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.95 });
  const gvl = T.gravel(512); gvl.repeat.set(8, 8);
  const gravel = new THREE.MeshStandardMaterial({ map: gvl, roughness: 0.9, color: 0xb9b2a4 });
  const hedge = new THREE.MeshStandardMaterial({ map: T.grass(256), color: 0x6f9a62, roughness: 0.9 });
  const leather = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.0 });
  const floorDark = new THREE.MeshPhysicalMaterial({ map: T.marble(512, '#1a3a33', '#4f7d70', 6), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
  return { cherryWall, hallFloor, darkMarble, floorDark, labradorite, labradoriteDark, gilt, giltSatin, walnut, walnutDark, floor, wall, reveal, stoneExt, marble: marbleMat, glass, velvet, blackMetal, holo, emissiveWarm, emissiveCyan, patina, grass, gravel, hedge, leather };
}
