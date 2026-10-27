import type { Control, RoomState, AudioMode, ScreenSource } from './net/types';

/**
 * Room-wide settings that every visitor shares: seating, audio mode, spotlights and media screens.
 *
 * - Only an admin (see docs/ADMIN.md) can change them. Each change is broadcast as the whole state, stamped with
 *   a version (the admin's clock), so the newest change wins and a late or repeated message is harmless.
 * - A visitor who joins late sends `hello`; any admin in the room answers with the current state after a short
 *   random delay, so a room with several admins doesn't answer in a burst.
 * - Solo (not connected), you can try every setting locally.
 */
export const SCREEN_IDS = ['stage', 'west', 'east'] as const;
export type ScreenId = typeof SCREEN_IDS[number];

export function defaultState(d: { hallSeating: string; librarySeating: string; audio: AudioMode }): RoomState {
  return {
    seating: { hall: d.hallSeating, library: d.librarySeating },
    audio: d.audio,
    spotlight: [],
    screens: Object.fromEntries(SCREEN_IDS.map(id => [id, { kind: 'idle' } as ScreenSource])),
    screenAudio: 'room',
    v: 0,
  };
}

const AUDIO: AudioMode[] = ['conversation', 'event', 'spotlight'];
const okUrl = (u: unknown) => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u) && u.length < 600;

/** Never trust the shape of a message from the network: rebuild the state from known fields only. */
export function sanitize(raw: any, base: RoomState): RoomState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s: RoomState = structuredClone(base);
  if (raw.seating && typeof raw.seating === 'object') {
    if (typeof raw.seating.hall === 'string') s.seating.hall = raw.seating.hall.slice(0, 24);
    if (typeof raw.seating.library === 'string') s.seating.library = raw.seating.library.slice(0, 24);
  }
  if (AUDIO.includes(raw.audio)) s.audio = raw.audio;
  if (Array.isArray(raw.spotlight)) s.spotlight = raw.spotlight.filter((x: unknown) => typeof x === 'string').slice(0, 12).map((x: string) => x.slice(0, 40));
  if (raw.screens && typeof raw.screens === 'object') {
    for (const id of SCREEN_IDS) {
      const src = raw.screens[id]; if (!src) continue;
      if (src.kind === 'idle') s.screens[id] = { kind: 'idle' };
      else if (src.kind === 'hls' && okUrl(src.url)) s.screens[id] = { kind: 'hls', url: src.url };
      else if (src.kind === 'live' && ['screen', 'ingress', 'auto'].includes(src.track)) s.screens[id] = { kind: 'live', track: src.track };
    }
  }
  if (raw.screenAudio === 'room' || raw.screenAudio === 'positional') s.screenAudio = raw.screenAudio;
  s.v = typeof raw.v === 'number' && isFinite(raw.v) ? raw.v : base.v;
  return s;
}

export interface RoomHooks {
  /** May this client change room settings right now? */
  canAdmin: () => boolean;
  /** Is this client connected to others? */
  connected: () => boolean;
  send: (c: Control) => void;
  /** Apply a state to the world. `by` is 'me' for local changes, 'remote' for an admin's change. */
  apply: (s: RoomState, prev: RoomState, by: 'me' | 'remote') => void;
  /** An admin asked the hall to mute. */
  onMuteHall: () => void;
}

export class Room {
  state: RoomState;
  listeners = new Set<() => void>();
  private answerTimer = 0;
  constructor(defaults: RoomState, private h: RoomHooks) { this.state = defaults; }
  emit() { this.listeners.forEach(f => f()); }

  /** Change settings (admins, or anyone while solo). Returns false when not allowed. */
  change(patch: (s: RoomState) => void) {
    if (!this.h.canAdmin()) return false;
    const prev = this.state, next = structuredClone(prev);
    patch(next); next.v = Math.max(Date.now(), prev.v + 1);
    this.state = next; this.h.apply(next, prev, 'me'); this.emit();
    if (this.h.connected()) this.h.send({ type: 'state', state: next });
    return true;
  }
  setSeating(zone: 'hall' | 'library', preset: string) { return this.change(s => { s.seating[zone] = preset; }); }
  setAudio(mode: AudioMode) { return this.change(s => { s.audio = mode; }); }
  setSpotlight(id: string, on: boolean) { return this.change(s => { s.spotlight = on ? [...new Set([...s.spotlight, id])] : s.spotlight.filter(x => x !== id); }); }
  clearSpotlights() { return this.change(s => { s.spotlight = []; }); }
  setScreen(id: string, src: ScreenSource) { return this.change(s => { s.screens[id] = src; }); }
  setScreenAudio(mode: 'room' | 'positional') { return this.change(s => { s.screenAudio = mode; }); }
  muteHall() { if (this.h.canAdmin() && this.h.connected()) this.h.send({ type: 'muteHall' }); }

  /** Call right after connecting: ask an admin for the current settings. */
  hello() { this.h.send({ type: 'hello' }); }

  /** Controls from the network. The transports only pass admin controls from verified admins (or the host). */
  receive(c: Control) {
    if (!c || typeof c !== 'object') return;
    if (c.type === 'hello') {
      if (!this.h.canAdmin() || !this.h.connected()) return;
      clearTimeout(this.answerTimer);
      this.answerTimer = window.setTimeout(() => this.h.send({ type: 'state', state: this.state }), 200 + Math.random() * 900);
      return;
    }
    if (c.type === 'state') {
      clearTimeout(this.answerTimer); // another admin answered already
      const next = sanitize(c.state, this.state);
      if (!next || next.v <= this.state.v) return;
      const prev = this.state; this.state = next; this.h.apply(next, prev, 'remote'); this.emit();
      return;
    }
    if (c.type === 'muteHall') { this.h.onMuteHall(); return; }
    // single-setting controls from older builds (v2/v3 and the load-test bots)
    const prev = this.state, next = structuredClone(prev);
    if (c.type === 'seating' && (c.zone === 'hall' || c.zone === 'library')) next.seating[c.zone] = String(c.preset).slice(0, 24);
    else if (c.type === 'audio' && AUDIO.includes(c.mode)) next.audio = c.mode;
    else if (c.type === 'spotlight' && typeof c.id === 'string') next.spotlight = c.on ? [...new Set([...next.spotlight, c.id])] : next.spotlight.filter(x => x !== c.id);
    else if (c.type === 'screenAudio') next.screenAudio = c.mode === 'positional' ? 'positional' : 'room';
    else if (c.type === 'screen') { const s = sanitize({ screens: { [c.id]: c.src } }, next); if (s) next.screens = s.screens; }
    else return;
    next.v = prev.v + 1;
    this.state = next; this.h.apply(next, prev, 'remote'); this.emit();
  }
}
