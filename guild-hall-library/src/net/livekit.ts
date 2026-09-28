import * as THREE from 'three';
import type { Transport, TransportEvents, PeerState, ChatMsg, Control } from './types';
import type { Peer } from './presence';

/**
 * LiveKit Cloud session: spatial voice for everyone, and (off Viverse) presence + chat over data messages.
 * The token comes from our own tiny worker (proxy/livekit-token-worker.js) so API secrets never reach the page.
 *
 * Scaling rules for 100+ people in one room:
 *  - mic is OFF by default; you publish only after pressing Mic
 *  - you SUBSCRIBE only to the nearest ~10 speakers in your zone, plus whoever is on the stage
 *  - stage voices use a flat roll-off so the whole hall hears them; everyone else fades with distance (HRTF)
 */
type LK = typeof import('livekit-client');

export class LiveKitSession {
  lk!: LK;
  room: any = null;
  ctx: AudioContext | null = null;
  micOn = false;
  speaking = new Set<string>();
  private nodes = new Map<string, { el: HTMLAudioElement; src: MediaStreamAudioSourceNode; pan: PannerNode; gain: GainNode; stage: boolean }>();
  localMuted = new Set<string>();
  onData: ((topic: string, payload: any, from: string, fromHost: boolean) => void) | null = null;
  onLeave: ((id: string) => void) | null = null;
  onStatus: ((s: string) => void) | null = null;
  isHost = false;
  hostKey = '';

  constructor(private tokenUrl: string, private roomName: string) {}

  async connect(identity: string, name: string) {
    this.lk = await import('livekit-client');
    const res = await fetch(this.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity, name, room: this.roomName, hostKey: this.hostKey || undefined }) });
    if (!res.ok) throw new Error('Voice token refused (' + res.status + ')');
    const { token, url } = await res.json();
    const { Room, RoomEvent } = this.lk;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;
    room.on(RoomEvent.TrackSubscribed, (track: any, _pub: any, participant: any) => { if (track.kind === 'audio') this.attach(participant.identity, track); });
    room.on(RoomEvent.TrackUnsubscribed, (_t: any, _p: any, participant: any) => this.detach(participant.identity));
    room.on(RoomEvent.ParticipantDisconnected, (p: any) => { this.detach(p.identity); this.onLeave?.(p.identity); });
    room.on(RoomEvent.ActiveSpeakersChanged, (ps: any[]) => { this.speaking = new Set(ps.map(p => p.identity)); });
    room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant: any, _kind: any, topic?: string) => {
      if (!participant) return;
      try { this.onData?.(topic ?? '', JSON.parse(new TextDecoder().decode(payload)), participant.identity, participant.attributes?.host === '1'); } catch { /* ignore malformed */ }
    });
    room.on(RoomEvent.Disconnected, () => this.onStatus?.('Voice disconnected'));
    await room.connect(url, token, { autoSubscribe: false });
    this.isHost = room.localParticipant.attributes?.host === '1';
    this.onStatus?.('Voice connected · mic off');
  }

  /** Must be called from a user gesture (browsers block audio otherwise). */
  ensureAudio() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state !== 'running') this.ctx.resume();
    return this.ctx;
  }
  async setMic(on: boolean) {
    if (!this.room) return;
    this.ensureAudio();
    await this.room.localParticipant.setMicrophoneEnabled(on, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    this.micOn = on;
    this.onStatus?.(on ? 'Voice connected · mic ON' : 'Voice connected · mic off');
  }

  private attach(id: string, track: any) {
    const ctx = this.ensureAudio();
    this.detach(id);
    const ms = new MediaStream([track.mediaStreamTrack]);
    const el = new Audio(); el.srcObject = ms; el.muted = true; el.play().catch(() => {}); // Chrome needs a sink for WebRTC audio to flow into Web Audio
    const src = ctx.createMediaStreamSource(ms);
    const pan = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1.2, maxDistance: 30, rolloffFactor: 1.4 });
    const gain = new GainNode(ctx, { gain: this.localMuted.has(id) ? 0 : 1 });
    src.connect(pan).connect(gain).connect(ctx.destination);
    this.nodes.set(id, { el, src, pan, gain, stage: false });
  }
  private detach(id: string) {
    const n = this.nodes.get(id); if (!n) return;
    n.src.disconnect(); n.pan.disconnect(); n.gain.disconnect(); n.el.srcObject = null; this.nodes.delete(id);
  }
  muteLocal(id: string, muted: boolean) { muted ? this.localMuted.add(id) : this.localMuted.delete(id); const n = this.nodes.get(id); if (n) n.gain.gain.value = muted ? 0 : 1; }

  /** Pick who to subscribe to (every ~0.5 s). */
  updateSubscriptions(me: { x: number; z: number; zone: string }, peers: Map<string, Peer>, blocked: Set<string>) {
    if (!this.room) return;
    const scored: { id: string; score: number }[] = [];
    for (const [id, rp] of this.room.remoteParticipants as Map<string, any>) {
      const p = peers.get(id);
      if (!p || blocked.has(id)) { scored.push({ id, score: -1 }); continue; }
      const d = Math.hypot(p.rp.x - me.x, p.rp.z - me.z);
      let score = 100 - d;
      if (p.zone !== me.zone) score -= 60;
      if (p.onStage && me.zone === 'hall') score += 200;
      if (this.speaking.has(id)) score += 20;
      if (d > 25 && !p.onStage) score = -1;
      scored.push({ id, score });
      void rp;
    }
    scored.sort((a, b) => b.score - a.score);
    const keep = new Set(scored.filter(s => s.score > 0).slice(0, 10).map(s => s.id));
    for (const [id, rp] of this.room.remoteParticipants as Map<string, any>) {
      for (const pub of rp.audioTrackPublications.values()) { const want = keep.has(id); if (pub.isSubscribed !== want) pub.setSubscribed(want); }
    }
  }
  /** Position every audible voice at its avatar's mouth (every frame). */
  updatePanners(listener: THREE.Object3D, peers: Map<string, Peer>) {
    const ctx = this.ctx; if (!ctx || !this.nodes.size) return;
    const p = new THREE.Vector3(), f = new THREE.Vector3(0, 0, -1), u = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
    listener.getWorldPosition(p); listener.getWorldQuaternion(q); f.applyQuaternion(q); u.applyQuaternion(q);
    const L = ctx.listener, t = ctx.currentTime;
    if (L.positionX) { L.positionX.setTargetAtTime(p.x, t, 0.05); L.positionY.setTargetAtTime(p.y, t, 0.05); L.positionZ.setTargetAtTime(p.z, t, 0.05); L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z; }
    else (L as any).setPosition(p.x, p.y, p.z);
    for (const [id, n] of this.nodes) {
      const peer = peers.get(id); if (!peer) continue;
      n.pan.positionX.setTargetAtTime(peer.rp.x, t, 0.05); n.pan.positionY.setTargetAtTime(peer.rp.y + 1.5, t, 0.05); n.pan.positionZ.setTargetAtTime(peer.rp.z, t, 0.05);
      if (peer.onStage !== n.stage) { n.stage = peer.onStage; n.pan.refDistance = n.stage ? 8 : 1.2; n.pan.rolloffFactor = n.stage ? 0.35 : 1.4; }
    }
  }
  send(topic: string, obj: any, reliable: boolean) {
    if (!this.room) return;
    this.room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(obj)), { reliable, topic }).catch(() => {});
  }
  disconnect() { for (const id of [...this.nodes.keys()]) this.detach(id); this.room?.disconnect(); this.room = null; this.micOn = false; }
}

/** Presence + chat over LiveKit data messages, for hosting outside Viverse. */
export class LiveKitTransport implements Transport {
  kind = 'livekit' as const;
  label = 'LiveKit room';
  constructor(public session: LiveKitSession) {}
  async connect(self: { id: string; name: string }, ev: TransportEvents) {
    const s = this.session;
    s.onStatus = ev.onStatus;
    s.onLeave = ev.onLeave;
    s.onData = (topic, payload, from, fromHost) => {
      if (topic === 'state' && payload.id === from) ev.onState(payload as PeerState);
      else if (topic === 'chat' && payload.from === from) ev.onChat(payload as ChatMsg);
      else if (topic === 'ctl' && fromHost) ev.onControl(payload as Control, from); // only hosts (set by the token worker) can change the room
    };
    if (!s.room) await s.connect(self.id, self.name);
  }
  sendState(st: PeerState) { this.session.send('state', st, false); }
  sendChat(m: ChatMsg) { this.session.send('chat', m, true); }
  sendControl(c: Control) { this.session.send('ctl', c, true); }
  isHost() { return this.session.isHost; }
  disconnect() { this.session.disconnect(); }
}
