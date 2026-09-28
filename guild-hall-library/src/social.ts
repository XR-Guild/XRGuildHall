import type { Presence } from './net/presence';
import type { Seating } from './seating';
import { HALL_PRESETS, LIB_PRESETS } from './seating';
import EVENTS from './data/events.json';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export interface SocialHooks {
  presence: Presence;
  seating: Seating;
  /** true when some way to meet others is configured (VIVERSE App ID, LiveKit token URL, or ?sim) */
  canConnect: boolean;
  joinLabel: string;
  connect: (name: string) => Promise<void>;
  voice: () => { micOn: boolean; setMic: (on: boolean) => Promise<void>; muteLocal: (id: string, m: boolean) => void; localMuted: Set<string> } | null;
  defaultName: () => string;
}

export function renderEvents() {
  const now = Date.now();
  const evs = (EVENTS.events as any[]).filter(e => Date.parse(e.end || e.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  $('#events').innerHTML = (evs.length ? evs.slice(0, 4).map(e => `<div class="ev"><div class="when">${esc(fmt(e.start))}</div><div class="t">${esc(e.title)}</div>${e.location ? `<div class="where">${esc(e.location)}</div>` : ''}${e.description ? `<p>${esc(String(e.description).replace(/\s+/g, ' ').slice(0, 240))}</p>` : ''}</div>`).join('')
    : `<p class="empty">No upcoming events in this snapshot.</p>`) + `<p class="fine">Calendar snapshot from xrguild.org, ${esc(EVENTS.fetched)}. <a href="https://www.xrguild.org/calendar" target="_blank" rel="noopener">See the live calendar ↗</a></p>`;
}

export function initSocial(h: SocialHooks) {
  const P = h.presence;
  renderEvents();

  // ---------- seating toggles (anyone when solo; host only when connected) ----------
  const seg = (el: HTMLElement, zone: 'hall' | 'library', presets: { id: string; name: string; hint: string }[], label: string) => {
    const draw = () => {
      const cur = h.seating.preset[zone]; const can = P.isHost();
      el.innerHTML = `<span class="lbl">${label}</span>` + presets.map(p => `<button data-id="${p.id}" title="${esc(p.hint)}" aria-pressed="${p.id === cur}" ${can ? '' : 'disabled'}>${esc(p.name)}</button>`).join('');
    };
    el.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button'); if (!b || b.disabled) return; h.seating.setPreset(zone, b.dataset.id!); });
    return draw;
  };
  const drawHall = seg($('#seatHall'), 'hall', HALL_PRESETS, 'Guild Hall seating');
  const drawLib = seg($('#seatLib'), 'library', LIB_PRESETS, 'Library · 15 seats');
  const drawSeats = () => { drawHall(); drawLib(); $('#seatNote').textContent = P.connected && !P.isHost() ? 'The host sets the seating layout. Click or select any free chair to sit; walk away to stand.' : 'Click or select any chair to sit. Walk away to stand.'; };
  drawSeats();

  // ---------- dock ----------
  const join = $<HTMLButtonElement>('#socJoin'), mic = $<HTMLButtonElement>('#socMic'), chatBtn = $<HTMLButtonElement>('#socChatBtn'), peopleBtn = $<HTMLButtonElement>('#socPeopleBtn');
  join.hidden = !h.canConnect;
  const toggle = (btn: HTMLButtonElement, pop: HTMLElement) => { const open = pop.hidden; pop.hidden = !open; btn.setAttribute('aria-expanded', String(open)); return open; };
  let unread = 0;
  chatBtn.addEventListener('click', () => { if (toggle(chatBtn, $('#socChat'))) { unread = 0; $('#socUnread').textContent = ''; $<HTMLInputElement>('#chatIn').focus(); } });
  peopleBtn.addEventListener('click', () => toggle(peopleBtn, $('#socPeople')));
  mic.addEventListener('click', async () => {
    const v = h.voice(); if (!v) return;
    mic.disabled = true;
    try { await v.setMic(!v.micOn); } catch (e: any) { sys('Microphone unavailable: ' + (e?.message ?? e)); }
    mic.disabled = false; drawDock();
  });
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const i = $<HTMLInputElement>('#chatIn'); P.say(i.value); i.value = ''; });
  for (const ev of ['keydown', 'keyup'] as const) $('#social').addEventListener(ev, e => { if ((e.target as HTMLElement).closest('input')) e.stopPropagation(); });
  $('#muteHall').addEventListener('click', () => { P.sendControl({ type: 'muteHall' }); sys('You asked everyone in the hall to mute.'); });

  // ---------- consent before connecting ----------
  const coc = $('#coc'), ok = $<HTMLInputElement>('#cocOk'), go = $<HTMLButtonElement>('#cocGo'), nm = $<HTMLInputElement>('#cocName');
  nm.value = h.defaultName();
  $('#cocSim').hidden = h.joinLabel !== 'Preview a crowd';
  ok.addEventListener('change', () => { go.disabled = !ok.checked; });
  $('#cocCancel').addEventListener('click', () => { coc.hidden = true; });
  join.addEventListener('click', () => { if (P.connected) { P.disconnect(); drawDock(); return; } coc.hidden = false; nm.focus(); });
  for (const ev of ['keydown', 'keyup'] as const) coc.addEventListener(ev, e => e.stopPropagation());
  go.addEventListener('click', async () => {
    coc.hidden = true; go.disabled = true;
    try { await h.connect(nm.value.trim() || h.defaultName()); sys('Connected. Your mic is off; press Mic to talk.'); }
    catch (e: any) { sys('Could not connect: ' + (e?.message ?? e)); P.disconnect(); }
    go.disabled = !ok.checked; drawDock(); drawSeats();
  });

  // ---------- rendering ----------
  const log = $('#chatLog');
  const sys = (t: string) => { log.insertAdjacentHTML('beforeend', `<div class="sys">${esc(t)}</div>`); log.scrollTop = log.scrollHeight; };
  let seen = 0;
  const drawChat = () => {
    const msgs = P.chat.slice(seen); seen = P.chat.length;
    for (const m of msgs) log.insertAdjacentHTML('beforeend', `<div class="${m.from === P.self.id ? 'me' : ''}"><b>${esc(m.name)}</b> ${esc(m.text)}</div>`);
    if (msgs.length) { log.scrollTop = log.scrollHeight; if ($('#socChat').hidden) { unread += msgs.filter(m => m.from !== P.self.id).length; $('#socUnread').textContent = unread ? String(unread) : ''; } }
  };
  const drawPeople = () => {
    const v = h.voice();
    const list = [...P.peers.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 150);
    $('#peopleList').innerHTML = `<div class="person"><span class="nm">${esc(P.self.name)} (you)</span><span class="z">${P.self.zone}</span></div>` + list.map(p => `<div class="person" data-id="${esc(p.id)}"><span class="nm">${esc(p.name)}</span><span class="z">${p.zone}${p.onStage ? ' · stage' : ''}</span>${v ? `<button data-act="mute">${v.localMuted.has(p.id) ? 'Unmute' : 'Mute'}</button>` : ''}<button data-act="block">Block</button></div>`).join('')
      + (P.blocked.size ? `<p class="fine">${P.blocked.size} blocked. <button class="linkbtn" data-act="unblock">Unblock all</button></p>` : '');
    $('#hostBox').hidden = !(P.connected && P.isHost());
  };
  $('#peopleList').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b) return;
    if (b.dataset.act === 'unblock') { P.unblockAll(); return; }
    const id = (b.closest('.person') as HTMLElement).dataset.id!;
    if (b.dataset.act === 'block') { P.block(id); h.voice()?.muteLocal(id, true); }
    if (b.dataset.act === 'mute') { const v = h.voice(); if (v) v.muteLocal(id, !v.localMuted.has(id)); drawPeople(); }
  });
  const drawDock = () => {
    const c = P.connected, v = h.voice();
    $('#socStatus').textContent = P.status;
    join.textContent = c ? 'Leave' : h.joinLabel;
    mic.hidden = !c || !v; mic.setAttribute('aria-pressed', String(!!v?.micOn)); mic.textContent = v?.micOn ? 'Mic on' : 'Mic off';
    chatBtn.hidden = !c; peopleBtn.hidden = !c;
    $('#socCount').textContent = c ? String(P.peers.size + 1) : '';
    if (!c) { $('#socChat').hidden = true; $('#socPeople').hidden = true; }
  };
  let pend = 0;
  P.listeners.add(() => { drawChat(); if (!pend) pend = window.setTimeout(() => { pend = 0; drawDock(); if (!$('#socPeople').hidden) drawPeople(); drawSeats(); }, 400); });
  peopleBtn.addEventListener('click', drawPeople);
  h.seating.onChange = (zone, id) => { drawSeats(); if (P.connected && P.isHost()) P.sendControl({ type: 'seating', zone, preset: id }); };
  drawDock();
  return { sys, drawDock, drawSeats };
}
