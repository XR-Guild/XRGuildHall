/**
 * Runtime configuration for the Guild Hall.
 *
 * Two layers, so the team can change event settings without a rebuild:
 *  1. Build-time env (VITE_*), baked into the bundle. See .env.example.
 *  2. `guildhall.config.json` next to index.html, fetched at startup. Anything set there wins.
 *
 * Nothing in either layer is secret: both ship to every visitor. Passphrases and API secrets live only in
 * the Cloudflare Workers in proxy/ (see docs/ADMIN.md and docs/MEDIA.md).
 */
import type { AudioMode } from './net/types';

export interface HallConfig {
  /** Photon Voice App ID (dashboard.photonengine.com, app type Voice). Empty = no voice. */
  photonAppId: string;
  photonRegion: string;
  /** People per Photon voice room. Match your Photon plan's CCU (the free plan is 20). */
  photonMaxPlayers: number;
  /**
   * 'verified': the Photon app uses Custom Authentication (proxy/photon-auth-worker.js), and only people who
   * signed in with an admin passphrase can change room settings. Photon stamps every event with the sender,
   * so this can't be spoofed.
   * 'host': no auth worker; the room's master client (usually the first person in) acts as host.
   */
  adminMode: 'verified' | 'host';
  /** VIVERSE Studio App ID. Empty = no VIVERSE login or shared VIVERSE room. */
  viverseAppId: string;
  /** People per VIVERSE room before the overflow room opens. Keep it at or below photonMaxPlayers. */
  viverseRoomCap: number;
  /** LiveKit media room for stream screens and screenshare (video only; voice stays on Photon). */
  media: {
    tokenUrl: string;          // proxy/media-token-worker.js. Empty = no live screens (HLS links still work).
    room: string;              // LiveKit room the RTMP ingress and presenters publish into
    hlsDefault: string;        // optional HLS link pre-filled in the admin panel
  };
  /** Room defaults, used until an admin changes them. */
  defaults: { hallSeating: string; librarySeating: string; audio: AudioMode };
  /** Optional: answers from the library's GitBook assistant (proxy/ask-worker.js). */
  askProxy: string;
  links: { home: string; library: string; timeline: string; join: string; calendar: string; conduct: string };
}

const env = import.meta.env;
export const CONFIG: HallConfig = {
  photonAppId: env.VITE_PHOTON_APP_ID || '',
  photonRegion: env.VITE_PHOTON_REGION || 'us',
  photonMaxPlayers: parseInt(env.VITE_PHOTON_MAX_PLAYERS || '20', 10) || 20,
  adminMode: env.VITE_ADMIN_MODE === 'verified' ? 'verified' : 'host',
  viverseAppId: env.VITE_VIVERSE_APP_ID || '',
  viverseRoomCap: parseInt(env.VITE_VIVERSE_ROOM_CAP || '0', 10) || 0,
  media: { tokenUrl: env.VITE_MEDIA_TOKEN_URL || '', room: env.VITE_MEDIA_ROOM || 'guild-hall-media', hlsDefault: '' },
  defaults: { hallSeating: 'benches', librarySeating: 'table', audio: 'conversation' },
  askProxy: env.VITE_ASK_PROXY || '',
  links: {
    home: 'https://www.xrguild.org',
    library: 'https://library.xrguild.org',
    timeline: 'https://www.xrguild.org/timeline',
    join: 'https://www.xrguild.org/join',
    calendar: 'https://www.xrguild.org/calendar',
    conduct: 'https://www.xrguild.org/principles',
  },
};

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
function merge(into: any, from: any) {
  for (const [k, v] of Object.entries(from)) {
    if (k.startsWith('_')) continue; // "_comment" keys in the JSON
    if (v === '' || v === null || v === 0) continue; // blank = keep the build-time (env) value
    if (isObj(v) && isObj(into[k])) merge(into[k], v);
    else if (k in into && typeof v === typeof into[k]) into[k] = v;
  }
}

/** Fetch guildhall.config.json (if present) and fold it into CONFIG. Never throws. */
export async function loadConfig() {
  try {
    const r = await fetch('guildhall.config.json', { cache: 'no-store' });
    if (r.ok) merge(CONFIG, await r.json());
  } catch { /* optional file */ }
  if (CONFIG.adminMode !== 'verified') CONFIG.adminMode = 'host';
  if (!CONFIG.viverseRoomCap) CONFIG.viverseRoomCap = CONFIG.photonMaxPlayers;
  CONFIG.viverseRoomCap = Math.min(CONFIG.viverseRoomCap, CONFIG.photonMaxPlayers);
  return CONFIG;
}
