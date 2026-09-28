import * as THREE from 'three';
import { zoneOf, STAGE, type Zone } from '../site';
import type { PeerState, ChatMsg, Control, Transport } from './types';
import { PALETTE } from './types';

export interface Peer extends PeerState {
  /** smoothed render position */
  rp: THREE.Vector3; rry: number; speed: number; lastSeen: number;
  speaking: boolean; bubble: { text: string; until: number } | null;
}

const rid = () => Math.random().toString(36).slice(2, 10);
const clamp = (s: string, n: number) => s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

/**
 * Presence core: owns the local state, rate-limits what we send, smooths what we receive,
 * and applies local safety choices (block, hide) before anything reaches the renderer.
 */
export class Presence {
  self: PeerState;
  peers = new Map<string, Peer>();
  blocked = new Set<string>();
  chat: ChatMsg[] = [];
  transport: Transport | null = null;
  status = 'Solo';
  listeners = new Set<() => void>();
  onControl: ((c: Control, from: string) => void) | null = null;
  private lastSend = 0; private lastSent = new THREE.Vector3(1e9, 0, 0); private lastRy = 0; private lastMeta = '';

  constructor(name: string) {
    const id = rid();
    this.self = { id, name: clamp(name, 32) || 'Guest', x: 0, y: 0, z: 0, ry: 0, zone: 'hall', seat: null, avatar: null, color: PALETTE[Math.floor(Math.random() * PALETTE.length)], onStage: false, t: 0 };
  }
  emit() { this.listeners.forEach(f => f()); }
  get connected() { return !!this.transport; }

  async connect(t: Transport) {
    this.transport = t;
    this.status = 'Connecting…'; this.emit();
    await t.connect({ id: this.self.id, name: this.self.name }, {
      onState: s => this.receive(s),
      onLeave: id => { this.peers.delete(id); this.emit(); },
      onChat: m => this.receiveChat(m),
      onControl: (c, from) => this.onControl?.(c, from),
      onStatus: text => { this.status = text; this.emit(); },
    });
    this.lastSend = 0; this.lastMeta = '';
    this.emit();
  }
  disconnect() { this.transport?.disconnect(); this.transport = null; this.peers.clear(); this.status = 'Solo'; this.emit(); }

  /** Called every frame with the local player's pose. Sends ~10 Hz while moving, 1 Hz heartbeat when still. */
  tick(pos: THREE.Vector3, ry: number, now: number) {
    const s = this.self;
    s.x = pos.x; s.y = pos.y; s.z = pos.z; s.ry = ry;
    s.zone = zoneOf(pos);
    s.onStage = Math.hypot(pos.x - STAGE.center.x, pos.z - STAGE.center.z) < STAGE.r && pos.y > STAGE.h * 0.5;
    const t = this.transport; if (!t) return;
    const moved = pos.distanceTo(this.lastSent) > 0.04 || Math.abs(ry - this.lastRy) > 0.05;
    const meta = `${s.name}|${s.seat}|${s.avatar}|${s.zone}|${s.onStage}`;
    const gap = now - this.lastSend;
    if ((moved && gap > 100) || gap > 1000 || meta !== this.lastMeta) {
      s.t = now; t.sendState({ ...s }); this.lastSend = now; this.lastSent.copy(pos); this.lastRy = ry; this.lastMeta = meta;
    }
  }

  private receive(s: PeerState) {
    if (s.id === this.self.id || this.blocked.has(s.id)) return;
    s.name = clamp(String(s.name ?? 'Guest'), 32) || 'Guest';
    let p = this.peers.get(s.id);
    const now = performance.now();
    if (!p) { p = { ...s, rp: new THREE.Vector3(s.x, s.y, s.z), rry: s.ry, speed: 0, lastSeen: now, speaking: false, bubble: null }; this.peers.set(s.id, p); this.emit(); }
    else Object.assign(p, s, { lastSeen: now });
  }
  private receiveChat(m: ChatMsg) {
    if (this.blocked.has(m.from)) return;
    m.text = clamp(String(m.text ?? ''), 280); m.name = clamp(String(m.name ?? 'Guest'), 32);
    if (!m.text) return;
    this.chat.push(m); if (this.chat.length > 200) this.chat.shift();
    const p = this.peers.get(m.from); if (p) p.bubble = { text: m.text, until: performance.now() + 7000 };
    this.emit();
  }

  say(text: string) {
    const t = clamp(text, 280); if (!t) return;
    const m: ChatMsg = { id: rid(), from: this.self.id, name: this.self.name, text: t, t: Date.now(), zone: this.self.zone };
    this.chat.push(m); this.transport?.sendChat(m); this.emit();
  }
  block(id: string) { this.blocked.add(id); this.peers.delete(id); this.chat = this.chat.filter(c => c.from !== id); this.emit(); }
  unblockAll() { this.blocked.clear(); this.emit(); }
  isHost() { return this.transport ? this.transport.isHost() : true; }
  sendControl(c: Control) { this.transport?.sendControl(c); }
  seatTaken(key: string) { for (const p of this.peers.values()) if (p.seat === key) return true; return false; }

  /** Smooth remote poses toward their latest state (called every frame). Drops peers silent for 15 s. */
  smooth(dt: number) {
    const now = performance.now();
    const k = 1 - Math.exp(-dt * 10);
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > 15000) { this.peers.delete(id); this.emit(); continue; }
      const before = p.rp.clone();
      p.rp.lerp(new THREE.Vector3(p.x, p.y, p.z), k);
      let d = p.ry - p.rry; d = Math.atan2(Math.sin(d), Math.cos(d)); p.rry += d * k;
      p.speed = THREE.MathUtils.lerp(p.speed, before.distanceTo(p.rp) / Math.max(dt, 1e-3), 0.2);
      if (p.bubble && now > p.bubble.until) p.bubble = null;
    }
  }
  zoneCount(z: Zone) { let n = this.self.zone === z ? 1 : 0; for (const p of this.peers.values()) if (p.zone === z) n++; return n; }
}
