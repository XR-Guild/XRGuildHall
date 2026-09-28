import * as THREE from 'three';
import QRCode from 'qrcode';
import type { Mats } from './mats';
import * as T from './tex';
import { CanvasPanel, INK, type Fonts } from './panel';
import { STAGE, DESK, BOARD } from './site';
import EVENTS from './data/events.json';

export const LINKS = {
  join: 'https://www.xrguild.org/join',
  home: 'https://www.xrguild.org',
  calendar: 'https://www.xrguild.org/calendar',
  principles: 'https://www.xrguild.org/principles',
  mentorship: 'https://www.xrguild.org/mentorship',
};
export const TAGLINE = 'Professionals working in Spatial Computing dedicated to ethical outcomes in XR, AI, and the Metaverse.';

/** Round walnut stage with gilt Nouveau detailing; a gentle stepped edge all round (one continuous walkable slope for locomotion). */
export function buildStage(m: Mats) {
  const group = new THREE.Group(); group.name = 'Stage'; group.position.copy(STAGE.center);
  const colliders = new THREE.Group(); colliders.position.copy(STAGE.center);
  const R = STAGE.r, H = STAGE.h;
  const deckMat = m.walnut.clone(); deckMat.map = m.walnut.map!.clone(); deckMat.map.repeat.set(3, 3); deckMat.map.needsUpdate = true;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 72), [m.walnutDark, deckMat, m.walnutDark]); deck.position.y = H / 2; group.add(deck);
  // two step rings
  for (const [r, h] of [[R + 0.36, H * 0.66], [R + 0.72, H * 0.33]] as const) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 72), [m.walnut, m.walnut, m.walnut]); st.position.y = h / 2; group.add(st);
    const nose = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 6, 96), m.gilt); nose.rotation.x = Math.PI / 2; nose.position.y = h; group.add(nose);
  }
  // gilt rim and inlaid compass rose on the deck
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.02, 0.035, 8, 120), m.gilt); rim.rotation.x = Math.PI / 2; rim.position.y = H; group.add(rim);
  const inlay = new THREE.Mesh(new THREE.RingGeometry(R * 0.55, R * 0.57, 96), m.gilt); inlay.rotation.x = -Math.PI / 2; inlay.position.y = H + 0.003; group.add(inlay);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 14; k++) { const u = k / 14; const r = R * 0.57 + u * R * 0.33; pts.push(new THREE.Vector3(Math.cos(a + Math.sin(u * Math.PI) * 0.22) * r, H + 0.004, Math.sin(a + Math.sin(u * Math.PI) * 0.22) * r)); }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 5), m.gilt));
  }
  const heart = new THREE.Mesh(new THREE.CircleGeometry(R * 0.2, 48), m.labradorite); heart.rotation.x = -Math.PI / 2; heart.position.y = H + 0.004; group.add(heart);
  // whiplash scrolls on the fascia
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2; const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) { const u = k / 10; const aa = a + u * 0.32; pts.push(new THREE.Vector3(Math.cos(aa) * (R + 0.012), H * (0.2 + 0.6 * Math.sin(u * Math.PI)), Math.sin(aa) * (R + 0.012))); }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 5), m.gilt));
  }
  // walkable collider: a shallow cone frustum so feet glide up the steps
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.75, H, 48), new THREE.MeshBasicMaterial()); cone.position.y = H / 2; colliders.add(cone);
  // stage lighting
  const spot = new THREE.SpotLight(0xfff0d8, 200, 26, 0.42, 0.55, 1.6); spot.position.set(0, 11.5, 7.5); spot.target.position.set(0, 0.4, 0); group.add(spot, spot.target);
  const glowTex = T.glow('255,236,200');
  const pool = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff2d6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.12 }));
  pool.scale.set(R * 2.6, R * 2.6, 1); pool.position.y = H + 0.6; group.add(pool);
  return { group, colliders, light: spot };
}

/** A curved welcome desk with the Join panel, a QR code, and an xrguild.org plaque. */
export function buildWelcomeDesk(m: Mats, fonts: Fonts, onLink: (url: string) => void, isXR: () => boolean) {
  const group = new THREE.Group(); group.name = 'WelcomeDesk'; group.userData.keep = true;
  group.position.copy(DESK.pos); group.lookAt(DESK.faceTo.x, 0, DESK.faceTo.z);
  const colliders = new THREE.Group();
  // desk body: an arc of walnut with a labradorite top
  const arc = (r0: number, r1: number, a0: number, a1: number) => { const s = new THREE.Shape(); s.absarc(0, 0, r1, a0, a1, false); s.absarc(0, 0, r0, a1, a0, true); return s; };
  const a0 = Math.PI * 1.25, a1 = Math.PI * 1.75; // front of the arc bulges toward visitors (+z)
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(arc(1.35, 1.75, a0, a1), { depth: 1.0, bevelEnabled: false, curveSegments: 32 }), m.walnut);
  body.rotation.x = -Math.PI / 2; body.position.set(0, 0, -1.55); group.add(body);
  const top = new THREE.Mesh(new THREE.ExtrudeGeometry(arc(1.3, 1.82, a0 - 0.04, a1 + 0.04), { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 32 }), m.labradorite);
  top.rotation.x = -Math.PI / 2; top.position.set(0, 1.0, -1.55); group.add(top);
  for (const [r, y] of [[1.82, 1.03], [1.76, 0.12], [1.76, 0.62]] as const) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 6, 64, a1 - a0 + 0.08), m.gilt); t.rotation.x = Math.PI / 2; t.rotation.z = Math.PI * 0.25 - 0.04; t.position.set(0, y, -1.55); group.add(t);
  }
  // plaque on the desk front: xrguild.org
  const plaqueTex = T.labelTexture([{ text: 'Visit xrguild.org', font: `64px ${fonts.display}`, color: '#f1d58f' }, { text: 'Join · Events · Mentorship · Principles', font: `30px ${fonts.body}`, color: '#cfe9e2' }], 900, 220, 'rgba(8,24,22,0.95)', '#d8ae5a');
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.29), new THREE.MeshBasicMaterial({ map: plaqueTex, toneMapped: false }));
  plaque.position.set(0, 0.6, 0.215); group.add(plaque);
  const plaqueHit = plaque;
  // collider for the desk
  const c = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 0.6), new THREE.MeshBasicMaterial()); c.position.set(0, 0.6, 0);
  group.updateMatrixWorld(true); c.applyMatrix4(group.matrixWorld); colliders.add(c);

  // Join panel, upright behind the desk
  const qr = QRCode.create(LINKS.join, { errorCorrectionLevel: 'M' });
  let note = '';
  const open = (url: string) => { if (isXR()) { note = 'Scan the code with your phone, or leave VR and select again.'; } else { note = ''; onLink(url); } };
  const panel = new CanvasPanel(1.5, 1.2, 760, p => {
    const g = p.ctx, W = p.W, H = p.H;
    p.bg();
    p.text('WELCOME TO THE XR GUILD HALL', 64, 58, { font: `600 22px ${fonts.mono}`, color: INK.teal });
    p.text('Join the Guild', 64, 92, { font: `78px ${fonts.display}`, color: INK.goldHi });
    let y = 190;
    y += p.wrap(TAGLINE, 64, y, W * 0.58 - 64, 34, { font: `28px ${fonts.body}`, color: INK.text });
    y += 18;
    const bw = W * 0.58 - 64;
    p.button('join', 64, y, bw, 76, 'Join the XR Guild', () => open(LINKS.join), { active: true, font: `600 32px ${fonts.body}` }); y += 92;
    const hw = (bw - 14) / 2;
    p.button('home', 64, y, hw, 58, 'xrguild.org', () => open(LINKS.home)); p.button('cal', 64 + hw + 14, y, hw, 58, 'Events', () => open(LINKS.calendar)); y += 72;
    p.button('men', 64, y, hw, 58, 'Mentorship', () => open(LINKS.mentorship)); p.button('pri', 64 + hw + 14, y, hw, 58, 'Principles', () => open(LINKS.principles));
    // QR code
    const qs = qr.modules.size, box = Math.min(W * 0.34, H - 250), cell = Math.floor(box / (qs + 4)), qx = W - 64 - cell * (qs + 4), qy = 170;
    g.fillStyle = '#f4efe2'; g.beginPath(); g.roundRect(qx, qy, cell * (qs + 4), cell * (qs + 4), 12); g.fill();
    g.fillStyle = '#0b1917';
    for (let r = 0; r < qs; r++) for (let cc = 0; cc < qs; cc++) if (qr.modules.get(r, cc)) g.fillRect(qx + (cc + 2) * cell, qy + (r + 2) * cell, cell, cell);
    p.text('Scan to join', qx + cell * (qs + 4) / 2, qy + cell * (qs + 4) + 16, { font: `600 24px ${fonts.body}`, color: INK.goldHi, align: 'center' });
    p.text('xrguild.org/join', qx + cell * (qs + 4) / 2, qy + cell * (qs + 4) + 50, { font: `22px ${fonts.mono}`, color: INK.teal, align: 'center' });
    if (note) p.wrap(note, 64, H - 92, W - 128, 28, { font: `italic 24px ${fonts.body}`, color: INK.amber, maxLines: 2 });
    else p.text('Links open in a new tab. Nothing is sent from this world.', 64, H - 76, { font: `22px ${fonts.body}`, color: INK.dim });
  });
  panel.fonts = fonts;
  const frame = new THREE.Group(); frame.position.set(0, 0, -0.55); group.add(frame);
  const fr = new THREE.Mesh(new THREE.BoxGeometry(1.64, 1.34, 0.06), m.walnut); fr.position.set(0, 1.78, -0.04); frame.add(fr);
  const crest: THREE.Vector3[] = []; for (let i = 0; i <= 24; i++) { const x = -0.82 + (i / 24) * 1.64; crest.push(new THREE.Vector3(x, 2.47 + Math.sin((i / 24) * Math.PI) * 0.24, 0)); }
  frame.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(crest), 48, 0.03, 8), m.gilt));
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), m.emissiveCyan); orb.position.set(0, 2.78, 0); frame.add(orb);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 2.45, 12), m.walnut); leg.position.set(s * 0.74, 1.22, -0.08); frame.add(leg); }
  panel.mesh.position.set(0, 1.78, 0.0); frame.add(panel.mesh);
  panel.draw();
  const light = new THREE.PointLight(0xffd7a0, 8, 5, 2); light.position.set(0, 2.4, 0.8); group.add(light);
  return { group, colliders, panel, plaque: plaqueHit };
}

type Ev = { id: string; title: string; start: string; end: string; allDay: boolean; location: string | null; description: string | null; eventUrl: string | null };

/** Events + news board beside the desk: upcoming Guild events (snapshot) and a Connect 2026 poster. */
export function buildEventsBoard(m: Mats, fonts: Fonts, onLink: (url: string) => void, onNews: () => void, isXR: () => boolean) {
  const group = new THREE.Group(); group.name = 'EventsBoard'; group.userData.keep = true;
  group.position.copy(BOARD.pos); group.lookAt(BOARD.faceTo.x, 0, BOARD.faceTo.z);
  const now = Date.now();
  const events = (EVENTS.events as Ev[]).filter(e => Date.parse(e.end || e.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const local = d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const pt = d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
    return `${local} (your time) · ${pt} PT`;
  };
  let note = '';
  const open = (url: string) => { if (isXR()) note = 'Leave VR to open links, or see xrguild.org/calendar later.'; else { note = ''; onLink(url); } };
  const panel = new CanvasPanel(1.3, 1.75, 800, p => {
    const W = p.W, H = p.H, g = p.ctx;
    p.bg();
    p.text('GUILD NOTICE BOARD', 64, 58, { font: `600 22px ${fonts.mono}`, color: INK.teal });
    p.text('Upcoming', 64, 92, { font: `66px ${fonts.display}`, color: INK.goldHi });
    let y = 186;
    if (!events.length) { y += p.wrap('No upcoming events in this snapshot. The live calendar is at xrguild.org/calendar.', 64, y, W - 128, 34, { font: `28px ${fonts.body}`, color: INK.dim }); }
    for (const e of events.slice(0, 3)) {
      g.beginPath(); g.roundRect(56, y - 10, W - 112, 10, 0);
      p.text(fmt(e.start), 64, y, { font: `600 22px ${fonts.mono}`, color: INK.gold }); y += 36;
      y += p.wrap(e.title, 64, y, W - 128, 42, { font: `36px ${fonts.display}`, color: INK.text, maxLines: 2 }) + 4;
      if (e.location) { p.text(e.location, 64, y, { font: `24px ${fonts.body}`, color: INK.teal }); y += 34; }
      if (e.description) y += p.wrap(e.description.replace(/\s+/g, ' '), 64, y, W - 128, 30, { font: `24px ${fonts.body}`, color: INK.dim, maxLines: 4 });
      y += 22; p.rule(64, y - 10, W - 128, 'rgba(216,174,90,0.25)'); y += 10;
    }
    p.button('cal', 64, y, W - 128, 60, 'Full calendar at xrguild.org/calendar', () => open(LINKS.calendar)); y += 92;
    // Connect poster
    const ph = 330, py = Math.max(y, H - ph - 150);
    const grd = g.createLinearGradient(0, py, 0, py + ph); grd.addColorStop(0, '#1b1440'); grd.addColorStop(1, '#0c2b2a');
    g.fillStyle = grd; g.beginPath(); g.roundRect(64, py, W - 128, ph, 18); g.fill(); g.strokeStyle = INK.violet; g.lineWidth = 3; g.stroke();
    p.text('NEWS · META CONNECT 2026', 92, py + 28, { font: `600 22px ${fonts.mono}`, color: INK.violet });
    p.text('Meta VR Glasses', 92, py + 64, { font: `54px ${fonts.display}`, color: INK.goldHi });
    p.wrap('Sourced specs, open questions and talking points for builders. On the News shelf in the Library.', 92, py + 136, W - 184, 32, { font: `26px ${fonts.body}`, color: INK.text, maxLines: 3 });
    p.button('news', 92, py + ph - 88, W - 184, 62, 'Walk to the Library', onNews, { accent: INK.violet });
    p.text(`Events snapshot ${EVENTS.fetched}.`, 64, H - 110, { font: `22px ${fonts.body}`, color: INK.dim });
    if (note) p.wrap(note, 64, H - 80, W - 128, 26, { font: `italic 22px ${fonts.body}`, color: INK.amber, maxLines: 1 });
  });
  panel.fonts = fonts;
  const fr = new THREE.Mesh(new THREE.BoxGeometry(1.44, 1.9, 0.06), m.walnut); fr.position.set(0, 1.55, -0.04); group.add(fr);
  const crest: THREE.Vector3[] = []; for (let i = 0; i <= 20; i++) { const cx = -0.72 + (i / 20) * 1.44; crest.push(new THREE.Vector3(cx, 2.52 + Math.sin((i / 20) * Math.PI) * 0.2, 0)); }
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(crest), 48, 0.025, 8), m.gilt));
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 2.5, 12), m.walnut); leg.position.set(s * 0.56, 1.25, -0.1); group.add(leg); }
  panel.mesh.position.set(0, 1.55, 0); group.add(panel.mesh); panel.draw();
  return { group, panel };
}

/** Banner for the hall's north bay behind the stage: the Guild's mission line and its web address. */
export function bannerTexture(fonts: Fonts) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1400; const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 1400); grd.addColorStop(0, '#0f2a25'); grd.addColorStop(1, '#07130f'); g.fillStyle = grd; g.fillRect(0, 0, 1024, 1400);
  g.strokeStyle = '#d8ae5a'; g.lineWidth = 10; g.strokeRect(24, 24, 976, 1352); g.lineWidth = 3; g.strokeRect(48, 48, 928, 1304);
  // simple Guild mark: a gilt ring with a labradorite-teal lens (a mark drawn for this world, not the official logo file)
  g.strokeStyle = '#e7c575'; g.lineWidth = 14; g.beginPath(); g.arc(512, 330, 150, 0, Math.PI * 2); g.stroke();
  const lens = g.createRadialGradient(470, 290, 20, 512, 330, 130); lens.addColorStop(0, '#9ff6e6'); lens.addColorStop(0.5, '#2f8f86'); lens.addColorStop(1, '#193a4a');
  g.fillStyle = lens; g.beginPath(); g.ellipse(512, 330, 120, 62, 0, 0, Math.PI * 2); g.fill();
  g.textAlign = 'center'; g.fillStyle = '#f1d58f'; g.font = `120px ${fonts.display}`; g.fillText('XR GUILD', 512, 620);
  g.fillStyle = '#e9e1cc'; g.font = `44px ${fonts.body}`;
  const words = TAGLINE.split(' '); let line = '', y = 720;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > 820) { g.fillText(line, 512, y); y += 60; line = w; } else line = t; }
  g.fillText(line, 512, y);
  g.fillStyle = '#5fe0c6'; g.font = `600 58px ${fonts.mono}`; g.fillText('xrguild.org', 512, 1180);
  g.fillStyle = '#a9b3a9'; g.font = `34px ${fonts.body}`; g.fillText('Join us at xrguild.org/join', 512, 1260);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
