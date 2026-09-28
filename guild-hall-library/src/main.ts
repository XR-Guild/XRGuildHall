import * as THREE from 'three';
import {
  World, SessionMode, LocomotionEnvironment, EnvironmentType, TurningMethod,
  Interactable, DistanceGrabbable, MovementMode, createSystem,
} from '@iwsdk/core';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { makeMats } from './mats';
import * as T from './tex';
import { AuroraSky } from './sky';
import { buildChamber, type BayKind } from './chamber';
import { buildColonnade } from './walk';
import { buildTable, TABLE_TOP } from './table';
import { buildGarden } from './garden';
import { buildLibraryInterior } from './library3d';
import { buildStage, buildWelcomeDesk, buildEventsBoard, bannerTexture, LINKS } from './hallfeatures';
import { buildSeating } from './seating';
import { newsPanel, libraryPanel, timelinePanel } from './xrpanels';
import { Interactor } from './interact';
import { initUI, lineageCard } from './ui';
import { initSocial } from './social';
import { store } from './store';
import { bakeStatic } from './bake';
import { HALL, LIB, STAGE, DESK, SPAWN, POOL, BENCHES, PATH_CURVE, V, zoneOf, type Zone } from './site';
import { Presence } from './net/presence';
import { SimTransport } from './net/sim';
import { Avatars } from './avatars';
import type { LiveKitSession } from './net/livekit';

const FONTS = {
  display: "'Marcellus SC', Georgia, serif",
  body: "'Alegreya Sans', 'Gill Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};
const MODEL_BASE = (window as any).__XRGH_MODELS__ ?? 'models/';
const MODEL_EXT = (window as any).__XRGH_MODEL_EXT__ ?? '.glb';
const ENV = (import.meta as any).env ?? {};
const PARAMS = new URLSearchParams(location.search);
const SIM = Math.min(300, Math.max(0, parseInt(PARAMS.get('sim') ?? '0', 10) || 0));
const VIVERSE_APP_ID: string = PARAMS.get('viverseApp') || ENV.VITE_VIVERSE_APP_ID || '';
const LIVEKIT_TOKEN_URL: string = ENV.VITE_LIVEKIT_TOKEN_URL || '';

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
      locomotion: { useWorker: false, initialPlayerPosition: SPAWN.pos.toArray() as [number, number, number], turningMethod: TurningMethod.SnapTurn, enableJumping: false, browserControls: { keyboard: true, gamepad: true } },
      grabbing: { useHandPinchForGrab: true },
      spatialUI: false,
    },
  });
  const { renderer, scene, camera } = world;
  // Register a floor immediately so the player never free-falls while the world loads.
  {
    const early = new THREE.Mesh(new THREE.BoxGeometry(150, 0.2, 150), new THREE.MeshBasicMaterial());
    early.position.set(11, -0.1, 2); early.visible = false;
    world.createTransformEntity(early, { persistent: true }).addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const isMobile = matchMedia('(hover: none)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(0.03, 0.065, 0.1), 0.0048);

  await step(0.12, 'Laying the labradorite…');
  const m = makeMats();

  await step(0.3, 'Raising the aurora…');
  const sky = new AuroraSky(renderer, isMobile ? 384 : 512);
  sky.renderAll(8);
  scene.background = sky.rt.texture;

  await step(0.4, 'Raising the Guild Hall…');
  const mural = T.domeMural();
  const hallBays: BayKind[] = ['banner', 'window', 'window', 'door', 'window', 'window', 'window', 'window', 'window', 'window', 'window', 'window'];
  const hall = buildChamber(m, { name: 'GuildHall', center: HALL.center, apothem: HALL.apothem, wallH: HALL.wallH, bays: hallBays, frieze: true, friezeFont: FONTS.display, domeMural: mural, chandelier: 1, fillLights: 3, floorMat: m.floor });
  const libBays: BayKind[] = ['window', 'shelf', 'panelShelf', 'panelShelf', 'panelShelf', 'shelf', 'window', 'window', 'shelf', 'door', 'shelf', 'shelf'];
  const libFloor = m.floorDark.clone();
  const lib = buildChamber(m, { name: 'Library', center: LIB.center, apothem: LIB.apothem, wallH: LIB.wallH, bays: libBays, domeMural: mural, chandelier: 0.75, fillLights: 2, floorMat: libFloor, sparseBooks: 0.42 });
  // banner behind the stage
  {
    const mount = hall.bannerMounts.get(0)!;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.78, 3.8), new THREE.MeshStandardMaterial({ map: bannerTexture(FONTS), emissiveMap: null, roughness: 0.8, emissive: 0x0, envMapIntensity: 0.4 }));
    (banner.material as THREE.MeshStandardMaterial).emissiveMap = (banner.material as THREE.MeshStandardMaterial).map; (banner.material as THREE.MeshStandardMaterial).emissive.set(0xffffff); (banner.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.28;
    banner.position.z = 0.03; mount.add(banner);
  }
  const colonnade = buildColonnade(m);
  const stage = buildStage(m);
  const table = buildTable(m, FONTS);
  table.group.position.copy(LIB.center); table.colliders.position.copy(LIB.center);
  const garden = buildGarden(m, sky.rt.texture, !isMobile);
  const libIn = buildLibraryInterior(m, FONTS);
  const seating = buildSeating(m);

  const inXR = () => !!world.session;
  const openLink = (url: string) => { window.open(url, '_blank', 'noopener'); };
  const desk = buildWelcomeDesk(m, FONTS, openLink, inXR);
  // Library shelves: News (NE), Library search (E, facing the door), Timeline (SE)
  const news = newsPanel(FONTS); news.mesh.position.set(0, 0, 0.01); lib.panelMounts.get(2)!.add(news.mesh); news.draw();
  const libp = libraryPanel(FONTS); libp.panel.mesh.position.set(0, 0, 0.01); lib.panelMounts.get(3)!.add(libp.panel.mesh); libp.panel.draw();
  const tlp = timelinePanel(FONTS); tlp.panel.mesh.position.set(0, 0, 0.01); lib.panelMounts.get(4)!.add(tlp.panel.mesh); tlp.panel.draw();

  // tours (declared early so panels can walk people around)
  const fade = document.getElementById('fade')!;
  const inward = (k: number, d: number) => lib.bayWorld(k, d);
  const TOURS = [
    { id: 'hall', name: 'Arrival', hint: 'The Guild Hall, by the welcome desk', pos: SPAWN.pos, look: SPAWN.look },
    { id: 'desk', name: 'Join the Guild', hint: 'Welcome desk and events board', pos: DESK.pos.clone().multiplyScalar(0.62), look: DESK.pos.clone().setY(1.7) },
    { id: 'stage', name: 'Stage', hint: 'Stand on the stage (up to 5 people)', pos: STAGE.center.clone().setY(STAGE.h).add(V(0, 0, 1.0)), look: V(0, 1.5, 6) },
    { id: 'colonnade', name: 'Colonnade', hint: 'The labradorite walk to the Library', pos: PATH_CURVE.getPointAt(0.35).setY(0), look: PATH_CURVE.getPointAt(0.9).setY(1.6) },
    { id: 'library', name: 'Library', hint: 'Arrive beside the Connect table', pos: LIB.center.clone().add(V(2.6, 0, 1.9)), look: inward(2, 0).setY(1.6) },
    { id: 'table', name: 'Connect table', hint: 'Device lineage and the Meta VR Glasses', pos: LIB.center.clone().add(V(-0.4, 0, 2.3)), look: LIB.center.clone().setY(1.0) },
    { id: 'shelves', name: 'Library search', hint: 'The search shelf in the Library', pos: inward(3, 2.3), look: inward(3, 0).setY(1.65) },
    { id: 'garden', name: 'Garden', hint: 'Reflecting pool, maples and flowers', pos: BENCHES[0].clone().add(V(-0.8, 0, 0.9)), look: POOL.center.clone().setY(0.8) },
  ];

  const board = buildEventsBoard(m, FONTS, openLink, () => goTo('library'), inXR);

  await step(0.55, 'Gilding the details…');
  for (const g of [hall.group, lib.group, colonnade.group, stage.group, table.group, garden.group, libIn.group]) bakeStatic(g);

  // ---- IWSDK entities ----
  const addEntity = (o: THREE.Object3D) => world.createTransformEntity(o, { persistent: true });
  for (const g of [hall.group, lib.group, colonnade.group, stage.group, garden.group, libIn.group, desk.group, board.group, seating.group]) addEntity(g);
  const tableEnt = addEntity(table.group);
  for (const d of table.devices) {
    const e = world.createTransformEntity(d.object, { parent: tableEnt, persistent: true });
    e.addComponent(Interactable);
    e.addComponent(DistanceGrabbable, { movementMode: MovementMode.MoveTowardsTarget, returnToOrigin: true, scale: false } as any);
  }
  const colliders = new THREE.Group(); colliders.name = 'Walkable';
  colliders.add(hall.colliders, lib.colliders, colonnade.colliders, stage.colliders, desk.colliders, table.colliders, garden.colliders);
  colliders.visible = false;
  world.createTransformEntity(colliders, { persistent: true }).addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  // ---- the white colonnade GLB becomes a garden folly (the fantasy-library GLB is not loaded: see README) ----
  await step(0.62, 'Planting the garden…');
  const loader = new GLTFLoader();
  const hallScene = await new Promise<THREE.Group | null>(res => loader.load(MODEL_BASE + 'hall' + MODEL_EXT, g => res(g.scene), undefined, e => { console.warn('folly model failed', e); res(null); }));
  if (hallScene) garden.placeColonnade(hallScene);

  // ---- reflections: environment capture from the hall (two bounces) ----
  await step(0.9, 'Polishing the floors…');
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

  // desktop mirror floors: only the one in your zone renders
  const floorRefls: { zone: Zone; refl: Reflector; mat: THREE.MeshPhysicalMaterial }[] = [];
  if (!isMobile) {
    for (const [ch, zone, ap] of [[hall, 'hall', HALL.apothem], [lib, 'library', LIB.apothem]] as const) {
      const fg = new THREE.CircleGeometry(ap / Math.cos(Math.PI / 12), 12, Math.PI / 2 - Math.PI / 12); fg.rotateX(-Math.PI / 2);
      const refl = new Reflector(fg, { textureWidth: Math.round(innerWidth * 0.6), textureHeight: Math.round(innerHeight * 0.6), color: 0xa0a0a0, clipBias: 0.002 });
      refl.position.copy(ch === hall ? HALL.center : LIB.center).setY(-0.004); scene.add(refl);
      floorRefls.push({ zone, refl, mat: ch.floor.material as THREE.MeshPhysicalMaterial });
    }
  }
  let reflectionsWanted = true;
  let zone: Zone = 'hall';
  const setReflections = (on: boolean) => {
    const use = on && !world.session;
    for (const f of floorRefls) {
      const vis = use && f.zone === zone;
      f.refl.visible = vis; f.mat.transparent = vis; f.mat.opacity = vis ? 0.8 : 1; f.mat.needsUpdate = true;
    }
    if (garden.waterReflector) {
      const vis = use && (zone === 'garden' || zone === 'colonnade');
      garden.waterReflector.visible = vis;
      const wm = garden.water.material as THREE.MeshPhysicalMaterial; wm.transparent = vis; wm.opacity = vis ? 0.45 : 1; wm.depthWrite = !vis; wm.needsUpdate = true;
    }
  };
  setReflections(true);

  // ---- people ----
  const presence = new Presence('Guest');
  const avatars = new Avatars(FONTS); scene.add(avatars.group);
  let voice: LiveKitSession | null = null;
  let sim: SimTransport | null = null;

  // ---- interaction ----
  const inter = new Interactor(world, renderer.domElement);
  inter.tooltip = document.getElementById('tooltip');
  inter.blockers = [hall.colliders, lib.colliders];
  inter.walkables = [hall.colliders.children[0], lib.colliders.children[0], garden.colliders.children[0], stage.colliders];
  inter.addPanel(news, 'Connect news');
  inter.addPanel(libp.panel, 'Guild library');
  inter.addPanel(tlp.panel, 'Timeline of XR');
  inter.addPanel(desk.panel, 'Join the XR Guild');
  inter.addPanel(board.panel, 'Guild notice board');
  inter.add(desk.plaque, { label: 'Visit xrguild.org', onClick: () => { if (!inXR()) openLink(LINKS.home); } });
  table.devices.forEach(d => inter.add(d.object, { label: 'Lineage · click for details', onClick: () => store.showCard?.(lineageCard(d.index)) }));
  inter.add(table.featured, { label: 'Meta VR Glasses · open the news', onClick: () => store.openTab?.('news') });
  libIn.lanterns.forEach(l => inter.add(l.object, {
    label: 'Browse this category',
    onClick: () => { libp.state.cat = l.catId; libp.state.page = 0; libp.state.sel = null; libp.panel.draw(); store.openTab?.('library', { cat: l.catId, query: '' }); },
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
  const lookAt = (from: THREE.Vector3, at: THREE.Vector3) => { const d = at.clone().sub(from.clone().setY(from.y + (seat ? 1.2 : 1.7))); yaw = Math.atan2(-d.x, -d.z); pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); };

  // ---- seating: click a chair to sit, walk away to stand ----
  let seat: { key: string; pos: THREE.Vector3 } | null = null;
  const stand = () => { seat = null; presence.self.seat = null; camera.position.y = 1.7; };
  const sitAt = (zoneKey: 'hall' | 'library', index: number) => {
    const s = seating.seats(zoneKey)[index]; if (!s) return;
    const key = `${zoneKey}:${seating.preset[zoneKey]}:${index}`;
    if (presence.seatTaken(key)) { social.sys('That seat is taken.'); return; }
    fade.classList.add('on');
    setTimeout(() => {
      world.setAuthoredPlayerPosition(s.pos.clone().add(V(Math.sin(s.rotY) * 0.05, 0, Math.cos(s.rotY) * 0.05)));
      seat = { key, pos: s.pos.clone() }; presence.self.seat = key;
      const f = V(Math.sin(s.rotY), 0, Math.cos(s.rotY)); yaw = Math.atan2(-f.x, -f.z); pitch = -0.05;
      if (!world.session) camera.position.y = 1.2;
      setTimeout(() => fade.classList.remove('on'), 60);
    }, 180);
  };
  for (const hm of seating.hitMeshes) inter.add(hm, { label: 'Sit here', onClick: hit => { const r = seating.seatFromHit(hit); if (r) sitAt(r.zone, r.index); } });

  const goTo = (id: string) => {
    const t = TOURS.find(x => x.id === id); if (!t) return;
    fade.classList.add('on');
    setTimeout(() => {
      stand();
      world.setAuthoredPlayerPosition(t.pos);
      lookAt(t.pos, t.look);
      setTimeout(() => fade.classList.remove('on'), 60);
    }, 220);
  };
  inter.onTeleport = p => {
    fade.classList.add('on');
    setTimeout(() => { stand(); world.setAuthoredPlayerPosition(p.clone().setY(p.y > 0.2 ? p.y : 0)); setTimeout(() => fade.classList.remove('on'), 40); }, 160);
  };
  lookAt(SPAWN.pos, SPAWN.look);

  // ---- motion + quality settings ----
  let reduced = false;
  const glows = [...hall.glows, ...lib.glows, ...colonnade.glows, ...garden.glows, ...libIn.glows];
  const allLights = [...hall.lights, ...lib.lights, ...colonnade.lights];

  // ---- XR session hooks ----
  renderer.xr.addEventListener('sessionstart', () => {
    const s = renderer.xr.getSession()!;
    s.addEventListener('select', (e: XRInputSourceEvent) => inter.selectXR(e.inputSource.handedness));
    setReflections(false);
    try { renderer.xr.setFoveation(0.6); } catch { /* optional */ }
  });
  renderer.xr.addEventListener('sessionend', () => { setReflections(reflectionsWanted); camera.position.y = seat ? 1.2 : 1.7; });

  // ---- UI ----
  const ui = initUI({
    tours: TOURS.map(({ id, name, hint }) => ({ id, name, hint })),
    goTo,
    enterVR: xrSupported ? () => world.launchXR() : null,
    setReduceMotion: v => { reduced = v; },
    setAurora: v => { sky.animate = v; },
    setReflections: v => { reflectionsWanted = v; setReflections(v); },
    askProxy: ENV.VITE_ASK_PROXY || undefined,
  });

  const social = initSocial({
    presence, seating,
    canConnect: true,
    joinLabel: SIM > 0 || VIVERSE_APP_ID || LIVEKIT_TOKEN_URL ? 'Join others' : 'Preview a crowd',
    defaultName: () => presence.self.name !== 'Guest' ? presence.self.name : '',
    voice: () => voice,
    connect: async (name: string) => {
      presence.self.name = name.slice(0, 32) || 'Guest';
      if (SIM > 0 || !(VIVERSE_APP_ID || LIVEKIT_TOKEN_URL)) {
        // no server configured (e.g. the artifact preview): an offline simulated crowd shows how the room behaves
        sim = new SimTransport(SIM || 60);
        sim.seatProvider = () => (['hall', 'library'] as const).flatMap(z => seating.seats(z).map((s, i) => ({ key: `${z}:${seating.preset[z]}:${i}`, pos: s.pos, rotY: s.rotY })));
        await presence.connect(sim);
        return;
      }
      const { LiveKitSession, LiveKitTransport } = LIVEKIT_TOKEN_URL ? await import('./net/livekit') : ({} as any);
      if (VIVERSE_APP_ID) {
        const { viverseIdentity, ViverseTransport } = await import('./net/viverse');
        const id = await viverseIdentity(VIVERSE_APP_ID, true);
        if (!id) throw new Error('Taking you to the VIVERSE login…');
        if (!name) presence.self.name = id.name;
        presence.self.avatar = id.vrmUrl;
        avatars.fetchAvatar = url => id.avatarClient.getAvatarFileWithSDK(url);
        await presence.connect(new ViverseTransport(VIVERSE_APP_ID, id));
        if (LiveKitSession) { voice = new LiveKitSession(LIVEKIT_TOKEN_URL, 'guild-hall'); voice!.onStatus = () => social.drawDock(); await voice!.connect(presence.self.id, presence.self.name); }
        return;
      }
      if (LiveKitSession) {
        voice = new LiveKitSession(LIVEKIT_TOKEN_URL, PARAMS.get('room') ?? 'guild-hall');
        voice!.hostKey = PARAMS.get('hostKey') ?? '';
        await presence.connect(new LiveKitTransport(voice));
      }
    },
  });
  presence.onControl = c => {
    if (c.type === 'seating') { seating.setPreset(c.zone, c.preset); if (seat && seat.key.startsWith(c.zone + ':')) stand(); social.sys(`The host changed the ${c.zone === 'hall' ? 'hall' : 'library'} seating.`); }
    if (c.type === 'muteHall' && voice?.micOn && presence.self.zone === 'hall' && !presence.self.onStage) { voice.setMic(false).then(() => social.drawDock()); social.sys('The host asked the hall to mute. Your mic is off.'); }
  };
  if (VIVERSE_APP_ID && /viverse/i.test(location.hostname) && !SIM) setTimeout(() => document.getElementById('socJoin')?.click(), 1200);
  if (SIM > 0) setTimeout(() => { social.drawDock(); document.getElementById('socJoin')?.click(); (document.getElementById('cocName') as HTMLInputElement).value = 'You'; }, 800);

  // ---- per-frame system ----
  let lastRescue = -10, lastSubs = 0;
  const tmpQ = new THREE.Quaternion(), fwd = new THREE.Vector3();
  let speaking = new Set<string>();
  class HallSystem extends createSystem({}) {
    update(delta: number, time: number) {
      const xr = !!world.session;
      const pp = world.player.position;
      if ((pp.y < -4 || pp.y > 2.5) && time - lastRescue > 1.5) { console.warn('[hall] rescue from y=' + pp.y.toFixed(2)); lastRescue = time; world.setAuthoredPlayerPosition(SPAWN.pos); }
      if (!xr) camera.rotation.set(pitch, yaw, 0);
      if (seat && Math.hypot(pp.x - seat.pos.x, pp.z - seat.pos.z) > 0.4) stand();
      const z = zoneOf(pp);
      if (z !== zone) { zone = z; ui.setZone(z); setReflections(reflectionsWanted); }
      sky.update(time, xr ? 2 : 1);
      table.update(time, delta, reduced);
      garden.update(time, reduced);
      libIn.update(time, reduced);
      if (!reduced) {
        const f = 0.92 + Math.sin(time * 1.7) * 0.04 + Math.sin(time * 5.3) * 0.02;
        for (const g of glows) g.material.opacity = (g.userData.base ??= g.material.opacity) * f;
      }
      // lights: only the chamber you're in (plus the walk) stays lit in a headset
      if (xr) for (const l of allLights) l.visible = (hall.lights.includes(l as any) && zone === 'hall') || (lib.lights.includes(l as any) && zone === 'library') || colonnade.lights.includes(l as any);
      // presence
      camera.getWorldQuaternion(tmpQ); fwd.set(0, 0, -1).applyQuaternion(tmpQ);
      presence.tick(pp, Math.atan2(fwd.x, fwd.z), performance.now());
      if (presence.connected) {
        presence.smooth(delta);
        speaking = voice ? voice.speaking : sim ? new Set(sim.speakingIds(time)) : speaking;
        avatars.update(presence.peers, pp, camera, delta, time, speaking);
        if (voice) {
          voice.updatePanners(camera, presence.peers);
          if (time - lastSubs > 0.5) { lastSubs = time; voice.updateSubscriptions({ x: pp.x, z: pp.z, zone: presence.self.zone }, presence.peers, presence.blocked); }
        }
      } else if (avatars.group.children.length) avatars.update(new Map(), pp, camera, delta, time, speaking);
      inter.update();
    }
  }
  world.registerSystem(HallSystem);

  world.setAuthoredPlayerPosition(SPAWN.pos);
  setTimeout(() => world.setAuthoredPlayerPosition(SPAWN.pos), 600);
  await step(1, 'Welcome to the Guild Hall');
  document.getElementById('loading')!.classList.add('done');
  (window as any).__xrgh = { THREE, world, goTo, setView: (y: number, p: number) => { yaw = y; pitch = p; }, TABLE_TOP, presence, seating, sitAt, zone: () => zone };
}

main().catch(err => {
  console.error(err);
  const msg = document.getElementById('loadMsg');
  if (msg) msg.textContent = 'The hall could not open in this browser. WebGL 2 is required. ' + (err?.message ?? '');
});
