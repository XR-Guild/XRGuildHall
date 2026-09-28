import type { Transport, TransportEvents, PeerState, ChatMsg, Control } from './types';

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
const ROOM = 'guild-hall';
const CAP = 120;

function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    if ((globalThis as any).viverse) return res();
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error('Could not load the VIVERSE SDK'));
    document.head.appendChild(s);
  });
}

export interface ViverseIdentity { accountId: string; name: string; vrmUrl: string | null; token: string; avatarClient: any; }

/** Log in (or reuse the VIVERSE session) and read the visitor's profile. Returns null when not logged in. */
export async function viverseIdentity(appId: string, promptLogin: boolean): Promise<ViverseIdentity | null> {
  await loadScript(SDK);
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
  constructor(private appId: string, private identity: ViverseIdentity) {}

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
    const rooms: any[] = (list?.rooms ?? []).filter((r: any) => typeof r.name === 'string' && r.name.startsWith(ROOM) && !r.is_closed);
    rooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const open = rooms.find(r => (r.actors?.length ?? r.playerCount ?? 0) < (r.max_players ?? CAP));
    let room = open ? await mm.joinRoom(open.id) : null;
    if (!room || room.success === false) room = await mm.createRoom({ name: rooms.length ? `${ROOM}-${rooms.length + 1}` : ROOM, mode: 'Room', maxPlayers: CAP, minPlayers: 1, properties: {} });
    if (!room?.id) throw new Error(room?.message ?? 'Could not join a VIVERSE room');
    this.masterId = room.master_client_id ?? '';
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
      else if (msg.k === 'x' && msg.from && msg.from === this.masterId) ev.onControl(msg.v as Control, msg.from);
    });
    await mp.init({ modules: { networkSync: { enabled: false } } });
    ev.onStatus(`${room.name} on VIVERSE`);
  }
  private send(obj: any) { try { this.mp?.general.sendMessage(JSON.stringify(obj)); } catch { /* dropped */ } }
  sendState(s: PeerState) { this.send({ k: 's', v: s }); }
  sendChat(m: ChatMsg) { this.send({ k: 'c', v: m }); }
  sendControl(c: Control) { if (this.isHost()) this.send({ k: 'x', v: c, from: this.selfId }); }
  isHost() { return !!this.selfId && this.selfId === this.masterId; }
  disconnect() { try { this.mp?.disconnect(); } catch { /* */ } try { this.mm?.leaveRoom(); this.mm?.disconnect(); } catch { /* */ } }
}
