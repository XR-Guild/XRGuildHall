import type { Transport, TransportEvents, PeerState, ChatMsg, Control } from './types';
import { loadScript } from './loadScript';

/**
 * VIVERSE Play SDK transport (docs.viverse.com → Matchmaking & Networking SDK, JS SDK 1.3.3).
 *  - login via the VIVERSE client (needs an App ID from VIVERSE Studio)
 *  - name + active VRM from the Avatar SDK
 *  - matchmaking: join the shared "guild-hall" room, or create it; overflow rooms "guild-hall-2", "-3" … when full
 *  - multiplayer: general.sendMessage for our compact JSON state/chat/control messages
 *
 * Only the room's master client may send room controls (seating layout, "mute the hall"), and
 * receivers check that before applying them.
 *
 * A failed join is retried with backoff for up to a minute before we open a room of our own, because a
 * hiccup that sends each visitor to a fresh room splits the Hall. If that still happens, anyone alone in
 * a room moves to the busiest guild-hall room with space.
 */
const SDK = 'https://www.viverse.com/static-assets/viverse-sdk/1.3.3/index.umd.cjs';
/** The VIVERSE room, and the Photon voice room every VIVERSE visitor joins. */
export const VIVERSE_ROOM = 'guild-hall';

const CONNECT_WAIT_MS = 4000;
const RETRY_WINDOW_MS = 60_000;
const RETRY_FIRST_MS = 1000;
const RETRY_MAX_MS = 15_000;
const MERGE_CHECK_MS = 20_000;

/**
 * VIVERSE asked us to measure how long their services take to answer, so every SDK call and event wait is timed.
 * Filter the console for "[VIVERSE timing]", or read `window.__viverseTimings`.
 */
export interface ViverseTiming { seq: number; step: string; ms: number; ok: boolean; detail?: string; at: string }
const timings: ViverseTiming[] = ((globalThis as any).__viverseTimings ??= []);
let seq = 0;
function record(step: string, t0: number, ok: boolean, detail = '') {
  const t: ViverseTiming = { seq: seq++, step, ms: Math.round(performance.now() - t0), ok, detail: detail || undefined, at: new Date().toISOString() };
  timings.push(t);
  if (timings.length > 1000) timings.shift();
  console.info(`[VIVERSE timing] ${step}: ${t.ms} ms${ok ? '' : ' (failed)'}${detail ? ` · ${detail}` : ''}`);
}
async function timed<T>(step: string, f: () => T | Promise<T>, detail = ''): Promise<T> {
  const t0 = performance.now();
  try {
    const r: any = await f();
    const failed = r?.success === false;
    record(step, t0, !failed, failed ? [detail, r?.message].filter(Boolean).join(' · ') : detail);
    return r;
  } catch (e: any) { record(step, t0, false, [detail, e?.message ?? String(e)].filter(Boolean).join(' · ')); throw e; }
}
/** One line per join or move: the total, and each step that made it up. */
function summarize(label: string, t0: number, fromSeq: number) {
  const steps = timings.filter(t => t.seq >= fromSeq).map(t => `${t.step} ${t.ms}${t.ok ? '' : '✗'}`).join(', ');
  record(label, t0, true, steps);
}

const headcount = (r: any): number => r.actors?.length ?? r.playerCount ?? 0;

export interface ViverseIdentity { accountId: string; name: string; vrmUrl: string | null; token: string; avatarClient: any; }

export const loadViverseSdk = () => timed('load SDK', () => loadScript(SDK, () => !!(globalThis as any).viverse, 'Could not load the VIVERSE SDK'));

/** Log in (or reuse the VIVERSE session) and read the visitor's profile. Returns null when not logged in. */
export async function viverseIdentity(appId: string, promptLogin: boolean): Promise<ViverseIdentity | null> {
  await loadViverseSdk();
  const V = (globalThis as any).viverse;
  const client = new V.client({ clientId: appId, domain: 'account.htcvive.com' });
  const auth = await timed('checkAuth', () => client.checkAuth());
  if (!auth?.access_token) { if (promptLogin) client.loginWithWorlds(); return null; }
  const token = (await timed('getToken', () => client.getToken?.())) ?? auth.access_token;
  const avatarClient = new V.avatar({ baseURL: 'https://sdk-api.viverse.com/', token });
  let name = 'Guest', vrmUrl: string | null = null;
  try { const p = await timed('getProfile', () => avatarClient.getProfile()); name = p?.name || name; vrmUrl = p?.activeAvatar?.vrmUrl ?? null; } catch { /* profile optional */ }
  return { accountId: auth.account_id, name, vrmUrl, token, avatarClient };
}

export class ViverseTransport implements Transport {
  kind = 'viverse' as const;
  label = 'VIVERSE room';
  private play: any = null; private mm: any = null; private mp: any = null; private masterId = ''; private selfId = ''; private selfName = '';
  private ev!: TransportEvents;
  private mmConnected = false; private roomId = ''; private actors = 0;
  private closed = false; private moving = false; private mergeTimer = 0; private wake: (() => void) | null = null;
  /** The VIVERSE room we landed in ("guild-hall", or an overflow room "guild-hall-2" …). */
  roomName = VIVERSE_ROOM;
  /** Called after we move rooms to join others, so voice can follow to the new room's voiceRoom. */
  onRoomChange: ((from: string) => void) | null = null;
  /** Photon voice room for this VIVERSE room. Worlds share a Photon app and room names, so the App ID keeps their voice apart. */
  get voiceRoom() { return `${this.appId}:${this.roomName}`; }
  /**
   * `cap` people per room before overflow; keep it at or below the Photon voice room size so everyone in a room can talk.
   * `merge` off keeps a lone client where it is (load-test bots must not wander into a visitor's room).
   */
  constructor(private appId: string, private identity: ViverseIdentity, private cap = 20, private merge = true) {}

  async connect(self: { id: string; name: string }, ev: TransportEvents) {
    this.selfId = self.id; this.selfName = self.name; this.ev = ev;
    const t0 = performance.now(), from = seq;
    this.play = new (globalThis as any).viverse.play();
    ev.onStatus('Joining the Guild Hall on VIVERSE…');
    await this.openMatchmaking();
    await this.attach(await this.findOrCreateRoom());
    summarize(`joined ${this.roomName}`, t0, from);
    if (this.merge) this.mergeTimer = window.setInterval(() => void this.mergeIfAlone(), MERGE_CHECK_MS);
  }

  private async openMatchmaking() {
    try { this.mm?.disconnect(); } catch { /* already gone */ }
    const mm = await timed('newMatchmakingClient', () => this.play.newMatchmakingClient(this.appId));
    this.mm = mm; this.mmConnected = false;
    const t0 = performance.now();
    // onConnect doesn't always arrive, so we go on after a wait; an empty room list before it counts as a failure (findOrCreateRoom)
    await new Promise<void>(res => {
      let waiting = true;
      mm.on('onConnect', () => { if (this.mm === mm) this.mmConnected = true; record('matchmaking onConnect', t0, true, waiting ? '' : 'after the wait'); waiting = false; res(); });
      setTimeout(() => { if (waiting) { waiting = false; record('matchmaking onConnect', t0, false, `no event within ${CONNECT_WAIT_MS} ms`); } res(); }, CONNECT_WAIT_MS);
    });
    mm.on('onError', (e: any) => { if (this.mm === mm) this.ev.onStatus('VIVERSE: ' + (e?.message ?? 'error')); });
    mm.on('onRoomActorChange', (actors: any[]) => {
      if (this.mm !== mm) return;
      this.actors = actors.length;
      const m = actors.find(a => a.is_master_client); if (m) this.masterId = m.session_id;
    });
    // our presence id doubles as the VIVERSE session id so voice, chat and position all line up
    await timed('setActor', () => mm.setActor({ session_id: this.selfId, name: this.selfName, properties: {} }));
  }

  private async listRooms(): Promise<any[]> {
    const list: any = await timed('getAvailableRooms', () => this.mm.getAvailableRooms());
    // SDK 1.3.3 returns the array itself, although the docs show { success, rooms }
    const rooms = Array.isArray(list) ? list : list?.rooms;
    if (!Array.isArray(rooms)) throw new Error(list?.message ?? 'Room list unavailable');
    return rooms.filter((r: any) => typeof r.name === 'string' && r.name.startsWith(VIVERSE_ROOM) && !r.is_closed);
  }
  private roomCap(r: any) { return Math.min(r.max_players ?? this.cap, this.cap); }
  private ok(room: any) { return !!room?.id && room.success !== false; }

  private createRoom(rooms: any[]) {
    const names = new Set(rooms.map(r => r.name));
    let name = VIVERSE_ROOM;
    for (let n = 2; names.has(name); n++) name = `${VIVERSE_ROOM}-${n}`;
    return timed('createRoom', () => this.mm.createRoom({ name, mode: 'Room', maxPlayers: this.cap, minPlayers: 1, properties: {} }), name);
  }

  /** Join the first guild-hall room with space, or create one when there is none. Errors are retried, not answered with a new room. */
  private async findOrCreateRoom(): Promise<any> {
    const start = performance.now();
    let delay = RETRY_FIRST_MS, rooms: any[] = [], attempt = 0;
    for (;;) {
      this.checkOpen(); attempt++;
      try {
        if (attempt > 1 && !this.mmConnected) await this.openMatchmaking();
        rooms = await this.listRooms();
        if (!rooms.length && !this.mmConnected) throw new Error('matchmaking not connected, room list may be incomplete');
        rooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        const open = rooms.find(r => headcount(r) < this.roomCap(r));
        const room = open ? await timed('joinRoom', () => this.mm.joinRoom(open.id), open.name) : await this.createRoom(rooms);
        if (this.ok(room)) return room;
        throw new Error(room?.message ?? (open ? `could not join ${open.name}` : 'could not create a room'));
      } catch (e: any) {
        this.checkOpen();
        if (performance.now() - start + delay > RETRY_WINDOW_MS) { console.warn(`[VIVERSE] join failed for ${RETRY_WINDOW_MS / 1000} s (${e?.message ?? e}); opening a room of our own`); break; }
        const wait = delay * (0.75 + Math.random() * 0.5); // jitter, so a crowd that failed together doesn't retry together
        console.warn(`[VIVERSE] join attempt ${attempt} failed (${e?.message ?? e}); retrying in ${(wait / 1000).toFixed(1)} s`);
        this.ev.onStatus(`VIVERSE is slow to answer. Retrying in ${Math.ceil(wait / 1000)} s…`);
        await this.sleep(wait);
        delay = Math.min(delay * 2, RETRY_MAX_MS);
      }
    }
    const room = await this.createRoom(rooms);
    if (!this.ok(room)) throw new Error(room?.message ?? 'Could not join a VIVERSE room');
    return room;
  }

  private async attach(room: any) {
    const G = globalThis as any, ev = this.ev;
    this.roomId = String(room.id);
    this.masterId = room.master_client_id ?? '';
    this.roomName = room.name ?? VIVERSE_ROOM;
    this.actors = headcount(room) || 1;
    const MP = G.play?.MultiplayerClient ?? G.viverse?.play?.MultiplayerClient ?? this.play.MultiplayerClient;
    const mp = MP ? new MP(room.id, this.appId, this.selfId) : await this.play.newMultiplayerClient?.(room.id, this.appId, this.selfId);
    if (!mp) throw new Error('VIVERSE multiplayer client unavailable');
    this.mp = mp;
    const t0 = performance.now();
    mp.onConnected?.(() => { record('multiplayer onConnected', t0, true, room.name); if (this.mp === mp) ev.onStatus(`${room.name} on VIVERSE`); });
    mp.onClientDisconnected?.((id: string) => { if (this.mp === mp) ev.onLeave(id); });
    mp.general.onMessage((raw: any) => {
      if (this.mp !== mp) return;
      let msg: any; try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.k === 's' && msg.v?.id) ev.onState(msg.v as PeerState);
      else if (msg.k === 'c' && msg.v?.from) ev.onChat(msg.v as ChatMsg);
      // `general` messages carry no verified sender. Room controls are only trusted from the master client here, and
      // when Photon voice is connected main.ts ignores this channel for everything but `hello` (see docs/ADMIN.md).
      else if (msg.k === 'x' && msg.from && (msg.from === this.masterId || msg.v?.type === 'hello')) ev.onControl(msg.v as Control, msg.from);
    });
    await timed('multiplayer init', () => mp.init({ modules: { networkSync: { enabled: false } } }), room.name);
    ev.onStatus(`${room.name} on VIVERSE`);
  }

  /** Alone in our room: move to the busiest guild-hall room with space. Two lone visitors meet in the room with the lower id. */
  private async mergeIfAlone() {
    if (this.closed || this.moving || this.actors > 1 || !this.mp) return;
    this.moving = true;
    try {
      const rooms = await this.listRooms();
      const mine = rooms.find(r => String(r.id) === this.roomId);
      const here = Math.max(mine ? headcount(mine) : 1, 1);
      if (here > 1 || this.actors > 1) return;
      const target = rooms
        .filter(r => String(r.id) !== this.roomId && headcount(r) < this.roomCap(r) && (headcount(r) > here || (headcount(r) === here && String(r.id) < this.roomId)))
        .sort((a, b) => headcount(b) - headcount(a) || (String(a.id) < String(b.id) ? -1 : 1))[0];
      if (target && !this.closed && this.actors <= 1) await this.moveTo(target);
    } catch (e: any) { if (!this.closed) console.warn('[VIVERSE] merge check failed', e?.message ?? e); }
    finally { this.moving = false; }
  }

  private async moveTo(target: any) {
    const t0 = performance.now(), from = seq, fromRoom = this.roomName;
    console.info(`[VIVERSE] alone in ${fromRoom}; moving to ${target.name} (${headcount(target)} people)`);
    this.ev.onStatus(`Moving you to ${target.name}, where others are…`);
    const old = this.mp; this.mp = null;
    try { old?.disconnect(); } catch { /* already gone */ }
    try { await timed('leaveRoom', () => this.mm.leaveRoom(), fromRoom); } catch { /* we still try to join */ }
    this.checkOpen();
    let room: any = null;
    try { room = await timed('joinRoom', () => this.mm.joinRoom(target.id), target.name); } catch { /* fall back below */ }
    // the target filled up or closed while we moved: the normal join (with its retries) still lands us somewhere
    if (!this.ok(room)) room = await this.findOrCreateRoom();
    this.checkOpen();
    await this.attach(room);
    summarize(`moved ${fromRoom} → ${this.roomName}`, t0, from);
    this.onRoomChange?.(fromRoom);
  }

  private checkOpen() { if (this.closed) throw new Error('Left before joining'); }
  /** A wait that Leave cuts short. */
  private sleep(ms: number) {
    return new Promise<void>(res => {
      const done = () => { clearTimeout(t); this.wake = null; res(); };
      const t = setTimeout(done, ms);
      this.wake = done;
    });
  }

  private send(obj: any) { try { this.mp?.general.sendMessage(JSON.stringify(obj)); } catch { /* dropped */ } }
  sendState(s: PeerState) { this.send({ k: 's', v: s }); }
  sendChat(m: ChatMsg) { this.send({ k: 'c', v: m }); }
  sendControl(c: Control) { if (c.type === 'hello' || this.isHost()) this.send({ k: 'x', v: c, from: this.selfId }); }
  isHost() { return !!this.selfId && this.selfId === this.masterId; }
  disconnect() {
    this.closed = true; clearInterval(this.mergeTimer); this.onRoomChange = null; this.wake?.();
    try { this.mp?.disconnect(); } catch { /* */ }
    try { this.mm?.leaveRoom(); this.mm?.disconnect(); } catch { /* */ }
  }
}
