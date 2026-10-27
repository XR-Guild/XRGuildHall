import * as THREE from 'three';
import type { Mats } from './mats';
import type { RoomState, ScreenSource } from './net/types';
import { TAGLINE } from './hallfeatures';

/**
 * Media screens in the Guild Hall (V3).
 *
 *  stage  the big screen above the stage: slides (screenshare), the RTMP stream, or the XR Guild slide when idle
 *  west / east  wall screens either side of the stage, for streams, captions or a second camera
 *
 * Sources (chosen by an admin, shared by everyone through the room state):
 *  idle  the XR Guild slide (logo, mission line, xrguild.org)
 *  hls   any https HLS (.m3u8) or MP4 link: Cloudflare Stream, Mux, Owncast, a YouTube-free CDN … (hls.js where needed)
 *  live  the LiveKit media room: an RTMP stream from OBS arrives through LiveKit Ingress, and presenters share slides
 *        from presenter.html. Viewers only subscribe (no mic, no camera); voice stays on Photon.
 *
 * The LiveKit room is joined only while some screen shows a live source, so it uses no minutes the rest of the time.
 * Video always starts muted (browsers require it); stream sound starts with the visitor's first click, and the
 * "Stream sound" setting in Comfort turns it off for that visitor.
 */
export type ScreenId = 'stage' | 'west' | 'east';
interface Screen {
  id: ScreenId; group: THREE.Group; mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial;
  idle: THREE.CanvasTexture; w: number; h: number;
  src: ScreenSource; video: HTMLVideoElement | null; tex: THREE.VideoTexture | null; hls: any;
  liveKey: string; // which LiveKit track is attached
  audio: { src: AudioNode; pan: PannerNode; gain: GainNode } | null;
}
export interface MediaOptions { tokenUrl: string; room: string; identity: () => string; name: () => string; logoUrl: string; fonts: { display: string; body: string; mono: string } }

const BAYS: { id: ScreenId; bay: number; w: number }[] = [{ id: 'stage', bay: 0, w: 7.0 }, { id: 'west', bay: 11, w: 5.6 }, { id: 'east', bay: 1, w: 5.6 }];

function idleTexture(o: MediaOptions, logo: HTMLImageElement | null, label: string, note = '') {
  const W = 1920, H = 1080, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const bg = g.createRadialGradient(W / 2, H * 0.42, 50, W / 2, H / 2, W * 0.75); bg.addColorStop(0, '#16302b'); bg.addColorStop(1, '#05100e');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(216,174,90,.55)'; g.lineWidth = 6; g.strokeRect(36, 36, W - 72, H - 72);
  g.strokeStyle = 'rgba(216,174,90,.25)'; g.lineWidth = 2; g.strokeRect(56, 56, W - 112, H - 112);
  if (logo) { const h = 560, w = h * logo.width / logo.height; g.drawImage(logo, W / 2 - w / 2 - 330, H / 2 - h / 2 - 30, w, h); }
  const x = logo ? W / 2 + 40 : W / 2; g.textAlign = logo ? 'left' : 'center';
  g.fillStyle = '#f2d79a'; g.font = `96px ${o.fonts.display}`; g.fillText(label, x, H / 2 - 90);
  g.fillStyle = '#d9e6e1'; g.font = `40px ${o.fonts.body}`;
  const words = TAGLINE.split(' '); let line = '', y = H / 2 - 10;
  for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > 760) { g.fillText(line, x, y); line = wd; y += 54; } else line = t; }
  if (line) g.fillText(line, x, y);
  g.fillStyle = '#8fd3c4'; g.font = `600 44px ${o.fonts.mono}`; g.fillText('xrguild.org', x, y + 100);
  if (note) { g.fillStyle = 'rgba(242,215,154,.85)'; g.font = `34px ${o.fonts.mono}`; g.textAlign = 'center'; g.fillText(note, W / 2, H - 110); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class MediaScreens {
  screens = new Map<ScreenId, Screen>();
  ctx: AudioContext | null = null;
  soundOn = true;
  private positional = false;
  private logo: HTMLImageElement | null = null;
  private lk: any = null; private room: any = null; private connecting: Promise<void> | null = null;
  private tracks = { screen: null as any, screenAudio: null as any, ingress: null as any, ingressAudio: null as any };
  private status = '';
  onStatus: ((s: string) => void) | null = null;

  constructor(private m: Mats, private o: MediaOptions) {}
  get liveAvailable() { return !!this.o.tokenUrl; }

  /** Build the three screens onto the hall's media bays. Call before the hall is baked. */
  build(mounts: Map<number, THREE.Object3D>) {
    for (const b of BAYS) {
      const mount = mounts.get(b.bay); if (!mount) continue;
      const w = b.w, h = w * 9 / 16;
      const group = new THREE.Group(); group.name = `Screen:${b.id}`; group.userData.keep = true;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.36, h + 0.36, 0.1), this.m.walnutDark); frame.position.z = -0.03; group.add(frame);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.06), this.m.gilt); rim.position.z = 0.0; group.add(rim);
      const idle = idleTexture(this.o, null, 'XR Guild Hall');
      const mat = new THREE.MeshBasicMaterial({ map: idle, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); mesh.position.z = 0.035; mesh.name = `ScreenSurface:${b.id}`; group.add(mesh);
      mount.add(group);
      this.screens.set(b.id, { id: b.id, group, mesh, mat, idle, w, h, src: { kind: 'idle' }, video: null, tex: null, hls: null, liveKey: '', audio: null });
    }
    const img = new Image(); img.crossOrigin = 'anonymous';
    this.ready = new Promise<void>(res => {
      img.onload = () => { this.logo = img; for (const s of this.screens.values()) this.showIdle(s); res(); };
      img.onerror = () => res();
    });
    img.src = this.o.logoUrl;
  }
  /** Resolves once the idle slides carry the XR Guild logo (used by the GLB export). */
  ready: Promise<void> = Promise.resolve();

  private showIdle(s: Screen, note = '') {
    const t = idleTexture(this.o, this.logo, 'XR Guild Hall', note);
    s.idle.dispose(); s.idle = t;
    if (!s.video) { s.mat.map = t; s.mat.needsUpdate = true; }
  }

  /** Must run inside a user gesture once, so stream sound can start. */
  unlockAudio() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state !== 'running') this.ctx.resume();
    for (const s of this.screens.values()) if (s.video && this.soundOn) { s.video.muted = false; this.wireAudio(s); }
  }
  setSound(on: boolean) {
    this.soundOn = on;
    for (const s of this.screens.values()) { if (s.audio) s.audio.gain.gain.value = on ? 1 : 0; if (s.video && !on) s.video.muted = true; }
    if (on) this.unlockAudio();
  }

  /** Apply the shared room state. */
  apply(state: RoomState) {
    this.positional = state.screenAudio === 'positional';
    for (const s of this.screens.values()) {
      const src = state.screens[s.id] ?? { kind: 'idle' };
      if (JSON.stringify(src) === JSON.stringify(s.src)) continue;
      s.src = src; this.stop(s);
      if (src.kind === 'hls') this.playUrl(s, src.url);
      else if (src.kind === 'idle') this.showIdle(s);
    }
    for (const s of this.screens.values()) if (s.audio) this.routeAudio(s);
    const wantLive = [...this.screens.values()].some(s => s.src.kind === 'live');
    if (wantLive) this.joinLive().then(() => this.assignLive()).catch(e => { this.setStatus('Live screens unavailable: ' + (e?.message ?? e)); for (const s of this.screens.values()) if (s.src.kind === 'live') this.showIdle(s, 'Live stream unavailable'); });
    else this.leaveLive();
    this.assignLive();
  }

  private video() {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.playsInline = true; v.muted = true; v.autoplay = true; v.loop = false;
    v.setAttribute('playsinline', ''); v.preload = 'auto';
    return v;
  }
  private show(s: Screen, v: HTMLVideoElement) {
    s.video = v;
    const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    s.tex = tex; s.mat.map = tex; s.mat.needsUpdate = true;
    if (this.ctx?.state === 'running' && this.soundOn) { v.muted = false; this.wireAudio(s); }
  }
  private async playUrl(s: Screen, url: string) {
    const v = this.video();
    const isHls = /\.m3u8(\?|$)/i.test(url);
    if (isHls && !v.canPlayType('application/vnd.apple.mpegurl')) {
      const Hls = (await import('hls.js')).default;
      if (s.src.kind !== 'hls' || s.src.url !== url) return; // changed while loading
      if (!Hls.isSupported()) { this.showIdle(s, 'This browser cannot play the stream'); return; }
      const hls = new Hls({ lowLatencyMode: true, backBufferLength: 30 }); s.hls = hls;
      hls.on(Hls.Events.ERROR, (_e: any, d: any) => { if (d?.fatal) { this.setStatus('Stream error: ' + d.details); this.showIdle(s, 'Stream unavailable. Waiting…'); } });
      hls.loadSource(url); hls.attachMedia(v);
    } else v.src = url;
    v.loop = !isHls;
    this.show(s, v);
    v.play().catch(() => { /* waits for a gesture */ });
  }
  private stop(s: Screen) {
    try { s.hls?.destroy(); } catch { /* */ } s.hls = null;
    if (s.audio) { try { s.audio.src.disconnect(); s.audio.pan.disconnect(); s.audio.gain.disconnect(); } catch { /* */ } s.audio = null; }
    if (s.video) { if (s.liveKey) { try { this.trackFor(s.liveKey)?.detach(s.video); } catch { /* */ } } s.video.pause(); s.video.removeAttribute('src'); s.video.load(); }
    s.video = null; s.liveKey = '';
    s.tex?.dispose(); s.tex = null;
    s.mat.map = s.idle; s.mat.needsUpdate = true;
  }

  // ---- stream sound ----
  private wireAudio(s: Screen) {
    if (s.audio || !this.ctx || !s.video) return;
    let src: AudioNode | null = null;
    if (s.liveKey) {
      const a = s.liveKey === 'screen' ? this.tracks.screenAudio : this.tracks.ingressAudio;
      if (a?.mediaStreamTrack) src = this.ctx.createMediaStreamSource(new MediaStream([a.mediaStreamTrack]));
      s.video.muted = true; // live audio comes from its own track
    } else {
      try { src = this.ctx.createMediaElementSource(s.video); } catch { src = null; }
    }
    if (!src) return;
    // one screen plays a given live track's sound, so it isn't doubled
    if (s.liveKey && [...this.screens.values()].some(o => o !== s && o.audio && o.liveKey === s.liveKey)) return;
    const pan = new PannerNode(this.ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 6, rolloffFactor: 0.8, maxDistance: 60 });
    const gain = new GainNode(this.ctx, { gain: this.soundOn ? 1 : 0 });
    s.audio = { src, pan, gain };
    this.routeAudio(s);
  }
  private routeAudio(s: Screen) {
    const a = s.audio; if (!a || !this.ctx) return;
    try { a.src.disconnect(); a.pan.disconnect(); } catch { /* */ }
    if (this.positional) { a.src.connect(a.pan).connect(a.gain); } else a.src.connect(a.gain);
    a.gain.connect(this.ctx.destination);
  }
  /** Per frame: listener pose, and in room mode a softer level outside the hall. */
  update(listener: THREE.Object3D, inHall: boolean) {
    if (!this.ctx) return;
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), f = new THREE.Vector3(0, 0, -1), u = new THREE.Vector3(0, 1, 0);
    listener.getWorldPosition(p); listener.getWorldQuaternion(q); f.applyQuaternion(q); u.applyQuaternion(q);
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) { L.positionX.setTargetAtTime(p.x, t, 0.05); L.positionY.setTargetAtTime(p.y, t, 0.05); L.positionZ.setTargetAtTime(p.z, t, 0.05); L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z; }
    const wp = new THREE.Vector3();
    for (const s of this.screens.values()) {
      if (!s.audio) continue;
      s.mesh.getWorldPosition(wp);
      s.audio.pan.positionX.value = wp.x; s.audio.pan.positionY.value = wp.y; s.audio.pan.positionZ.value = wp.z;
      const target = !this.soundOn ? 0 : this.positional ? 1 : inHall ? 1 : 0.25;
      s.audio.gain.gain.setTargetAtTime(target, t, 0.2);
    }
  }

  // ---- LiveKit media room (viewer) ----
  private setStatus(s: string) { this.status = s; this.onStatus?.(s); }
  private async joinLive() {
    if (!this.o.tokenUrl) throw new Error('no media room configured');
    if (this.room) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      this.lk = await import('livekit-client');
      const res = await fetch(this.o.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity: this.o.identity(), name: this.o.name(), room: this.o.room, role: 'viewer' }) });
      if (!res.ok) throw new Error('media token refused (' + res.status + ')');
      const { token, url } = await res.json();
      const { Room, RoomEvent } = this.lk;
      const room = new Room({ adaptiveStream: true, dynacast: false });
      const refresh = () => { this.collect(room); this.assignLive(); };
      room.on(RoomEvent.TrackSubscribed, refresh);
      room.on(RoomEvent.TrackUnsubscribed, refresh);
      room.on(RoomEvent.ParticipantDisconnected, refresh);
      room.on(RoomEvent.Disconnected, () => { this.room = null; this.collect(null); this.assignLive(); });
      await room.connect(url, token, { autoSubscribe: true });
      this.room = room; refresh();
      this.setStatus('Live screens connected');
    })().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  private leaveLive() {
    if (!this.room) return;
    const r = this.room; this.room = null; this.collect(null);
    for (const s of this.screens.values()) if (s.liveKey) this.stop(s);
    r.disconnect().catch?.(() => { /* */ });
  }
  /** Find the newest screenshare and the ingress (RTMP) stream among everyone in the media room. */
  private collect(room: any) {
    const t = { screen: null as any, screenAudio: null as any, ingress: null as any, ingressAudio: null as any };
    if (room && this.lk) {
      const { Track } = this.lk;
      for (const p of room.remoteParticipants.values()) {
        const ingress = p.kind === 'ingress' || p.kind === 1 || /^ingress/i.test(p.identity);
        for (const pub of p.trackPublications.values()) {
          const tr = pub.track; if (!tr) continue;
          if (pub.source === Track.Source.ScreenShare) t.screen = tr;
          else if (pub.source === Track.Source.ScreenShareAudio) t.screenAudio = tr;
          else if (ingress && tr.kind === 'video') t.ingress = tr;
          else if (ingress && tr.kind === 'audio') t.ingressAudio = tr;
        }
      }
    }
    this.tracks = t;
  }
  private trackFor(key: string) { return key === 'screen' ? this.tracks.screen : key === 'ingress' ? this.tracks.ingress : null; }
  private assignLive() {
    for (const s of this.screens.values()) {
      if (s.src.kind !== 'live') continue;
      const want = s.src.track === 'auto' ? (this.tracks.screen ? 'screen' : this.tracks.ingress ? 'ingress' : '') : s.src.track;
      const tr = want ? this.trackFor(want) : null;
      if (tr && s.liveKey === want && s.video) continue;
      if (s.video) this.stop(s);
      if (!tr) { this.showIdle(s, !this.room ? 'Connecting to the live stream…' : want === 'screen' || s.src.track === 'screen' ? 'Waiting for the presenter to share…' : 'Waiting for the stream…'); continue; }
      const v = this.video(); tr.attach(v); s.liveKey = want; this.show(s, v); v.play().catch(() => { /* gesture */ });
    }
  }
  get statusText() { return this.status; }
}
