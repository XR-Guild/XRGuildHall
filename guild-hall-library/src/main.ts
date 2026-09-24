import * as THREE from 'three';
import {
  World, SessionMode, LocomotionEnvironment, EnvironmentType, TurningMethod,
  Interactable, DistanceGrabbable, MovementMode, createSystem,
} from '@iwsdk/core';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { makeMats } from './mats';
import { AuroraSky } from './sky';
import { buildRotunda, CORNER_R, SIDES } from './rotunda';
import { buildTable, TABLE_TOP } from './table';
import { buildGarden } from './garden';
import { buildApse, APSE_FRONT } from './library3d';
import { newsPanel, libraryPanel, timelinePanel } from './xrpanels';
import { Interactor } from './interact';
import { initUI, lineageCard } from './ui';
import { store } from './store';
import { bakeStatic } from './bake';

const FONTS = {
  display: "'Marcellus SC', Georgia, serif",
  body: "'Alegreya Sans', 'Gill Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};
const MODEL_BASE = (window as any).__XRGH_MODELS__ ?? 'models/';
const MODEL_EXT = (window as any).__XRGH_MODEL_EXT__ ?? '.glb';

const loadBar = document.getElementById('loadBar')!;
const loadMsg = document.getElementById('loadMsg')!;
const step = async (p: number, msg: string) => {
  loadBar.style.width = `${Math.round(p * 100)}%`; loadMsg.textContent = msg;
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
};

async function fontsReady() {
  try {
    await Promise.race([
      Promise.all(['40px "Marcellus SC"', '40px "Alegreya Sans"', '600 40px "Alegreya Sans"', '40px "IBM Plex Mono"', '600 40px "IBM Plex Mono"'].map(f => document.fonts.load(f))),
      new Promise(r => setTimeout(r, 4000)),
    ]);
  } catch { /* fall back to system faces */ }
}

async function main() {
  await step(0.03, 'Opening the doors…');
  await fontsReady();
  const container = document.getElementById('scene')!;
  const xrSupported = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);

  const world = await World.create(container, {
    xr: { sessionMode: SessionMode.ImmersiveVR, offer: 'none', features: { handTracking: true } },
    render: { fov: 62, near: 0.05, far: 700 },
    input: { canvasPointerEvents: false },
    features: {
      locomotion: { useWorker: false, initialPlayerPosition: [0, 0, 6.6], turningMethod: TurningMethod.SnapTurn, enableJumping: false, browserControls: { keyboard: true, gamepad: true } },
      grabbing: { useHandPinchForGrab: true },
      spatialUI: false,
    },
  });
  const { renderer, scene, camera } = world;
  // Register a floor immediately so the player never free-falls while the hall loads.
  {
    const early = new THREE.Mesh(new THREE.BoxGeometry(120, 0.2, 120), new THREE.MeshBasicMaterial());
    early.position.set(0, -0.1, 8); early.visible = false;
    world.createTransformEntity(early, { persistent: true }).addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const isMobile = matchMedia('(hover: none)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(0.03, 0.065, 0.1), 0.0052);

  await step(0.12, 'Laying the labradorite…');
  const m = makeMats();

  await step(0.3, 'Raising the aurora…');
  const sky = new AuroraSky(renderer, isMobile ? 384 : 512);
  sky.renderAll(8);
  scene.background = sky.rt.texture;

  await step(0.4, 'Building the rotunda…');
  const rot = buildRotunda(m, FONTS.display);
  const table = buildTable(m, FONTS);
  const garden = buildGarden(m, sky.rt.texture, !isMobile);
  const apse = buildApse(m, FONTS, rot.domeMat.clone());

  // News easel beside the table (south-east gap between the benches)
  const news = newsPanel(FONTS);
  const makeEasel = (x: number, z: number) => {
    const easel = new THREE.Group(); easel.userData.keep = true;
    easel.position.set(x, 0, z); easel.lookAt(0, 0, 0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.36, 1.78, 0.06), m.walnut); frame.position.set(0, 1.5, -0.04); easel.add(frame);
    const crest: THREE.Vector3[] = []; for (let i = 0; i <= 20; i++) { const cx = -0.68 + (i / 20) * 1.36; crest.push(new THREE.Vector3(cx, 2.46 + Math.sin((i / 20) * Math.PI) * 0.18, 0)); }
    easel.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(crest), 48, 0.025, 8), m.gilt));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), m.emissiveCyan); orb.position.set(0, 2.68, 0); easel.add(orb);
    for (const sgn of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 2.4, 12), m.walnut); leg.position.set(sgn * 0.52, 1.2, -0.1); easel.add(leg); }
    return easel;
  };
  const easel = makeEasel(3.75, 2.2);
  news.mesh.position.set(0, 1.5, 0.0);
  easel.add(news.mesh);
  news.draw();

  // Timeline easel, mirroring the news easel in the south-west gap
  const tlp = timelinePanel(FONTS);
  const tlEasel = makeEasel(-3.75, 2.2);
  tlp.panel.mesh.position.set(0, 1.5, 0); tlEasel.add(tlp.panel.mesh); tlp.panel.draw();

  const lib = libraryPanel(FONTS);
  lib.panel.mesh.position.set(0, 1.62, 0.0);
  apse.panelMount.add(lib.panel.mesh);
  lib.panel.draw();

  await step(0.55, 'Gilding the details…');
  for (const g of [rot.group, table.group, garden.group, apse.group]) bakeStatic(g);

  // ---- IWSDK entities ----
  const addEntity = (o: THREE.Object3D) => world.createTransformEntity(o, { persistent: true });
  addEntity(rot.group); const tableEnt = addEntity(table.group); addEntity(garden.group); addEntity(apse.group); addEntity(easel); addEntity(tlEasel);
  for (const d of table.devices) {
    const e = world.createTransformEntity(d.object, { parent: tableEnt, persistent: true });
    e.addComponent(Interactable);
    e.addComponent(DistanceGrabbable, { movementMode: MovementMode.MoveTowardsTarget, returnToOrigin: true, scale: false } as any);
  }
  const colliders = new THREE.Group(); colliders.name = 'Walkable';
  colliders.add(rot.colliders, table.colliders, garden.colliders, apse.colliders);
  colliders.visible = false;
  world.createTransformEntity(colliders, { persistent: true }).addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  // ---- load the two GLB designs ----
  await step(0.62, 'Unshelving the library…');
  const loader = new GLTFLoader();
  const load = (url: string, onP: (f: number) => void) => new Promise<THREE.Group>((res, rej) => loader.load(url, g => res(g.scene), e => e.total && onP(e.loaded / e.total), rej));
  const [libScene, hallScene] = await Promise.all([
    load(MODEL_BASE + 'library' + MODEL_EXT, f => { loadBar.style.width = `${Math.round((0.62 + f * 0.25) * 100)}%`; }).catch(e => { console.warn('library model failed', e); return null; }),
    load(MODEL_BASE + 'hall' + MODEL_EXT, () => {}).catch(e => { console.warn('hall model failed', e); return null; }),
  ]);
  if (libScene) apse.placeLibrary(libScene);
  if (hallScene) garden.placeColonnade(hallScene);

  // ---- reflections: interior environment capture (two bounces) ----
  await step(0.9, 'Polishing the floor…');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.1, 500, cubeRT); cubeCam.position.set(0, 1.9, 1.2); scene.add(cubeCam);
  const capture = () => {
    const xr = renderer.xr.enabled; renderer.xr.enabled = false;
    table.hologram.visible = false;
    cubeCam.update(renderer, scene);
    table.hologram.visible = true;
    renderer.xr.enabled = xr;
    const env = pmrem.fromCubemap(cubeRT.texture).texture;
    scene.environment?.dispose?.(); scene.environment = env;
  };
  capture(); capture();
  scene.environmentIntensity = 0.9;

  // desktop mirror floor
  let floorRefl: Reflector | null = null;
  const floorMat = rot.floor.material as THREE.MeshPhysicalMaterial;
  if (!isMobile) {
    const fg = new THREE.CircleGeometry(CORNER_R, SIDES, Math.PI / 2 - Math.PI / SIDES); fg.rotateX(-Math.PI / 2);
    floorRefl = new Reflector(fg, { textureWidth: Math.round(innerWidth * 0.6), textureHeight: Math.round(innerHeight * 0.6), color: 0xa0a0a0, clipBias: 0.002 });
    floorRefl.position.y = -0.004; scene.add(floorRefl);
  }
  const setReflections = (on: boolean) => {
    const use = on && !world.session;
    if (floorRefl) floorRefl.visible = use;
    floorMat.transparent = use && !!floorRefl; floorMat.opacity = use && floorRefl ? 0.8 : 1; floorMat.needsUpdate = true;
    if (garden.waterReflector) {
      garden.waterReflector.visible = use;
      const wm = garden.water.material as THREE.MeshPhysicalMaterial; wm.transparent = use; wm.opacity = use ? 0.45 : 1; wm.depthWrite = !use; wm.needsUpdate = true;
    }
  };
  let reflectionsWanted = true;
  setReflections(true);

  // ---- interaction ----
  const inter = new Interactor(world, renderer.domElement);
  inter.tooltip = document.getElementById('tooltip');
  inter.blockers = [rot.colliders, apse.colliders];
  inter.walkables = [rot.colliders.children[0], garden.colliders.children[0], apse.colliders];
  inter.addPanel(news, 'Connect news');
  inter.addPanel(lib.panel, 'Guild library');
  inter.addPanel(tlp.panel, 'Timeline of XR');
  table.devices.forEach(d => inter.add(d.object, { label: 'Lineage · click for details', onClick: () => store.showCard?.(lineageCard(d.index)) }));
  inter.add(table.featured, { label: 'Meta VR Glasses · open the news', onClick: () => store.openTab?.('news') });
  apse.lanterns.forEach(l => inter.add(l.object, {
    label: 'Browse this category',
    onClick: () => { lib.state.cat = l.catId; lib.state.page = 0; lib.state.sel = null; lib.panel.draw(); store.openTab?.('library', { cat: l.catId, query: '' }); },
  }));

  // ---- desktop look controls ----
  camera.rotation.order = 'YXZ';
  let yaw = 0, pitch = -0.06;
  const cv = renderer.domElement;
  let drag: { x: number; y: number; id: number } | null = null;
  cv.addEventListener('pointerdown', e => { if (e.button === 0) { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; } });
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const k = e.pointerType === 'touch' ? 0.006 : 0.0042;
    yaw -= (e.clientX - drag.x) * k; pitch -= (e.clientY - drag.y) * k * 0.85;
    pitch = Math.max(-1.3, Math.min(1.3, pitch));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  window.addEventListener('keydown', e => {
    if ((e.target as HTMLElement).closest?.('input,textarea,select')) return;
    if (e.code === 'KeyQ') yaw += Math.PI / 8; if (e.code === 'KeyE') yaw -= Math.PI / 8;
  });

  // ---- tours ----
  const fade = document.getElementById('fade')!;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const TOURS = [
    { id: 'hall', name: 'Main hall', hint: 'South end of the rotunda', pos: V(0, 0, 6.6), look: V(0, 1.6, 0) },
    { id: 'table', name: 'Connect table', hint: 'The labradorite table and the device lineage', pos: V(1.95, 0, 1.12), look: V(0, 1.1, 0) },
    { id: 'news', name: 'News easel', hint: 'Meta VR Glasses specs and questions', pos: V(2.2, 0, 1.3), look: V(3.75, 1.45, 2.2) },
    { id: 'timeline', name: 'Timeline easel', hint: 'Walk the history of VR and XR', pos: V(-2.2, 0, 1.3), look: V(-3.75, 1.45, 2.2) },
    { id: 'library', name: 'Library apse', hint: 'Search the guild library in 3D', pos: V(-1.0, 0, APSE_FRONT - 0.9), look: V(-3.7, 1.55, APSE_FRONT - 2.4) },
    { id: 'terrace', name: 'Garden terrace', hint: 'Out the south doors', pos: V(0, 0, 12.2), look: V(0, 1.2, 40) },
    { id: 'colonnade', name: 'Colonnade', hint: 'Across the reflecting pool', pos: V(0, 0, 44.6), look: V(0, 5, 0) },
  ];
  const goTo = (id: string) => {
    const t = TOURS.find(x => x.id === id); if (!t) return;
    fade.classList.add('on');
    setTimeout(() => {
      world.setAuthoredPlayerPosition(t.pos);
      const d = t.look.clone().sub(t.pos.clone().setY(1.7));
      yaw = Math.atan2(-d.x, -d.z); pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      setTimeout(() => fade.classList.remove('on'), 60);
    }, 220);
  };
  inter.onTeleport = p => {
    fade.classList.add('on');
    setTimeout(() => { world.setAuthoredPlayerPosition(p.clone().setY(0)); setTimeout(() => fade.classList.remove('on'), 40); }, 160);
  };
  { const d = V(0, 1.6, 0).sub(V(0, 1.7, 6.6)); yaw = Math.atan2(-d.x, -d.z); pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }

  // ---- motion + quality settings ----
  let reduced = false;
  const glows = [...rot.glows, ...garden.glows, ...apse.glows];

  // ---- XR session hooks ----
  renderer.xr.addEventListener('sessionstart', () => {
    const s = renderer.xr.getSession()!;
    s.addEventListener('select', (e: XRInputSourceEvent) => inter.selectXR(e.inputSource.handedness));
    setReflections(false);
    rot.lights.slice(1).forEach(l => (l.visible = false));
    try { renderer.xr.setFoveation(0.6); } catch { /* optional */ }
  });
  renderer.xr.addEventListener('sessionend', () => {
    setReflections(reflectionsWanted);
    rot.lights.forEach(l => (l.visible = true));
  });

  // ---- per-frame system ----
  let lastRescue = -10;
  class HallSystem extends createSystem({}) {
    update(delta: number, time: number) {
      const inXR = !!world.session;
      const py = world.player.position.y;
      if ((py < -4 || py > 2.5) && time - lastRescue > 1.5) { console.warn('[hall] rescue from y=' + py.toFixed(2)); lastRescue = time; world.setAuthoredPlayerPosition(TOURS[0].pos); }
      if (!inXR) camera.rotation.set(pitch, yaw, 0);
      sky.update(time, inXR ? 2 : 1);
      table.update(time, delta, reduced);
      garden.update(time, reduced);
      apse.update(time, reduced);
      if (!reduced) {
        const f = 0.92 + Math.sin(time * 1.7) * 0.04 + Math.sin(time * 5.3) * 0.02;
        for (const g of glows) g.material.opacity = (g.userData.base ??= g.material.opacity) * f;
      }
      inter.update();
    }
  }
  world.registerSystem(HallSystem);

  // ---- UI ----
  initUI({
    tours: TOURS.map(({ id, name, hint }) => ({ id, name, hint })),
    goTo,
    enterVR: xrSupported ? () => world.launchXR() : null,
    setReduceMotion: v => { reduced = v; },
    setAurora: v => { sky.animate = v; },
    setReflections: v => { reflectionsWanted = v; setReflections(v); },
    askProxy: (import.meta as any).env?.VITE_ASK_PROXY || undefined,
  });

  world.setAuthoredPlayerPosition(TOURS[0].pos);
  setTimeout(() => world.setAuthoredPlayerPosition(TOURS[0].pos), 600);
  await step(1, 'Welcome to the Guild Hall');
  document.getElementById('loading')!.classList.add('done');
  (window as any).__xrgh = { THREE, world, goTo, setView: (y: number, p: number) => { yaw = y; pitch = p; }, TABLE_TOP };
}

main().catch(err => {
  console.error(err);
  const msg = document.getElementById('loadMsg');
  if (msg) msg.textContent = 'The hall could not open in this browser. WebGL 2 is required. ' + (err?.message ?? '');
});
