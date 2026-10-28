import * as THREE from 'three';
import { InputComponent, type World } from '@iwsdk/core';
import { CanvasPanel, INK, type Fonts } from './panel';
import type { Interactor } from './interact';
import type { Presence } from './net/presence';
import type { Social } from './social';

type View = 'home' | 'chat' | 'people' | 'join';
type Hand = 'left' | 'right';

const KEY_ROWS = ['1234567890', 'qwertyuiop', "asdfghjkl'", 'zxcvbnm,.?'];
const QUICK = ['Hello!', 'Can you hear me?', 'Thanks!', 'Be right back'];
const PER_PAGE = 6;
const M = 44;
/** Where the gold "Y" disc sits on the hint canvas, so it can be hung directly over the real button. */
/** Fingertip depth (m, along the panel normal) that counts as a press, and how far back it must go to press again. */
const POKE_PRESS = 0.005, POKE_REARM = 0.02, POKE_NEAR = 0.06, POKE_BEHIND = -0.04;
const WRIST_OFFSET = new THREE.Vector3(0, 0.03, 0.01);
const hintDisc = (H: number) => { const r = H * 0.3; return { r, cx: 14 + r + 10 }; };

/**
 * The 2D social dock, rebuilt as a panel for headsets, where the DOM overlay can't be seen.
 * It rides on the player rig so it follows locomotion; the left controller's Y button
 * (or the wrist tag, for hands) shows and hides it.
 */
export class XRMenu {
  readonly group = new THREE.Group();
  readonly panel: CanvasPanel;
  readonly hint: CanvasPanel;
  private view: View = 'home';
  private draft = '';
  private name = '';
  private editingName = false;
  private agreed = false;
  private shift = false;
  private page = 0;
  private seenLines = 0;
  private lastUnread = 0;
  private placed = false;
  private drag: { hand: Hand; dist: number } | null = null;
  private dirty = true;
  private leftIsHand = false;
  private yButton: THREE.Object3D | null = null;
  private pokeArmed: Record<Hand, boolean> = { left: true, right: true };
  private poked: Record<Hand, CanvasPanel | null> = { left: null, right: null };
  private v3 = new THREE.Vector3();
  private head = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private tmp = new THREE.Vector3();
  /** The hint mesh is offset so its Y disc sits on the button; hands have no disc, so their tag is re-centred. */
  private discShift = 0;

  constructor(private world: World, private inter: Interactor, private P: Presence, private S: Social, fonts: Fonts) {
    this.panel = new CanvasPanel(0.6, 0.6, 1500, p => this.render(p));
    this.panel.fonts = fonts;
    this.prepOverlay(this.panel.mesh, 997);
    this.group.add(this.panel.mesh);
    this.group.visible = false;
    world.player.add(this.group);
    inter.addPanel(this.panel, undefined, {
      enabled: () => this.group.visible,
      overlay: true,
      onPress: (hit, hand) => { if (hit.uv && this.panel.regionAt(hit.uv)?.id === 'handle') this.drag = { hand, dist: hit.distance }; },
    });

    this.hint = new CanvasPanel(0.085, 0.03, 4200, p => this.renderHint(p));
    this.hint.fonts = fonts;
    this.prepOverlay(this.hint.mesh, 996);
    (this.hint.mesh.material as THREE.MeshBasicMaterial).transparent = true;
    this.discShift = (hintDisc(this.hint.H).cx / this.hint.W - 0.5) * this.hint.widthM;
    this.hint.mesh.geometry.translate(-this.discShift, 0, 0);
    this.hint.mesh.visible = false;
    world.player.add(this.hint.mesh);
    inter.add(this.hint.mesh, { enabled: () => this.hint.mesh.visible, overlay: true, onClick: () => this.toggle() });

    S.listeners.add(() => { this.dirty = true; });
  }

  private prepOverlay(mesh: THREE.Mesh, order: number) {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.depthTest = false; mat.side = THREE.DoubleSide;
    mesh.renderOrder = order;
  }

  get open() { return this.group.visible; }

  toggle() { if (this.open) this.close(); else this.show(); }

  show() {
    this.world.player.head.getWorldPosition(this.head);
    const p = this.group.getWorldPosition(this.v3);
    const toPanel = p.sub(this.head);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.world.player.head.getWorldQuaternion(new THREE.Quaternion()));
    // keep a spot the person chose, unless they've since walked or turned away from it
    if (!this.placed || toPanel.length() > 1.5 || toPanel.normalize().dot(fwd) < 0.35) this.place();
    if (!this.P.connected && this.view !== 'join') this.view = 'home';
    this.group.visible = true;
    this.dirty = true;
    this.hint.draw();
  }

  close() {
    this.group.visible = false; this.drag = null;
    this.editingName = false;
    this.hint.draw();
  }

  /** In front of the eyes, a little low, facing the head. */
  private place() {
    const h = this.world.player.head;
    h.getWorldPosition(this.head);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(h.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const target = this.head.clone().addScaledVector(fwd, 0.6).add(new THREE.Vector3(0, -0.15, 0));
    this.setWorld(target);
    this.placed = true;
  }

  private setWorld(target: THREE.Vector3) {
    this.group.position.copy(this.world.player.worldToLocal(target.clone()));
    this.group.updateMatrixWorld();
    this.group.lookAt(this.head);
  }

  /** Returns true if this hand was dragging, so the release isn't also a click on whatever is behind. */
  endDrag(hand: Hand) {
    if (this.drag?.hand !== hand) return false;
    this.drag = null; return true;
  }

  sessionStart() { this.hint.mesh.visible = true; this.hint.draw(); }
  sessionEnd() { this.close(); this.hint.mesh.visible = false; }

  update() {
    const session = this.world.session;
    if (!session) return;
    const left = [...session.inputSources].find(s => s.handedness === 'left');
    this.hint.mesh.visible = !!left;
    const isHand = !!left?.hand;
    if (isHand !== this.leftIsHand) { this.leftIsHand = isHand; this.hint.draw(); }
    if (left) this.placeHint(left);
    this.poke(session);
    if (this.world.input.xr.gamepads.left?.getButtonDown(InputComponent.Y_Button)) this.toggle();

    if (this.drag) {
      const s = this.world.player.raySpaces[this.drag.hand];
      s.updateMatrixWorld();
      const o = new THREE.Vector3().setFromMatrixPosition(s.matrixWorld);
      const d = new THREE.Vector3(0, 0, -1).transformDirection(s.matrixWorld);
      this.world.player.head.getWorldPosition(this.head);
      this.setWorld(o.addScaledVector(d, this.drag.dist));
    }
    const unread = this.unread();
    if (this.view === 'chat') this.seenLines = this.S.lines.length;
    else if (unread !== this.lastUnread) this.dirty = true;
    this.lastUnread = unread;
    if (this.dirty && this.open) { this.dirty = false; this.panel.draw(); }
  }

  /** Over the Y button of the controller model, or like a watch face over the back of the wrist; turned to the eyes so it stays readable. */
  private placeHint(left: XRInputSource) {
    const pl = this.world.player;
    const wrist = left.hand?.get('wrist');
    const frame = this.world.xrFrame, ref = this.world.xrReferenceSpace;
    const pose = wrist && frame && ref ? frame.getJointPose?.(wrist, ref) : null;
    if (pose) {
      // joint poses are in the rig's space; the tag goes on whichever face of the wrist is turned toward the eyes,
      // so it stays in front of the arm and reachable however the wrist is rotated
      const { position: p, orientation: q } = pose.transform;
      this.q.set(q.x, q.y, q.z, q.w);
      const eye = pl.head.getWorldPosition(new THREE.Vector3());
      let best = Infinity;
      for (const side of [1, -1]) {
        const c = pl.localToWorld(this.tmp.copy(WRIST_OFFSET).setY(WRIST_OFFSET.y * side).applyQuaternion(this.q).add(this.head.set(p.x, p.y, p.z)));
        const d = c.distanceToSquared(eye);
        if (d < best) { best = d; this.v3.copy(c); }
      }
    } else {
      if (!this.leftIsHand && !this.attached(this.yButton)) this.yButton = pl.gripSpaces.left.getObjectByName('y_button') ?? pl.getObjectByName('y_button') ?? null;
      const anchor = !this.leftIsHand && this.yButton ? this.yButton : pl.gripSpaces.left;
      anchor.getWorldPosition(this.v3).y += anchor === this.yButton ? 0.02 : 0.06;
    }
    pl.head.getWorldPosition(this.head);
    this.hint.mesh.position.copy(pl.worldToLocal(this.v3));
    this.hint.mesh.lookAt(this.head);
    if (this.leftIsHand) this.hint.mesh.translateX(this.discShift);
  }

  /** Tracked hands can press the panel and wrist tag directly with the index fingertip. */
  private poke(session: XRSession) {
    for (const hand of ['left', 'right'] as const) {
      const src = [...session.inputSources].find(s => s.handedness === hand);
      let near: CanvasPanel | null = null;
      if (src?.hand) {
        const tip = this.world.player.indexTipSpaces[hand].getWorldPosition(this.v3);
        // the wrist tag rides on the left hand, so only the right finger can reach it
        const targets = [this.open && this.panel, hand === 'right' && this.leftIsHand && this.hint.mesh.visible && this.hint];
        for (const p of targets) {
          if (!p) continue;
          const hit = this.touch(p, tip);
          if (!hit) continue;
          near = p;
          p.setHover(hit.uv);
          if (this.pokeArmed[hand] && hit.z < POKE_PRESS) { this.pokeArmed[hand] = false; p.click(hit.uv); }
          else if (hit.z > POKE_REARM) this.pokeArmed[hand] = true;
          break;
        }
      }
      if (!near) this.pokeArmed[hand] = true;
      if (this.poked[hand] && this.poked[hand] !== near) this.poked[hand]!.setHover(null);
      this.poked[hand] = near;
      this.inter.rayOff[hand] = !!near;
    }
  }

  /** Fingertip in panel space: where on the panel it is and how far in front, when it's over the panel and close. */
  private touch(p: CanvasPanel, worldTip: THREE.Vector3) {
    const g = p.mesh.geometry;
    const b = g.boundingBox ?? (g.computeBoundingBox(), g.boundingBox!);
    const l = p.mesh.worldToLocal(worldTip.clone());
    if (l.z > POKE_NEAR || l.z < POKE_BEHIND || l.x < b.min.x || l.x > b.max.x || l.y < b.min.y || l.y > b.max.y) return null;
    return { z: l.z, uv: new THREE.Vector2((l.x - b.min.x) / (b.max.x - b.min.x), (l.y - b.min.y) / (b.max.y - b.min.y)) };
  }

  private attached(o: THREE.Object3D | null) {
    for (let p = o; p; p = p.parent) if (p === this.world.player) return true;
    return false;
  }

  private unread() {
    let n = 0;
    for (let i = this.seenLines; i < this.S.lines.length; i++) { const l = this.S.lines[i]; if (!l.sys && !l.me) n++; }
    return n;
  }

  // ---------- drawing ----------
  private renderHint(p: CanvasPanel) {
    const g = p.ctx, W = p.W, H = p.H, f = p.fonts;
    g.clearRect(0, 0, W, H);
    g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, (H - 8) / 2);
    g.fillStyle = 'rgba(11,25,23,0.92)'; g.fill();
    g.lineWidth = 4; g.strokeStyle = INK.gold; g.stroke();
    const label = this.open ? 'Hide menu' : 'Menu';
    if (this.leftIsHand) {
      p.text('☰ ' + label, W / 2, H / 2 + 2, { font: `600 ${Math.round(H * 0.36)}px ${f.body}`, align: 'center', baseline: 'middle' });
    } else {
      const { r, cx } = hintDisc(H);
      g.beginPath(); g.arc(cx, H / 2, r, 0, Math.PI * 2); g.fillStyle = INK.gold; g.fill();
      p.text('Y', cx, H / 2 + 2, { font: `700 ${Math.round(r * 1.25)}px ${f.body}`, color: INK.bg, align: 'center', baseline: 'middle' });
      p.text(label, cx + r + 16, H / 2 + 2, { font: `600 ${Math.round(H * 0.36)}px ${f.body}`, baseline: 'middle' });
    }
    p.regions.push({ x: 0, y: 0, w: W, h: H, id: 'toggle', onClick: () => this.toggle() });
  }

  private render(p: CanvasPanel) {
    const g = p.ctx, W = p.W, f = p.fonts, S = this.S, c = this.P.connected;
    p.bg();
    // move handle
    const hw = W - 2 * M - 96;
    const hov = p.hover === 'handle' || !!this.drag;
    g.beginPath(); g.roundRect(M, 40, hw, 62, 31);
    g.fillStyle = hov ? INK.hover : 'rgba(255,255,255,0.05)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = hov ? INK.teal : INK.line; g.stroke();
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(M + 30 + i * 12, 60 + j * 22, 3.5, 0, Math.PI * 2); g.fillStyle = INK.gold; g.fill(); }
    p.text('Guild Hall', M + 120, 71, { font: `34px ${f.display}`, color: INK.goldHi, baseline: 'middle' });
    p.text(this.drag ? 'Moving…' : 'Drag here to move', M + hw - 24, 73, { font: `22px ${f.body}`, color: INK.dim, align: 'right', baseline: 'middle' });
    p.regions.push({ x: M, y: 40, w: hw, h: 62, id: 'handle', onClick: () => {} });
    p.button('close', W - M - 80, 40, 80, 62, '✕', () => this.close());

    p.text(this.P.status + (c ? ' · ' + (this.P.peers.size + 1) + ' here' : ''), M, 122, { font: `24px ${f.mono}`, color: INK.dim });

    // dock row: the same controls as the 2D dock, plus Exit VR
    const v = S.voice();
    const unread = this.unread();
    const items: [string, string, () => void, boolean?][] = [['exit', 'Exit VR', () => this.world.exitXR()]];
    if (c) items.push(['leave', 'Leave', () => { S.leave(); this.view = 'home'; }]);
    else items.push(['join', S.joining ? 'Joining…' : S.joinLabel, () => { if (!S.joining) this.openJoin(); }, this.view === 'join']);
    if (c && v) items.push(['mic', S.micBusy ? 'Mic…' : v.micOn ? 'Mic on' : 'Mic off', () => { S.toggleMic(); }, v.micOn]);
    if (c && v && this.P.self.onStage) items.push(['mega', 'Megaphone', () => S.toggleMegaphone(), this.P.self.megaphone]);
    if (c) items.push(['chat', 'Chat' + (unread && this.view !== 'chat' ? ` (${unread})` : ''), () => this.go('chat'), this.view === 'chat']);
    if (c) items.push(['people', `People ${this.P.peers.size + 1}`, () => { this.page = 0; this.go('people'); }, this.view === 'people']);
    const bw = (W - 2 * M - (items.length - 1) * 12) / items.length;
    const font = items.length > 5 ? `600 24px ${f.body}` : undefined;
    items.forEach(([id, label, fn, active], i) => p.button(id, M + i * (bw + 12), 162, bw, 70, label, fn, { active, font }));

    const y0 = 256;
    if (this.view === 'chat' && c) this.renderChat(p, y0);
    else if (this.view === 'people' && c) this.renderPeople(p, y0);
    else if (this.view === 'join' && !c) this.renderJoin(p, y0);
    else this.renderHome(p, y0);
  }

  private go(view: View) { this.view = this.view === view ? 'home' : view; }

  private openJoin() {
    this.view = 'join'; this.agreed = false; this.editingName = false;
    this.name = this.S.defaultName();
  }

  private renderHome(p: CanvasPanel, y: number) {
    const f = p.fonts, W = p.W;
    const tip = this.leftIsHand ? 'Tap the Menu tag on your left wrist with your right finger to hide or show this panel. Tap buttons directly, or point and pinch.' : 'Press Y on your left controller to hide or show this panel.';
    y += p.wrap(tip + ' Pinch and drag the bar at the top to move it.', M, y, W - 2 * M, 38, { font: `29px ${f.body}`, color: INK.text }) + 24;
    const recent = this.S.lines.slice(-6);
    if (recent.length) {
      p.rule(M, y, W - 2 * M); y += 22;
      this.drawLines(p, recent, y, 6);
    }
  }

  private drawLines(p: CanvasPanel, lines: Social['lines'], y: number, max: number) {
    const f = p.fonts, W = p.W, g = p.ctx;
    for (const l of lines.slice(-max)) {
      if (l.sys) { p.wrap(l.text, M, y, W - 2 * M, 30, { font: `italic 24px ${f.body}`, color: INK.dim, maxLines: 1 }); }
      else {
        g.font = `700 25px ${f.body}`; const nw = g.measureText(l.name).width + 12;
        p.text(l.name, M, y, { font: `700 25px ${f.body}`, color: l.me ? INK.teal : INK.gold });
        p.wrap(l.text, M + nw, y, W - 2 * M - nw, 30, { font: `25px ${f.body}`, maxLines: 1 });
      }
      y += 31;
    }
  }

  private renderChat(p: CanvasPanel, y: number) {
    const W = p.W, f = p.fonts;
    this.drawLines(p, this.S.lines, y, 5);
    y += 5 * 31 + 10;
    const qw = (W - 2 * M - 3 * 10) / 4;
    QUICK.forEach((q, i) => p.button('q' + i, M + i * (qw + 10), y, qw, 48, q, () => this.S.say(q), { font: `24px ${f.body}` }));
    y += 60;
    y = this.field(p, y, this.draft, 'Say something kind…');
    this.keyboard(p, y, k => { this.draft = (this.draft + k).slice(0, 280); }, () => { this.draft = this.draft.slice(0, -1); },
      'Send', () => { if (this.draft.trim()) this.S.say(this.draft); this.draft = ''; });
  }

  private field(p: CanvasPanel, y: number, value: string, placeholder: string) {
    const g = p.ctx, W = p.W, f = p.fonts;
    g.beginPath(); g.roundRect(M, y, W - 2 * M, 56, 16);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK.teal; g.stroke();
    g.font = `28px ${f.body}`;
    let shown = value; while (shown && g.measureText(shown).width > W - 2 * M - 50) shown = shown.slice(1);
    p.text(shown ? shown + '|' : placeholder, M + 20, y + 29, { font: `28px ${f.body}`, color: shown ? INK.text : INK.dim, baseline: 'middle' });
    return y + 68;
  }

  private keyboard(p: CanvasPanel, y: number, type: (k: string) => void, back: () => void, okLabel: string, ok: () => void) {
    const W = p.W, f = p.fonts, gap = 8, kh = 52;
    const kw = (W - 2 * M - 9 * gap) / 10;
    const font = `600 28px ${f.body}`;
    KEY_ROWS.forEach((row, r) => {
      [...row].forEach((ch, i) => {
        const k = this.shift ? ch.toUpperCase() : ch;
        p.button(`k${r}${i}`, M + i * (kw + gap), y, kw, kh, k, () => { type(k); this.shift = false; }, { font });
      });
      y += kh + gap;
    });
    const sw = 110, bw = 110, ow = 150;
    const spw = W - 2 * M - sw - bw - ow - 3 * gap;
    p.button('shift', M, y, sw, kh, '⇧', () => { this.shift = !this.shift; }, { font, active: this.shift });
    p.button('space', M + sw + gap, y, spw, kh, 'space', () => type(' '), { font: `24px ${f.body}` });
    p.button('back', M + sw + spw + 2 * gap, y, bw, kh, '⌫', back, { font });
    p.button('ok', W - M - ow, y, ow, kh, okLabel, ok, { font, active: true });
  }

  private renderPeople(p: CanvasPanel, y: number) {
    const W = p.W, f = p.fonts, S = this.S, v = S.voice();
    const list = [...this.P.peers.values()].sort((a, b) => a.name.localeCompare(b.name));
    const admin = S.canAdmin();
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    const row = (name: string, sub: string) => {
      p.text(name, M, y + 8, { font: `600 28px ${f.body}` });
      p.text(sub, M, y + 42, { font: `20px ${f.mono}`, color: INK.dim });
    };
    row(this.P.self.name + ' (you)', this.P.self.zone + (S.isSpotlit(this.P.self.id) ? ' · spotlit' : '')); y += 74;
    for (const peer of list.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE)) {
      const spot = S.isSpotlit(peer.id);
      row(peer.name, peer.zone + (spot ? ' · spotlit' : peer.megaphone ? ' · megaphone' : peer.onStage ? ' · stage' : ''));
      const bf = { font: `24px ${f.body}` };
      if (admin) p.button('s-' + peer.id, W - M - 426, y + 6, 140, 54, spot ? 'Unspot' : 'Spotlight', () => S.toggleSpotlight(peer.id), bf);
      if (v) p.button('m-' + peer.id, W - M - 278, y + 6, 136, 54, v.localMuted.has(peer.id) ? 'Unmute' : 'Mute', () => S.toggleMute(peer.id), bf);
      p.button('b-' + peer.id, W - M - 130, y + 6, 130, 54, 'Block', () => S.block(peer.id), bf);
      y += 70;
    }
    const by = p.H - M - 60;
    if (pages > 1) {
      p.button('prev', M, by, 150, 54, '‹ Prev', () => { this.page = Math.max(0, this.page - 1); }, { font: `24px ${f.body}` });
      p.text(`${this.page + 1} / ${pages}`, M + 200, by + 28, { font: `24px ${f.mono}`, color: INK.dim, baseline: 'middle' });
      p.button('next', M + 320, by, 150, 54, 'Next ›', () => { this.page = Math.min(pages - 1, this.page + 1); }, { font: `24px ${f.body}` });
    }
    if (this.P.blocked.size) p.button('unblock', W - M - 260, by, 260, 54, `Unblock all (${this.P.blocked.size})`, () => S.unblockAll(), { font: `24px ${f.body}` });
  }

  private renderJoin(p: CanvasPanel, y: number) {
    const W = p.W, f = p.fonts;
    if (this.editingName) {
      p.text('Display name', M, y, { font: `600 24px ${f.mono}`, color: INK.gold }); y += 40;
      y = this.field(p, y, this.name, 'Your name');
      this.keyboard(p, y + 10, k => { this.name = (this.name + k).slice(0, 32); }, () => { this.name = this.name.slice(0, -1); },
        'Done', () => { this.editingName = false; });
      return;
    }
    p.text('CODE OF CONDUCT', M, y, { font: `600 24px ${f.mono}`, color: INK.gold }); y += 40;
    // the 2D consent dialog is the single source for this text
    const rules = [...document.querySelectorAll('#coc li')].map(li => li.textContent!.replace(/\s+/g, ' ').replace(' ↗', '').trim());
    for (const r of rules) y += p.wrap('· ' + r, M, y, W - 2 * M, 30, { font: `23px ${f.body}`, maxLines: 3 }) + 6;
    y = Math.max(y + 8, p.H - M - 230);
    p.text('Name', M, y + 28, { font: `600 24px ${f.mono}`, color: INK.gold, baseline: 'middle' });
    p.button('name', M + 100, y, W - 2 * M - 100, 56, this.name || 'Tap to set your name', () => { this.editingName = true; }, { font: `26px ${f.body}` });
    y += 72;
    p.button('agree', M, y, W - 2 * M, 56, (this.agreed ? '☑ ' : '☐ ') + 'I agree to the code of conduct', () => { this.agreed = !this.agreed; }, { active: this.agreed, font: `26px ${f.body}` });
    y += 72;
    const bw = (W - 2 * M - 12) / 2;
    if (this.agreed && this.name.trim()) p.button('go', M, y, bw, 60, 'Join', () => { this.view = 'home'; this.S.join(this.name); }, { active: true });
    else p.text(this.name.trim() ? 'Agree to join' : 'Set a name to join', M + bw / 2, y + 30, { font: `26px ${f.body}`, color: INK.dim, align: 'center', baseline: 'middle' });
    p.button('solo', M + bw + 12, y, bw, 60, 'Stay solo', () => { this.view = 'home'; });
  }
}
