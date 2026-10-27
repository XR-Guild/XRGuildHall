import * as THREE from 'three';
import type { Transport, TransportEvents, PeerState, ChatMsg, Control, AudioMode } from './types';
import type { Peer } from './presence';
import { loadScript } from './loadScript';

/**
 * Photon Cloud session: spatial voice for everyone, and (off Viverse) presence + chat over room events.
 * No server of our own: the client joins with the Photon App ID. The SDK zip is gated, so it is not in git;
 * public/photon/ must hold photon-voice.min.js and photon-voice.wasm (see README).
 *
 * Every voice is decoded to PCM and played through our own HRTF panner, because the SDK's player has no
 * output node. Photon has no per-listener subscription, so "nearest 10" is enforced on the client by
 * disconnecting the audio chain of everyone else.
 */
const SDK = 'photon/photon-voice.min.js';
const APP_VERSION = '1.0';
export const RATE = 48000;
const FRAME_US = 40000; // 25 events/s per open mic; 20 ms frames would double the room's message rate
/** Samples per outgoing voice frame (mono, at RATE). */
export const VOICE_FRAME = RATE * FRAME_US / 1e6;
const JOIN_TIMEOUT_MS = 15000;
export const EV = { state: 1, chat: 2, ctl: 3 } as const;
const SPEAK_RMS = 0.02, SPEAK_HOLD_MS = 300;
// rolloff 0 keeps the inverse model at full gain at any distance, while HRTF still places the voice
const FALLOFF = { normal: { ref: 1.2, roll: 1.4 }, stage: { ref: 8, roll: 0.35 }, megaphone: { ref: 1, roll: 0 } } as const;
/**
 * Room audio modes (set by an admin, see docs/AUDIO.md):
 *  conversation  nearest 10 in your zone, HRTF distance falloff; stage voices carry across the hall
 *  event         large groups: nearest 6, audience voices fade out past 10 m and sit a little lower; stage carries
 *  spotlight     stage speakers, the megaphone and spotlit guests are heard by everyone at full volume;
 *                everyone else is a whisper: only your 3 nearest neighbours within 3 m, at a third of the volume
 */
const MODES: Record<AudioMode, { keep: number; range: number; crowdGain: number }> = {
  conversation: { keep: 10, range: 25, crowdGain: 1 },
  event: { keep: 6, range: 10, crowdGain: 0.8 },
  spotlight: { keep: 3, range: 3, crowdGain: 0.35 },
};
export interface PhotonOptions {
  /** People per room. Must match the Photon plan's CCU; the free plan is 20. */
  maxPlayers: number;
  /** The Photon app uses Custom Authentication (proxy/photon-auth-worker.js); admins are actors whose UserId starts with "admin:". */
  verified: boolean;
  /** Admin passphrase, checked by the auth worker (never by the page). Empty for guests. */
  adminKey?: string;
  /** false: send only, with no audio context and no decoding of incoming voices. For load-test bots, whose cost would otherwise grow with the square of the crowd. */
  receive?: boolean;
}
type Falloff = keyof typeof FALLOFF;

async function loadPhoton() {
  const G = globalThis as any;
  await loadScript(SDK, () => !!G.Photon?.Voice, 'Could not load the Photon Voice SDK');
  // setOnLoad never fires when the wasm fails to load (Emscripten aborts instead)
  await new Promise<void>((res, rej) => {
    const timer = setTimeout(() => rej(new Error('The Photon Voice SDK did not start')), JOIN_TIMEOUT_MS);
    G.Photon.setOnLoad(() => { clearTimeout(timer); res(); });
  });
  return G.Photon;
}

const WORKLETS = `
// Jitter buffer per remote voice: frames arrive from the decoder on the main thread, the worklet drains them.
class VoiceOut extends AudioWorkletProcessor {
  constructor(o) {
    super();
    const p = o.processorOptions;
    this.step = p.step; this.ch = p.channels; this.min = p.prebuffer; this.max = p.maxBuffer;
    this.under = 0; this.quanta = 0;
    this.reset();
    this.port.onmessage = e => {
      if (e.data === 'flush') { this.reset(); return; }
      this.q.push(e.data); this.queued += e.data.length / this.ch;
      while (this.queued > this.max && this.q.length > 1) this.queued -= this.q.shift().length / this.ch;
    };
  }
  reset() { this.q = []; this.cur = null; this.idx = 0; this.queued = 0; this.playing = false; }
  process(_in, outs) {
    const out = outs[0][0];
    // underruns are reported about once a second for the ?debug=voice overlay
    if (++this.quanta >= 375) { if (this.under) this.port.postMessage(this.under); this.under = 0; this.quanta = 0; }
    if (!this.playing && this.queued < this.min) { out.fill(0); return true; }
    this.playing = true;
    // play 5% fast while well above the prebuffer, so a burst after a stall doesn't leave lasting delay
    const step = this.queued > this.min * 2 ? this.step * 1.05 : this.step;
    for (let i = 0; i < out.length; i++) {
      while (!this.cur || this.idx >= this.cur.length / this.ch) {
        if (this.cur) { this.idx -= this.cur.length / this.ch; this.queued -= this.cur.length / this.ch; }
        this.cur = this.q.shift() || null;
        if (!this.cur) break;
      }
      if (!this.cur) { out.fill(0, i); this.playing = false; this.idx = 0; this.under++; break; }
      out[i] = this.cur[Math.floor(this.idx) * this.ch];
      this.idx += step;
    }
    return true;
  }
}
registerProcessor('xrgh-voice-out', VoiceOut);

// Mic capture: batches render quanta into one frame per message for LocalVoiceAudio.pushData.
class MicIn extends AudioWorkletProcessor {
  constructor(o) { super(); this.buf = new Float32Array(o.processorOptions.frame); this.n = 0; }
  process(ins) {
    const x = ins[0] && ins[0][0]; if (!x) return true;
    for (let i = 0; i < x.length; i++) {
      this.buf[this.n++] = x[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf); this.buf = new Float32Array(this.buf.length); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('xrgh-mic-in', MicIn);
`;

interface RemoteVoice {
  actorNr: number; node: AudioWorkletNode; pan: PannerNode; gain: GainNode;
  falloff: Falloff; audible: boolean; loudAt: number; level: number;
}

/** Replace an SDK callback without dropping the wrapper the Voice transport installed on the instance. */
function chain(obj: any, name: string, after: (...args: any[]) => void) {
  const prev = obj[name];
  obj[name] = (...args: any[]) => { prev.apply(obj, args); after(...args); };
}

export class PhotonSession {
  client: any = null;
  ctx: AudioContext | null = null;
  micOn = false;
  localMuted = new Set<string>();
  /** Running totals for load testing: jitter-buffer underruns across audible voices, and frames decoded. */
  underruns = 0;
  framesDecoded = 0;
  onEvent: ((code: number, payload: any, from: string, fromHost: boolean) => void) | null = null;
  onLeave: ((id: string) => void) | null = null;
  onStatus: ((s: string) => void) | null = null;
  /** Fires once when a joined connection drops, and once when it is back. */
  onLink: ((up: boolean) => void) | null = null;
  private P: any = null;
  private linkDown = false;
  private pids = new Map<number, string>();
  /** Actors the auth worker signed in as admins (UserId "admin:…"). Set by Photon, not by the actor, so it can't be faked. */
  private admins = new Set<number>();
  audioMode: AudioMode = 'conversation';
  /** Presence ids an admin has spotlit: heard by everyone at full volume, wherever they stand. */
  spotlight = new Set<string>();
  private voices = new Map<string, RemoteVoice>();
  private mic: { stream: MediaStream; src: MediaStreamAudioSourceNode; node: AudioWorkletNode; voice: any | null } | null = null;
  private closing = false;
  private self = '';
  private name = '';
  private retries = 0;
  private retryTimer = 0;
  private onVisible = () => { if (document.visibilityState === 'visible' && this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = 0; this.reopen(); } };

  constructor(private appId: string, public roomName: string, private region: string, private opts: PhotonOptions = { maxPlayers: 20, verified: false }) {}

  async connect(identity: string, name: string) {
    // Leave can land during any await here; without these checks a client would join after it
    const left = () => { if (this.closing) throw new Error('Voice was closed'); };
    this.P = await loadPhoton(); left();
    if (this.opts.receive === false) {
      // without a decoder the SDK logs every remote voice, and some of their frames; with 50 bots that is thousands of lines
      const V = this.P.Voice, log = V._log;
      V.setLogFunc((level: number, msg: string) => { if (!/decoder is null|options are not set for the remote voice|of not initialized player/.test(msg)) log(level, msg); });
    } else {
      const ctx = this.ensureAudio();
      const url = URL.createObjectURL(new Blob([WORKLETS], { type: 'text/javascript' }));
      try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
      left();
    }
    // the presence id rides on the actor so voices (keyed by actor number) line up with avatars
    this.self = identity; this.name = name;
    document.addEventListener('visibilitychange', this.onVisible);
    try { await this.open(); } catch (e) { this.disconnect(); throw e; }
  }

  /** One client per connection. A dropped client is retired and replaced, never reused. */
  private open() {
    const P = this.P;
    const c = new P.Voice.LoadBalancingVoiceClient(P.ConnectionProtocol.Wss, this.appId, APP_VERSION);
    this.client = c;
    const S = P.LoadBalancing.LoadBalancingClient.State;
    const OP = P.LoadBalancing.Constants.OperationCode;
    if (this.opts.receive !== false) c.voiceClient.setOnRemoteVoiceInfoAction((actorNr: number, voiceId: number, info: any) => this.addVoice(actorNr, voiceId, info));
    chain(c, 'onActorJoin', (a: any) => this.track(a));
    chain(c, 'onActorPropertiesChange', (a: any) => this.track(a));
    // cleanup=true is our own client tearing down, when every actor is still listed
    chain(c, 'onActorLeave', (a: any, cleanup: boolean) => this.untrack(a.actorNr, cleanup ? [] : c.myRoomActorsArray()));
    c.onEvent = (code: number, content: any, actorNr: number) => {
      const pid = this.pids.get(actorNr); if (!pid) return;
      let payload: any; try { payload = typeof content === 'string' ? JSON.parse(content) : content; } catch { return; }
      if (payload && typeof payload === 'object') this.onEvent?.(code, payload, pid, this.opts.verified ? this.admins.has(actorNr) : actorNr === c.myRoomMasterActorNr());
    };
    c.myActor().setName(this.name);
    c.myActor().setCustomProperty('pid', this.self);
    if (this.opts.verified) {
      // Custom Authentication: the Photon server forwards these to proxy/photon-auth-worker.js, which answers with the UserId.
      // The passphrase is checked there; the page never knows which passphrases are valid.
      const CA = P.LoadBalancing.Constants.CustomAuthenticationType;
      const q = new URLSearchParams({ key: this.opts.adminKey ?? '', name: this.name.slice(0, 32) });
      c.setCustomAuthentication(q.toString(), CA?.Custom ?? 0);
    }
    return new Promise<void>((res, rej) => {
      let joined = false, settled = false;
      const fail = (msg: string) => { if (!settled) { settled = true; rej(new Error(msg)); } };
      const timer = setTimeout(() => fail('Voice server did not answer'), JOIN_TIMEOUT_MS);
      c.onError = (code: number, msg: string) => fail(`Photon error ${code}: ${msg}`);
      // join/create failures (room full, closed) only arrive here, not in onError or a state change
      c.onOperationResponse = (err: number, msg: string, code: number) => { if (err && (code === OP.JoinGame || code === OP.CreateGame)) fail(msg || `Could not join the voice room (${err})`); };
      chain(c, 'onStateChange', (st: number) => {
        // a client retired mid-join (Leave) settles now instead of waiting out the join timer
        if (c !== this.client) { clearTimeout(timer); fail('Voice was closed'); if (st === S.Disconnected) c.dispose(); return; }
        // publishUserId lets every client read each actor's server-issued UserId (the admin check relies on it)
        if (st === S.JoinedLobby && !joined) c.joinRoom(this.roomName, { createIfNotExists: true }, { maxPlayers: this.opts.maxPlayers, publishUserId: true });
        else if (st === S.Joined && !joined) {
          joined = settled = true; clearTimeout(timer); this.retries = 0;
          if (this.linkDown) { this.linkDown = false; this.onLink?.(true); }
          for (const a of c.myRoomActorsArray()) this.track(a);
          this.attachMic();
          this.onStatus?.(this.micOn ? 'Voice connected · mic ON' : 'Voice connected · mic off');
          res();
        } else if (st === S.Disconnected || st === S.Error) {
          clearTimeout(timer); fail('Could not reach Photon');
          // a joined connection can still drop, e.g. when a headset sleeps and stops answering the server
          if (joined) this.dropped();
        }
      });
      c.connectToRegionMaster(this.region);
    });
  }

  private dropped() {
    for (const k of [...this.voices.keys()]) this.removeVoice(k);
    for (const actorNr of [...this.pids.keys()]) this.untrack(actorNr);
    if (this.mic?.voice) { this.mic.node.port.onmessage = null; this.P.Voice.dispose(this.mic.voice); this.mic.voice = null; } // the stream stays open so the mic resumes on rejoin
    this.retire();
    this.reconnectLater();
  }
  private reconnectLater() {
    if (this.closing) return;
    if (!this.linkDown) { this.linkDown = true; this.onLink?.(false); }
    this.onStatus?.('Voice reconnecting…');
    this.retryTimer = window.setTimeout(() => { this.retryTimer = 0; this.reopen(); }, Math.min(30000, 2000 * 2 ** this.retries++));
  }
  private reopen() { this.open().catch(() => { this.retire(); this.reconnectLater(); }); }
  private retire() {
    const c = this.client; if (!c) return;
    this.client = null;
    const S = this.P.LoadBalancing.LoadBalancingClient.State, st = c.state();
    try { if (st === S.Uninitialized || st === S.Disconnected) c.dispose(); else c.disconnect(); } catch { /* already closed */ }
  }

  /** First claim wins: a pid can't be reassigned or shared, so one actor can't take over another's avatar. */
  private track(a: any) {
    if (a.isLocal) return;
    const uid = String(a.userId ?? a.getUserId?.() ?? '');
    if (uid.startsWith('admin:')) this.admins.add(a.actorNr); else this.admins.delete(a.actorNr);
    if (this.pids.has(a.actorNr)) return;
    const pid = a.getCustomProperty('pid');
    if (typeof pid !== 'string' || !pid || pid === this.self || [...this.pids.values()].includes(pid)) return;
    this.pids.set(a.actorNr, pid);
  }
  private untrack(actorNr: number, remaining: any[] = []) {
    const pid = this.pids.get(actorNr); this.pids.delete(actorNr); this.admins.delete(actorNr);
    // a peer that rejoined before its old actor timed out has been waiting behind that actor for its pid
    for (const a of remaining) this.track(a);
    if (pid && ![...this.pids.values()].includes(pid)) this.onLeave?.(pid);
  }

  /** Must be called from a user gesture (browsers block audio otherwise). */
  ensureAudio() {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: RATE });
    if (this.ctx.state !== 'running') this.ctx.resume();
    return this.ctx;
  }

  /** We capture the mic ourselves: the SDK's microphone never stops its tracks, so the browser's mic indicator would stay on. */
  async setMic(on: boolean) {
    if (on && !this.client?.isJoinedToRoom()) return; // turning off must still work while voice is reconnecting
    const ctx = this.ensureAudio(), V = this.P.Voice;
    if (on && !this.mic) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!this.client) { stream.getTracks().forEach(t => t.stop()); return; }
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'xrgh-mic-in', { numberOfOutputs: 0, processorOptions: { frame: ctx.sampleRate * FRAME_US / 1e6 } });
      src.connect(node);
      this.mic = { stream, src, node, voice: null };
      this.attachMic();
    } else if (!on && this.mic) {
      const m = this.mic; this.mic = null;
      m.node.port.onmessage = null; m.src.disconnect(); m.node.disconnect(); m.stream.getTracks().forEach(t => t.stop());
      if (m.voice) V.dispose(m.voice);
    }
    this.micOn = on;
    this.onStatus?.(!this.client?.isJoinedToRoom() ? 'Voice reconnecting…' : on ? 'Voice connected · mic ON' : 'Voice connected · mic off');
  }

  /** (Re)creates the outgoing voice on the current client; the capture graph survives reconnects. */
  private attachMic() {
    const m = this.mic; if (!m || m.voice || !this.client?.isJoinedToRoom()) return;
    const voice = m.voice = this.createLocalVoice(this.ctx!.sampleRate);
    m.node.port.onmessage = e => voice.pushData(e.data);
  }
  /** An outgoing voice on the current client; feed it mono frames of FRAME_US at `rate` (VOICE_FRAME samples at RATE) with pushData. */
  createLocalVoice(rate = RATE) { return this.client.voiceClient.createLocalVoiceAudio(this.P.Voice.createOpusVoiceInfo(RATE, 1, FRAME_US, 32000), rate, 1); }

  private addVoice(actorNr: number, voiceId: number, info: any) {
    const V = this.P.Voice, ctx = this.ensureAudio();
    const key = `${actorNr}/${voiceId}`;
    const channels = info.channels || 1;
    const node = new AudioWorkletNode(ctx, 'xrgh-voice-out', {
      numberOfInputs: 0, outputChannelCount: [1],
      processorOptions: { step: (info.samplingRate || RATE) / ctx.sampleRate, channels, prebuffer: ctx.sampleRate * 0.06, maxBuffer: ctx.sampleRate * 0.3 },
    });
    const pan = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: FALLOFF.normal.ref, maxDistance: 30, rolloffFactor: FALLOFF.normal.roll });
    const gain = new GainNode(ctx, { gain: this.isMuted(actorNr) ? 0 : 1 });
    node.connect(pan).connect(gain);
    const v: RemoteVoice = { actorNr, node, pan, gain, falloff: 'normal', audible: false, loudAt: 0, level: 1 };
    this.voices.set(key, v);
    node.port.onmessage = e => { this.underruns += e.data; };
    // stays silent until updateSubscriptions matches it to an avatar, so a voice with no one in the room is never heard
    const decoder = V.createAudioDecoder((frame: Float32Array) => {
      this.framesDecoded++;
      let sum = 0; for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
      if (Math.sqrt(sum / frame.length) > SPEAK_RMS) v.loudAt = performance.now();
      if (v.audible) { const copy = frame.slice(); node.port.postMessage(copy, [copy.buffer]); } // frame may view wasm memory
    });
    return V.createRemoteVoiceOptions(decoder, () => this.removeVoice(key));
  }
  private removeVoice(key: string) {
    const v = this.voices.get(key); if (!v) return;
    v.node.disconnect(); v.pan.disconnect(); v.gain.disconnect(); v.node.port.close(); this.voices.delete(key);
  }
  /** Disconnected chains cost nothing in the audio graph; frames for them are dropped before they reach the worklet. */
  private setAudible(v: RemoteVoice, on: boolean) {
    if (v.audible === on || !this.ctx) return;
    v.audible = on;
    if (on) { v.node.port.postMessage('flush'); v.gain.connect(this.ctx.destination); } else v.gain.disconnect();
  }
  private isMuted(actorNr: number) { const pid = this.pids.get(actorNr); return !!pid && this.localMuted.has(pid); }

  get voiceCounts() { let audible = 0; for (const v of this.voices.values()) if (v.audible) audible++; return { incoming: this.voices.size, audible }; }

  get speaking() {
    const now = performance.now(), s = new Set<string>();
    for (const v of this.voices.values()) { const pid = this.pids.get(v.actorNr); if (pid && now - v.loudAt < SPEAK_HOLD_MS) s.add(pid); }
    return s;
  }

  muteLocal(id: string, muted: boolean) {
    muted ? this.localMuted.add(id) : this.localMuted.delete(id);
    for (const v of this.voices.values()) if (this.pids.get(v.actorNr) === id) v.gain.gain.value = muted ? 0 : v.level;
  }
  /** Heard by everyone at full volume: on the stage with the megaphone, or spotlit by an admin. */
  private isLoud(p: Peer) { return p.megaphone || this.spotlight.has(p.id) || (this.audioMode === 'spotlight' && p.onStage); }
  setAudioMode(mode: AudioMode) { if (MODES[mode]) this.audioMode = mode; }

  /**
   * Pick who is audible (every ~0.5 s), following the room's audio mode: the loud voices (megaphone, spotlight,
   * and in spotlight mode the stage) are always kept; the crowd fills the remaining slots nearest first.
   */
  updateSubscriptions(me: { x: number; z: number; zone: string }, peers: Map<string, Peer>, blocked: Set<string>) {
    const speaking = this.speaking, M = MODES[this.audioMode];
    const loud: RemoteVoice[] = [], crowd: { v: RemoteVoice; score: number }[] = [];
    for (const v of this.voices.values()) {
      const id = this.pids.get(v.actorNr);
      const p = id ? peers.get(id) : undefined;
      if (!id || !p || blocked.has(id)) { this.setAudible(v, false); continue; }
      const stageVoice = p.onStage && me.zone === 'hall' && this.audioMode !== 'spotlight';
      if (this.isLoud(p)) { v.level = 1; loud.push(v); continue; }
      const d = Math.hypot(p.rp.x - me.x, p.rp.z - me.z);
      let score = 100 - d;
      if (p.zone !== me.zone) score -= 60;
      if (stageVoice) score += 200;
      if (speaking.has(id)) score += 20;
      if (d > M.range && !stageVoice) score = -1;
      v.level = stageVoice ? 1 : M.crowdGain;
      crowd.push({ v, score });
    }
    crowd.sort((a, b) => b.score - a.score);
    // loud voices first (capped so a mis-click can't flood a headset), then the nearest of the crowd
    const keep = new Set([...loud.slice(0, 6), ...crowd.filter(s => s.score > 0).slice(0, M.keep).map(s => s.v)]);
    for (const v of this.voices.values()) {
      v.gain.gain.value = this.isMuted(v.actorNr) ? 0 : v.level; // the pid may have arrived after the voice did
      this.setAudible(v, keep.has(v));
    }
  }
  /** Position every audible voice at its avatar's mouth (every frame). */
  updatePanners(listener: THREE.Object3D, peers: Map<string, Peer>) {
    const ctx = this.ctx; if (!ctx || !this.voices.size) return;
    const p = new THREE.Vector3(), f = new THREE.Vector3(0, 0, -1), u = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
    listener.getWorldPosition(p); listener.getWorldQuaternion(q); f.applyQuaternion(q); u.applyQuaternion(q);
    const L = ctx.listener, t = ctx.currentTime;
    if (L.positionX) { L.positionX.setTargetAtTime(p.x, t, 0.05); L.positionY.setTargetAtTime(p.y, t, 0.05); L.positionZ.setTargetAtTime(p.z, t, 0.05); L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z; }
    else (L as any).setPosition(p.x, p.y, p.z);
    for (const n of this.voices.values()) {
      const id = this.pids.get(n.actorNr); const peer = id ? peers.get(id) : undefined; if (!peer) continue;
      n.pan.positionX.setTargetAtTime(peer.rp.x, t, 0.05); n.pan.positionY.setTargetAtTime(peer.rp.y + 1.5, t, 0.05); n.pan.positionZ.setTargetAtTime(peer.rp.z, t, 0.05);
      const falloff: Falloff = this.isLoud(peer) ? 'megaphone' : peer.onStage ? 'stage' : 'normal';
      if (falloff !== n.falloff) { n.falloff = falloff; n.pan.refDistance = FALLOFF[falloff].ref; n.pan.rolloffFactor = FALLOFF[falloff].roll; }
    }
  }
  send(code: number, obj: any) { if (this.client?.isJoinedToRoom()) this.client.raiseEvent(code, JSON.stringify(obj)); }
  /** May this client change room settings? Verified mode: signed in as an admin. Otherwise: the room's master client. */
  isHost() {
    const c = this.client; if (!c?.isJoinedToRoom()) return false;
    if (this.opts.verified) return String(c.getUserId?.() ?? c.myActor().userId ?? '').startsWith('admin:');
    return c.myActor().actorNr === c.myRoomMasterActorNr();
  }
  /** Room controls over Photon events (sender-stamped). `hello` may come from anyone; everything else only from an admin. */
  sendControl(c: Control) { if (c.type === 'hello' || this.isHost()) this.send(EV.ctl, c); }
  get headcount() { return this.client?.isJoinedToRoom() ? this.client.myRoomActorsArray().length : 0; }
  /** Safe to call more than once. A retired client is disposed once its socket has actually closed. */
  disconnect() {
    this.closing = true;
    clearTimeout(this.retryTimer); this.retryTimer = 0;
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.mic) this.setMic(false);
    this.onStatus = null; this.onEvent = null; this.onLeave = null; this.onLink = null;
    for (const k of [...this.voices.keys()]) this.removeVoice(k);
    this.micOn = false; this.pids.clear();
    if (this.P) this.retire();
    this.ctx?.close(); this.ctx = null;
  }
}

/** Presence + chat over Photon room events, for hosting outside Viverse. The room's master client is the host. */
export class PhotonTransport implements Transport {
  kind = 'photon' as const;
  label = 'Photon room';
  constructor(public session: PhotonSession) {}
  async connect(self: { id: string; name: string }, ev: TransportEvents) {
    const s = this.session;
    s.onStatus = ev.onStatus;
    s.onLeave = ev.onLeave;
    s.onEvent = (code, payload, from, fromHost) => {
      if (code === EV.state && payload.id === from) ev.onState(payload as PeerState);
      else if (code === EV.chat && payload.from === from) ev.onChat(payload as ChatMsg);
      else if (code === EV.ctl && (fromHost || payload?.type === 'hello')) ev.onControl(payload as Control, from); // Photon stamps the sender, so this can't be spoofed
    };
    if (!s.client) await s.connect(self.id, self.name);
  }
  sendState(st: PeerState) { this.session.send(EV.state, st); }
  sendChat(m: ChatMsg) { this.session.send(EV.chat, m); }
  sendControl(c: Control) { this.session.sendControl(c); }
  isHost() { return this.session.isHost(); }
  disconnect() { this.session.disconnect(); }
}
