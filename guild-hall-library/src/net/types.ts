import type { Zone } from '../site';

/** What each visitor shares while connected. Kept deliberately small: no gaze, no hands, no device data. */
export interface PeerState {
  id: string;
  name: string;
  x: number; y: number; z: number;
  ry: number;              // body yaw
  zone: Zone;
  seat: string | null;     // "hall:benches:12", "library:table:3" or "arrival:7"
  avatar: string | null;   // VRM url (from the Viverse Avatar SDK), or null for the mannequin
  color: number;           // mannequin tint
  onStage: boolean;
  megaphone: boolean;      // heard at full volume by everyone; only honoured while onStage
  away?: boolean;          // tab hidden: heartbeats may arrive slowly, so peers wait longer before dropping us
  t: number;               // sender clock, ms
}

export interface ChatMsg { id: string; from: string; name: string; text: string; t: number; zone: Zone; }

/** How voices carry across the room. Set by an admin for everyone (see docs/AUDIO.md). */
export const AUDIO_MODE_IDS = ['conversation', 'event', 'spotlight', 'stageOnly'] as const;
export type AudioMode = typeof AUDIO_MODE_IDS[number];
export const isAudioMode = (x: unknown): x is AudioMode => (AUDIO_MODE_IDS as readonly unknown[]).includes(x);

/** What a media screen shows. `idle` is the XR Guild slide; `hls` plays an HLS (.m3u8) or MP4 link; `live` shows the LiveKit media room (RTMP ingress or a presenter's screenshare). */
export type ScreenSource =
  | { kind: 'idle' }
  | { kind: 'hls'; url: string }
  | { kind: 'live'; track: 'screen' | 'ingress' | 'auto' };

/** Room-wide settings an admin controls. Late joiners ask for it with `hello` and an admin answers with `state`. */
export interface RoomState {
  seating: { hall: string; library: string };
  audio: AudioMode;
  spotlight: string[];                      // presence ids heard by everyone at full volume
  screens: Record<string, ScreenSource>;    // keyed by screen id: 'stage'
  screenAudio: 'room' | 'positional';
  v: number;                                // bumps on every change, so a stale answer never wins
}

/** `acct` is the sender's VIVERSE account ID, stamped in list mode (see docs/ADMIN.md). */
export type Control = (
  | { type: 'seating'; zone: 'hall' | 'library'; preset: string }
  | { type: 'muteHall' }
  | { type: 'audio'; mode: AudioMode }
  | { type: 'spotlight'; id: string; on: boolean }
  | { type: 'screen'; id: string; src: ScreenSource }
  | { type: 'screenAudio'; mode: 'room' | 'positional' }
  | { type: 'state'; state: RoomState }
  | { type: 'hello' }
) & { acct?: string };

export interface TransportEvents {
  onState: (s: PeerState) => void;
  onLeave: (id: string) => void;
  onChat: (m: ChatMsg) => void;
  /** `fromHost`: the sender is the room's master client (or, in verified mode, a signed-in admin). */
  onControl: (c: Control, from: string, fromHost: boolean) => void;
  onStatus: (text: string) => void;
}

export interface Transport {
  kind: 'viverse' | 'photon' | 'sim';
  label: string;
  connect(self: { id: string; name: string }, ev: TransportEvents): Promise<void>;
  sendState(s: PeerState): void;
  sendChat(m: ChatMsg): void;
  /** Sends unconditionally; main.ts decides who may send what. */
  sendControl(c: Control): void;
  /** True when this client is the room's master client (or, in verified mode, a signed-in admin). */
  isHost(): boolean;
  disconnect(): void;
}

export const PALETTE = [0x5fe0c6, 0xd8ae5a, 0xa791ff, 0xf07f6a, 0x7fb6ff, 0xe6d27a, 0x9be38b, 0xff9ec7];
