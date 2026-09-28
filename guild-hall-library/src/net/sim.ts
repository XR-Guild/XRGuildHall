import * as THREE from 'three';
import type { Transport, TransportEvents, PeerState, ChatMsg, Control } from './types';
import { PALETTE } from './types';
import { HALL, LIB, STAGE, POOL, PATH_CURVE, zoneOf } from '../site';

/**
 * Simulated crowd for load testing (?sim=100). Nothing leaves the browser.
 * Peers wander between hall, stage, colonnade, library and garden; some sit when seats are offered.
 */
export class SimTransport implements Transport {
  kind = 'sim' as const;
  label: string;
  private ev: TransportEvents | null = null;
  private timer = 0;
  private bots: { s: PeerState; target: THREE.Vector3; wait: number; speed: number; seatKey: string | null }[] = [];
  seatProvider: (() => { key: string; pos: THREE.Vector3; rotY: number }[]) | null = null;
  constructor(private n: number) { this.label = `Simulated crowd · ${n}`; }

  private pick(): THREE.Vector3 {
    const r = Math.random();
    const ring = (c: THREE.Vector3, rad: number) => { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * rad; return new THREE.Vector3(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d); };
    if (r < 0.55) return ring(HALL.center, HALL.apothem - 1.6);
    if (r < 0.62) return ring(STAGE.center, STAGE.r - 0.6).setY(STAGE.h);
    if (r < 0.72) return PATH_CURVE.getPointAt(Math.random()).setY(0);
    if (r < 0.84) return ring(LIB.center, LIB.apothem - 1.6);
    return ring(POOL.center, 9);
  }
  async connect(self: { id: string; name: string }, ev: TransportEvents) {
    this.ev = ev;
    const names = ['Ada', 'Ivan', 'Morton', 'Jaron', 'Tom', 'Myron', 'Brenda', 'Mary', 'Nonny', 'Avi', 'Kent', 'Hugh', 'Char', 'Linda', 'Kavya', 'Rui', 'Noor', 'Tomás', 'Mei', 'Oluwa'];
    for (let i = 0; i < this.n; i++) {
      const p = this.pick();
      this.bots.push({
        s: { id: 'sim' + i, name: `${names[i % names.length]} (sim ${i + 1})`, x: p.x, y: p.y, z: p.z, ry: Math.random() * 6, zone: zoneOf(p), seat: null, avatar: null, color: PALETTE[i % PALETTE.length], onStage: false, t: 0 },
        target: this.pick(), wait: Math.random() * 4, speed: 0.8 + Math.random() * 0.6, seatKey: null,
      });
    }
    let last = performance.now(), chatAt = last + 4000;
    const lines = ['Hello from the simulated crowd.', 'Is the stage mic on?', 'Love the labradorite.', 'Meet you in the Library.', 'Which seating is this?'];
    this.timer = window.setInterval(() => {
      const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000); last = now;
      const seats = this.seatProvider?.() ?? [];
      const taken = new Set(this.bots.flatMap(b => [b.seatKey, b.s.seat]).filter(Boolean));
      for (const b of this.bots) {
        const s = b.s;
        if (b.wait > 0) { b.wait -= dt; }
        else {
          const cur = new THREE.Vector3(s.x, s.y, s.z), d = b.target.clone().sub(cur); d.y = 0;
          const L = d.length();
          if (L < 0.2) {
            if (b.seatKey) { s.seat = b.seatKey; b.seatKey = null; b.wait = 10 + Math.random() * 25; }
            else {
              if (s.seat) taken.delete(s.seat);
              s.seat = null; b.wait = 1 + Math.random() * 6;
              const free = seats.filter(q => !taken.has(q.key));
              if (free.length && Math.random() < 0.5) { const q = free[Math.floor(Math.random() * free.length)]; b.target = q.pos.clone(); b.seatKey = q.key; taken.add(q.key); }
              else b.target = this.pick();
            }
          } else {
            s.seat = null;
            const step = Math.min(L, b.speed * dt); cur.addScaledVector(d.normalize(), step);
            s.x = cur.x; s.z = cur.z; s.y = b.target.y > 0.2 && L < 1.2 ? b.target.y : 0; s.ry = Math.atan2(d.x, d.z);
          }
        }
        if (s.seat) { const q = seats.find(q => q.key === s.seat); if (q) { s.x = q.pos.x; s.z = q.pos.z; s.ry = q.rotY; } else s.seat = null; }
        s.zone = zoneOf(new THREE.Vector3(s.x, 0, s.z));
        s.onStage = Math.hypot(s.x - STAGE.center.x, s.z - STAGE.center.z) < STAGE.r;
        s.t = now; ev.onState({ ...s });
      }
      if (now > chatAt) {
        chatAt = now + 9000 + Math.random() * 12000;
        const b = this.bots[Math.floor(Math.random() * this.bots.length)];
        if (b) ev.onChat({ id: Math.random().toString(36).slice(2), from: b.s.id, name: b.s.name, text: lines[Math.floor(Math.random() * lines.length)], t: Date.now(), zone: b.s.zone });
      }
    }, 100);
    ev.onStatus(`${this.label} · offline test`);
    void self;
  }
  sendState() {}
  sendChat(_m: ChatMsg) {}
  sendControl(_c: Control) {}
  isHost() { return true; }
  disconnect() { clearInterval(this.timer); this.bots = []; }
  speakingIds(t: number) { return this.bots.filter((_, i) => Math.sin(t * 0.7 + i * 1.7) > 0.93).map(b => b.s.id); }
}
