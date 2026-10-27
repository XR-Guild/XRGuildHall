import * as THREE from 'three';
import { Presence } from '../net/presence';
import { PhotonSession, PhotonTransport, RATE, VOICE_FRAME } from '../net/photon';
import { ViverseTransport, loadViverseSdk, VIVERSE_ROOM } from '../net/viverse';
import { newWalker, stepWalker, pickSpot, pickStageSpot, type Walker } from '../net/sim';
import { STAGE } from '../site';
import { synthSpeech, loadClip, speakingMask } from './speech';
import { CONFIG, loadConfig } from '../config';

/**
 * Headless voice load-test bots (Tier 2 in docs/PHOTON-VOICE-SPIKE.md): each bot is a full PhotonSession + PhotonTransport
 * with no 3D world, walking with the ?sim motion and talking by pushing a clip into its own outgoing voice.
 * The clip is pushed on a timer rather than captured: no microphone, and no running audio device (headless Chromium has none).
 *
 * ?room=  Photon room (required, so a test never lands in the live hall)
 * ?viverse=1  presence over the VIVERSE Play SDK (no login) and voice in the VIVERSE voice room, like a visitor to the VIVERSE build; ?room= is ignored
 * ?bots=  clients in this page          ?first= index of the first bot, for names across pages
 * ?mic=   fraction of bots with an open mic (0..1, default 1)
 * ?stage=1  bot 0 stands on the stage with the megaphone on
 * ?clip=   URL of an audio file to speak; {n} in it becomes the bot number, for a clip per bot (default: a synthesised speech-like clip)
 * ?region= Photon region (default VITE_PHOTON_REGION, else us)
 */
const Q = new URLSearchParams(location.search);
const VIVERSE = Q.get('viverse') === '1';
const ROOM = VIVERSE ? VIVERSE_ROOM : Q.get('room') ?? '';
const N = Math.max(1, parseInt(Q.get('bots') ?? '1', 10) || 1);
const FIRST = Math.max(0, parseInt(Q.get('first') ?? '0', 10) || 0);
const MIC = Math.min(1, Math.max(0, parseFloat(Q.get('mic') ?? '1')));
const STAGE_BOT = Q.get('stage') === '1' && FIRST === 0;
const APP_ID: string = import.meta.env.VITE_PHOTON_APP_ID || '';
const REGION: string = Q.get('region') || import.meta.env.VITE_PHOTON_REGION || 'us';
const TICK_MS = 50;
const FRAME_MS = VOICE_FRAME / RATE * 1000;

interface Bot {
  i: number; presence: Presence; session: PhotonSession; walker: Walker; stage: boolean; mic: boolean; state: string;
  /** outgoing voice, recreated when the session reconnects with a new client */
  clip: Float32Array; talking: Uint8Array; voice: { pushData(f: Float32Array): void } | null; voiceClient: any; clipAt: number; sent: number; since: number; pushed: number;
}
const bots: Bot[] = [];
const errors: string[] = [];
const out = document.getElementById('out')!;
// spreads open mics evenly over the global bot index, so every page gets its share
const micOpen = (i: number) => Math.floor((i + 1) * MIC) > Math.floor(i * MIC);
const pos = new THREE.Vector3();

async function start(i: number, clip: Float32Array) {
  const presence = new Presence(`Bot ${i + 1}`);
  // the first client into a room sets its capacity, so bots must use the same caps as the app or they lock visitors out
  const session = new PhotonSession(APP_ID, ROOM, REGION, { maxPlayers: CONFIG.photonMaxPlayers, verified: false, receive: false });
  const stage = STAGE_BOT && i === 0;
  const bot: Bot = {
    i, presence, session, walker: newWalker({ x: 0, y: 0, z: 0, ry: 0, seat: null }, stage ? pickStageSpot : pickSpot), stage, mic: micOpen(i), state: 'joining',
    clip, talking: speakingMask(clip, RATE), voice: null, voiceClient: null, clipAt: 0, sent: 0, since: 0, pushed: 0,
  };
  bots.push(bot);
  presence.listeners.add(() => { bot.state = presence.status; });
  if (VIVERSE) {
    // the Play SDK accepts a client that never logged in; the identity is only read by the app's own login flow
    const vt = new ViverseTransport(CONFIG.viverseAppId, { accountId: '', name: presence.self.name, vrmUrl: null, token: '', avatarClient: null }, CONFIG.viverseRoomCap);
    await presence.connect(vt);
    session.roomName = vt.voiceRoom;
    await session.connect(presence.self.id, presence.self.name);
  } else await presence.connect(new PhotonTransport(session));
  console.info(`[bots] bot ${i + 1} joined ${VIVERSE ? `VIVERSE (${presence.status})` : ROOM}${bot.mic ? ' · speaking' : ''}${stage ? ' · stage' : ''}`);
}

/** Push every frame that is due since the voice started, so a late timer catches up instead of drifting. */
function speak(b: Bot, now: number) {
  const c = b.session.client, clip = b.clip;
  if (!c?.isJoinedToRoom()) return;
  if (b.voiceClient !== c) {
    b.voice = b.session.createLocalVoice(); b.voiceClient = c;
    b.clipAt = Math.floor(Math.random() * clip.length); b.sent = 0; b.since = now; // bots start at different points in the clip
  }
  const due = Math.floor((now - b.since) / FRAME_MS);
  // after a long stall (a throttled page) skip ahead rather than flood the room
  if (due - b.sent > 10) b.sent = due - 1;
  for (; b.sent < due; b.sent++) {
    const f = new Float32Array(VOICE_FRAME);
    let talking = false;
    for (let k = 0; k < VOICE_FRAME; k++) { talking ||= b.talking[b.clipAt] === 1; f[k] = clip[b.clipAt++]; if (b.clipAt >= clip.length) b.clipAt = 0; }
    if (talking) { b.voice!.pushData(f); b.pushed++; }
  }
}

function tick(dt: number, now: number) {
  const taken = new Set<string | null>();
  for (const b of bots) {
    if (!b.presence.connected) continue;
    stepWalker(b.walker, dt, [], taken);
    const s = b.walker.s;
    // the shared walker only lifts people onto the stage near their target; the stage bot never leaves it
    pos.set(s.x, b.stage ? STAGE.h : s.y, s.z);
    b.presence.tick(pos, s.ry, now);
    if (b.stage && !b.presence.self.megaphone) b.presence.setMegaphone(true);
  }
}

function render() {
  const joined = bots.filter(b => b.session.client?.isJoinedToRoom()).length;
  const lines = bots.map(b => {
    const c = b.session.voiceCounts;
    return `Bot ${b.i + 1}${b.stage ? ' (stage, megaphone)' : ''}: ${b.state} · peers ${b.presence.peers.size} · voices in ${c.incoming}${b.mic ? ` · sent ${b.pushed} frames` : ' · mic closed'}`;
  });
  out.textContent = [`room ${ROOM} · ${joined}/${N} joined`, ...lines, ...errors].join('\n');
  (window as any).__bots = { room: ROOM, total: N, joined, errors: [...errors], framesSent: bots.reduce((n, b) => n + b.pushed, 0), fewestPeers: Math.min(...bots.map(b => b.presence.peers.size)),
    peers: bots.map(b => b.presence.peers.size), rooms: [...new Set(bots.map(b => (b.presence.transport as any)?.roomName ?? b.session.roomName))],
    // anyone who isn't a bot, so a run shows whether the person testing is in the bots' room
    people: [...new Set(bots.flatMap(b => [...b.presence.peers.values()].map(p => p.name)).filter(n => !/^Bot \d+$/.test(n)))] };
}

async function main() {
  if (!APP_ID) throw new Error('VITE_PHOTON_APP_ID is not set (.env.local)');
  await loadConfig();
  if (VIVERSE) {
    if (!CONFIG.viverseAppId) throw new Error('No VIVERSE App ID: set VITE_VIVERSE_APP_ID (.env.local) or viverseAppId (guildhall.config.json)');
    await loadViverseSdk();
  } else if (!ROOM || ROOM === VIVERSE_ROOM) throw new Error('Pass ?room=<private name>. Bots never join the live room.');
  const clipUrl = Q.get('clip');
  const shared = clipUrl?.includes('{n}') ? null : clipUrl ? await loadClip(clipUrl, RATE) : synthSpeech(12, RATE);
  const clipFor = async (i: number) => shared ?? loadClip(clipUrl!.replace('{n}', String(i + 1)), RATE);
  const fail = (i: number) => (e: any) => { errors.push(`Bot ${i + 1}: ${e?.message ?? e}`); console.error(`[bots] bot ${i + 1} failed`, e); };
  // one join at a time: clients in one page share the SDK's wasm core, and overlapping handshakes fail authentication
  for (let i = FIRST; i < FIRST + N; i++) await clipFor(i).then(clip => start(i, clip)).catch(fail(i));
  let last = performance.now();
  setInterval(() => { const now = performance.now(); tick(Math.min(0.5, (now - last) / 1000), now); last = now; }, TICK_MS);
  setInterval(() => { const now = performance.now(); for (const b of bots) if (b.mic) speak(b, now); }, FRAME_MS / 2);
}

setInterval(render, 1000);
main().catch(e => { errors.push(String(e?.message ?? e)); console.error('[bots]', e); render(); });
