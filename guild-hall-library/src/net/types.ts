import type { Zone } from '../site';

/** What each visitor shares while connected. Kept deliberately small: no gaze, no hands, no device data. */
export interface PeerState {
  id: string;
  name: string;
  x: number; y: number; z: number;
  ry: number;              // body yaw
  zone: Zone;
  seat: string | null;     // "hall:12" or "library:3"
  avatar: string | null;   // VRM url (from the Viverse Avatar SDK), or null for the mannequin
  color: number;           // mannequin tint
  onStage: boolean;
  t: number;               // sender clock, ms
}

export interface ChatMsg { id: string; from: string; name: string; text: string; t: number; zone: Zone; }

export type Control =
  | { type: 'seating'; zone: 'hall' | 'library'; preset: string }
  | { type: 'muteHall' }
  | { type: 'hello' };

export interface TransportEvents {
  onState: (s: PeerState) => void;
  onLeave: (id: string) => void;
  onChat: (m: ChatMsg) => void;
  onControl: (c: Control, from: string) => void;
  onStatus: (text: string) => void;
}

export interface Transport {
  kind: 'viverse' | 'livekit' | 'sim';
  label: string;
  connect(self: { id: string; name: string }, ev: TransportEvents): Promise<void>;
  sendState(s: PeerState): void;
  sendChat(m: ChatMsg): void;
  sendControl(c: Control): void;
  isHost(): boolean;
  disconnect(): void;
}

export const PALETTE = [0x5fe0c6, 0xd8ae5a, 0xa791ff, 0xf07f6a, 0x7fb6ff, 0xe6d27a, 0x9be38b, 0xff9ec7];
