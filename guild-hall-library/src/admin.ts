import type { Room } from './room';
import { SCREEN_IDS } from './room';
import type { Presence } from './net/presence';
import type { AudioMode, ScreenSource } from './net/types';
import { HALL_PRESETS, LIB_PRESETS } from './seating';
import { CONFIG } from './config';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const AUDIO_MODES: { id: AudioMode; name: string; hint: string }[] = [
  { id: 'conversation', name: 'Conversation', hint: 'Everyday mode. You hear the 10 people nearest you, fading with distance; people on the stage carry across the hall.' },
  { id: 'event', name: 'Large group', hint: 'For full rooms. You hear your 6 nearest neighbours within 10 m, a little softer, so the room stays calm; the stage still carries.' },
  { id: 'spotlight', name: 'Stage spotlight', hint: 'For talks and panels. Everyone on the stage, and anyone you spotlight, is heard by everyone at full volume. Guests can still whisper to their 3 nearest neighbours.' },
];
const SCREEN_NAMES: Record<string, string> = { stage: 'Stage screen (above the stage)', west: 'West screen', east: 'East screen' };

export interface AdminHooks {
  room: Room;
  presence: Presence;
  canAdmin: () => boolean;
  /** Who am I to the room, in words. */
  role: () => string;
  /** Verified mode: reconnect voice with this passphrase. Resolves to a message for the panel. */
  signIn: ((key: string) => Promise<string>) | null;
  /** True when the LiveKit media room is configured. */
  liveAvailable: boolean;
}

export function initAdmin(h: AdminHooks) {
  const R = h.room, P = h.presence;
  const panel = $('#admin'), btn = $<HTMLButtonElement>('#adminBtn');
  const open = () => { panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); draw(); };
  const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => (panel.hidden ? open() : close()));
  $('#adminClose').addEventListener('click', close);
  panel.addEventListener('click', e => { if (e.target === panel) close(); });
  for (const ev of ['keydown', 'keyup'] as const) panel.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'keydown' && (e as KeyboardEvent).key === 'Escape') close(); });

  const seg = (el: HTMLElement, items: { id: string; name: string; hint: string }[], cur: () => string, set: (id: string) => void) => {
    el.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button'); if (!b || b.disabled) return; set(b.dataset.id!); });
    return () => { const c = cur(), can = h.canAdmin(); el.innerHTML = items.map(p => `<button type="button" data-id="${p.id}" title="${esc(p.hint)}" aria-pressed="${p.id === c}" ${can ? '' : 'disabled'}>${esc(p.name)}</button>`).join(''); };
  };
  const drawHall = seg($('#admSeatHall'), HALL_PRESETS, () => R.state.seating.hall, id => R.setSeating('hall', id));
  const drawLib = seg($('#admSeatLib'), LIB_PRESETS, () => R.state.seating.library, id => R.setSeating('library', id));
  const drawAudio = seg($('#admAudio'), AUDIO_MODES, () => R.state.audio, id => R.setAudio(id as AudioMode));
  const drawScrAudio = seg($('#admScreenAudio'), [
    { id: 'room', name: 'Screen sound: whole room', hint: 'Everyone in the hall hears the stream at the same volume' },
    { id: 'positional', name: 'Screen sound: from the screen', hint: 'The stream sounds from its screen and fades with distance' },
  ], () => R.state.screenAudio, id => R.setScreenAudio(id as 'room' | 'positional'));

  $('#admMuteHall').addEventListener('click', () => { R.muteHall(); });
  $('#admClearSpot').addEventListener('click', () => { R.clearSpotlights(); });

  // spotlight list: everyone currently in the room
  const spot = $('#admSpot');
  spot.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b) return; const id = b.dataset.id!; R.setSpotlight(id, !R.state.spotlight.includes(id)); });
  const drawSpot = () => {
    const can = h.canAdmin();
    const ppl = [{ id: P.self.id, name: P.self.name + ' (you)' }, ...[...P.peers.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 120)];
    spot.innerHTML = P.connected ? ppl.map(p => { const on = R.state.spotlight.includes(p.id); return `<div class="person"><span>${esc(p.name)}${on ? ' · <b>spotlit</b>' : ''}</span><button type="button" class="ghost sm" data-id="${esc(p.id)}" ${can ? '' : 'disabled'}>${on ? 'Remove spotlight' : 'Spotlight'}</button></div>`; }).join('')
      : '<p class="fine">Join others to spotlight a guest, for example an audience question in Q&amp;A.</p>';
  };

  // media screens
  const scr = $('#admScreens');
  const srcValue = (s: ScreenSource) => s.kind === 'idle' ? 'idle' : s.kind === 'hls' ? 'hls' : `live:${s.track}`;
  scr.addEventListener('change', e => {
    const sel = (e.target as HTMLElement).closest('select') as HTMLSelectElement | null; if (!sel) return;
    const id = sel.dataset.id!, v = sel.value;
    const row = sel.closest('.scr')!, url = row.querySelector('input') as HTMLInputElement;
    url.hidden = v !== 'hls'; (row.querySelector('.go') as HTMLElement).hidden = v !== 'hls';
    if (v === 'idle') R.setScreen(id, { kind: 'idle' });
    else if (v.startsWith('live:')) R.setScreen(id, { kind: 'live', track: v.slice(5) as 'screen' | 'ingress' | 'auto' });
    else if (url.value) R.setScreen(id, { kind: 'hls', url: url.value.trim() });
  });
  scr.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button.go') as HTMLButtonElement | null; if (!b) return;
    const row = b.closest('.scr')!, url = (row.querySelector('input') as HTMLInputElement).value.trim();
    if (!/^https:\/\//i.test(url)) { (row.querySelector('.fine') as HTMLElement).textContent = 'Use an https:// link to an .m3u8 (HLS) or .mp4 file.'; return; }
    R.setScreen(b.dataset.id!, { kind: 'hls', url });
  });
  const drawScreens = () => {
    if (scr.contains(document.activeElement) && (document.activeElement as HTMLElement).tagName === 'INPUT') return; // don't wipe a link being typed
    const can = h.canAdmin(), dis = can ? '' : 'disabled';
    scr.innerHTML = SCREEN_IDS.map(id => {
      const s = R.state.screens[id] ?? { kind: 'idle' }, v = srcValue(s);
      const opt = (val: string, label: string, ok = true) => `<option value="${val}" ${v === val ? 'selected' : ''} ${ok ? '' : 'disabled'}>${label}</option>`;
      return `<div class="scr"><span class="t">${SCREEN_NAMES[id]}</span>
        <select data-id="${id}" ${dis} aria-label="${SCREEN_NAMES[id]} source">
          ${opt('idle', 'XR Guild slide (idle)')}
          ${opt('live:auto', 'Live: screenshare, else RTMP stream', h.liveAvailable)}
          ${opt('live:screen', 'Live: screenshare (slides)', h.liveAvailable)}
          ${opt('live:ingress', 'Live: RTMP stream', h.liveAvailable)}
          ${opt('hls', 'HLS or MP4 link')}
        </select>
        <div class="row"><input type="url" placeholder="https://…/stream.m3u8" value="${s.kind === 'hls' ? esc(s.url) : esc(CONFIG.media.hlsDefault)}" ${v === 'hls' ? '' : 'hidden'} ${dis} /><button type="button" class="ghost sm go" data-id="${id}" ${v === 'hls' ? '' : 'hidden'} ${dis}>Play</button></div>
        <p class="fine"></p></div>`;
    }).join('') + (h.liveAvailable ? '' : '<p class="fine">Live options need the LiveKit media room (VITE_MEDIA_TOKEN_URL). HLS links work without it.</p>');
  };

  // sign in (verified mode only)
  const form = $<HTMLFormElement>('#adminSignIn');
  form.hidden = !h.signIn;
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (!h.signIn) return;
    const k = $<HTMLInputElement>('#adminKey'); const key = k.value; k.value = '';
    $('#adminWho').textContent = 'Signing in…';
    $('#adminWho').textContent = await h.signIn(key).catch((err: any) => 'Sign-in failed: ' + (err?.message ?? err));
    draw();
  });

  const draw = () => {
    if (panel.hidden) return;
    const can = h.canAdmin();
    $('#adminWho').textContent = h.role();
    form.hidden = !h.signIn || (can && P.connected);
    drawHall(); drawLib(); drawAudio(); drawScrAudio(); drawSpot(); drawScreens();
    $('#admAudioHint').textContent = AUDIO_MODES.find(m => m.id === R.state.audio)?.hint ?? '';
    ($('#admMuteHall') as HTMLButtonElement).disabled = !can || !P.connected;
    ($('#admClearSpot') as HTMLButtonElement).disabled = !can || !R.state.spotlight.length;
  };
  R.listeners.add(draw);
  let pend = 0;
  P.listeners.add(() => { if (!pend) pend = window.setTimeout(() => { pend = 0; draw(); }, 600); });
  return { draw, open };
}
