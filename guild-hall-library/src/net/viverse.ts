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
 */
const SDK = 'https://www.viverse.com/static-assets/viverse-sdk/1.3.3/index.umd.cjs';
/** The VIVERSE room, and the Photon voice room every VIVERSE visitor joins. */
export const VIVERSE_ROOM = 'guild-hall';

export interface ViverseIdentity { accountId: string; name: string; vrmUrl: string | null; token: string; avatarClient: any; }

export const loadViverseSdk = () => loadScript(SDK, () => !!(globalThis as any).viverse, 'Could not load the VIVERSE SDK');

/** Log in (or reuse the VIVERSE session) and read the visitor's profile. Returns null when not logged in. */
export async function viverseIdentity(appId: string, promptLogin: boolean): Promise<ViverseIdentity | null> {
  await loadViverseSdk();
  const V = (globalThis as any).viverse;
  const client = new V.client({ clientId: appId, domain: 'account.htcvive.com' });
  const auth = await client.checkAuth();
  if (!auth?.access_token) { if (promptLogin) client.loginWithWorlds(); return null; }
  const token = (await client.getToken?.()) ?? auth.access_token;
  const avatarClient = new V.avatar({ baseURL: 'https://sdk-api.viverse.com/', token });
  let name = 'Guest', vrmUrl: string | null = null;
  try { const p = await avatarClient.getProfile(); name = p?.name || name; vrmUrl = p?.activeAvatar?.vrmUrl ?? null; } catch { /* profile optional */ }
  return { accountId: auth.account_id, name, vrmUrl, token, avatarClient };
}

export class ViverseTransport implements Transport {
  kind = 'viverse' as const;
  label = 'VIVERSE room';
  private mm: any = null; private mp: any = null; private masterId = ''; private selfId = '';
  /** The VIVERSE room we landed in ("guild-hall", or an overflow room "guild-hall-2" …). */
  roomName = VIVERSE_ROOM;
  /** Photon voice room for this VIVERSE room. Worlds share a Photon app and room names, so the App ID keeps their voice apart. */
  get voiceRoom() { return `${this.appId}:${this.roomName}`; }
  /** `cap` people per room before overflow; keep it at or below the Photon voice room size so everyone in a room can talk. */
  constructor(private appId: string, private identity: ViverseIdentity, private cap = 20) {}

  async connect(self: { id: string; name: string }, ev: TransportEvents) {
    this.selfId = self.id;
    const G = globalThis as any;
    const play = new G.viverse.play();
    ev.onStatus('Joining the Guild Hall on VIVERSE…');
    const mm = await play.newMatchmakingClient(this.appId); this.mm = mm;
    await new Promise<void>(res => { let done = false; mm.on('onConnect', () => { if (!done) { done = true; res(); } }); setTimeout(() => { if (!done) { done = true; res(); } }, 4000); });
    mm.on('onError', (e: any) => ev.onStatus('VIVERSE: ' + (e?.message ?? 'error')));
    mm.on('onRoomActorChange', (actors: any[]) => { const m = actors.find(a => a.is_master_client); if (m) this.masterId = m.session_id; });
    // our presence id doubles as the VIVERSE session id so voice, chat and position all line up
    await mm.setActor({ session_id: self.id, name: self.name, properties: {} });
    const list = await mm.getAvailableRooms();
    // SDK 1.3.3 returns the array itself, although the docs show { success, rooms }
    const rooms: any[] = (Array.isArray(list) ? list : list?.rooms ?? []).filter((r: any) => typeof r.name === 'string' && r.name.startsWith(VIVERSE_ROOM) && !r.is_closed);
    rooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const CAP = this.cap;
    const open = rooms.find(r => (r.actors?.length ?? r.playerCount ?? 0) < Math.min(r.max_players ?? CAP, CAP));
    let room = open ? await mm.joinRoom(open.id) : null;
    if (!room || room.success === false) room = await mm.createRoom({ name: rooms.length ? `${VIVERSE_ROOM}-${rooms.length + 1}` : VIVERSE_ROOM, mode: 'Room', maxPlayers: CAP, minPlayers: 1, properties: {} });
    if (!room?.id) throw new Error(room?.message ?? 'Could not join a VIVERSE room');
    this.masterId = room.master_client_id ?? '';
    this.roomName = room.name ?? VIVERSE_ROOM;
    const MP = G.play?.MultiplayerClient ?? G.viverse?.play?.MultiplayerClient ?? play.MultiplayerClient;
    const mp = MP ? new MP(room.id, this.appId, self.id) : await play.newMultiplayerClient?.(room.id, this.appId, self.id);
    if (!mp) throw new Error('VIVERSE multiplayer client unavailable');
    this.mp = mp;
    mp.onConnected?.(() => ev.onStatus(`${room.name} on VIVERSE`));
    mp.onClientDisconnected?.((id: string) => ev.onLeave(id));
    mp.general.onMessage((raw: any) => {
      let msg: any; try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.k === 's' && msg.v?.id) ev.onState(msg.v as PeerState);
      else if (msg.k === 'c' && msg.v?.from) ev.onChat(msg.v as ChatMsg);
      // `general` messages carry no verified sender. Room controls are only trusted from the master client here, and
      // when Photon voice is connected main.ts ignores this channel for everything but `hello` (see docs/ADMIN.md).
      else if (msg.k === 'x' && msg.from && (msg.from === this.masterId || msg.v?.type === 'hello')) ev.onControl(msg.v as Control, msg.from);
    });
    await mp.init({ modules: { networkSync: { enabled: false } } });
    ev.onStatus(`${room.name} on VIVERSE`);
  }
  private send(obj: any) { try { this.mp?.general.sendMessage(JSON.stringify(obj)); } catch { /* dropped */ } }
  sendState(s: PeerState) { this.send({ k: 's', v: s }); }
  sendChat(m: ChatMsg) { this.send({ k: 'c', v: m }); }
  sendControl(c: Control) { if (c.type === 'hello' || this.isHost()) this.send({ k: 'x', v: c, from: this.selfId }); }
  isHost() { return !!this.selfId && this.selfId === this.masterId; }
  disconnect() { try { this.mp?.disconnect(); } catch { /* */ } try { this.mm?.leaveRoom(); this.mm?.disconnect(); } catch { /* */ } }
}
