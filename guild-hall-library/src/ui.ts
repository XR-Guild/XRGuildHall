import { LIBRARY, CATS, TYPES, search, catName, contextFor, QUICK_TOPICS, type Item } from './search';
import { HEADLINE, SPECS, NOT_DISCLOSED, TALKING_POINTS, ALSO_ANNOUNCED, SOURCES, LINEAGE } from './data/news';
import { store, subscribe } from './store';
import { ENTRIES, TIMELINE, TL_CATS, ERAS, BY_ID, eraOf, eraLabel, eraCount, catColor, catLabel, searchTimeline, timelineContext, type Entry } from './timeline';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

type Tab = 'library' | 'timeline' | 'ask' | 'news' | 'reading';

export interface UIHooks {
  tours: { id: string; name: string; hint: string }[];
  goTo: (id: string) => void;
  enterVR: (() => void) | null;
  setReduceMotion: (v: boolean) => void;
  setAurora: (v: boolean) => void;
  setReflections: (v: boolean) => void;
  askProxy?: string; // optional self-hosted proxy URL for GitBook's ask endpoint
}

let sample: any = null;

export function initUI(h: UIHooks) {
  // keep keyboard input in the interface from driving locomotion
  const overlay = $('#ui');
  for (const ev of ['keydown', 'keyup'] as const) overlay.addEventListener(ev, e => { if ((e.target as HTMLElement).closest('input,textarea,select,button')) e.stopPropagation(); });

  // tours
  const tours = $('#tours');
  tours.innerHTML = h.tours.map(t => `<button class="tour" data-id="${t.id}" title="${esc(t.hint)}"><span>${esc(t.name)}</span></button>`).join('');
  tours.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button'); if (b) h.goTo(b.dataset.id!); });

  // tabs + drawer
  const drawer = $('#drawer');
  const setTab = (t: Tab) => {
    document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    document.querySelectorAll<HTMLElement>('.tabpanel').forEach(p => (p.hidden = p.id !== 'tab-' + t));
    drawer.dataset.open = 'true';
    $('#drawerToggle').setAttribute('aria-expanded', 'true');
    try { localStorage.setItem('xrgh-tab', t); } catch { /* ignore */ }
  };
  $('#tabs').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button'); if (b) setTab(b.dataset.tab as Tab); });
  $('#drawerToggle').addEventListener('click', () => {
    const open = drawer.dataset.open !== 'true'; drawer.dataset.open = String(open);
    $('#drawerToggle').setAttribute('aria-expanded', String(open));
  });

  // ---------- library ----------
  const q = $<HTMLInputElement>('#q'), cat = $<HTMLSelectElement>('#cat'), typ = $<HTMLSelectElement>('#type'), sort = $<HTMLSelectElement>('#sort');
  cat.innerHTML = `<option value="">All categories (${LIBRARY.items.length})</option>` + CATS.map(c => `<option value="${c.id}">${esc(c.name)} (${c.count})</option>`).join('');
  typ.innerHTML = `<option value="">All formats</option>` + TYPES.map(t => `<option>${esc(t)}</option>`).join('');
  $('#chips').innerHTML = QUICK_TOPICS.map(t => `<button class="chip" data-q="${esc(t)}">${esc(t)}</button>`).join('');
  $('#chips').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button'); if (b) { q.value = b.dataset.q!; shown = PAGE; run(); } });
  const PAGE = 12; let shown = PAGE; let results: Item[] = [];
  const itemHTML = (it: Item) => {
    const saved = store.reading.has(it.u);
    return `<article class="item">
      <div class="meta">${esc(catName(it.c))} · ${esc(it.y)}${it.d ? ' · ' + esc(it.d) : ''}</div>
      <h3><a href="${esc(it.u)}" target="_blank" rel="noopener">${esc(it.t)}</a></h3>
      ${it.a ? `<div class="by">${esc(it.a)}</div>` : ''}
      ${it.s ? `<p>${esc(it.s)}</p>` : ''}
      <div class="row">
        <a class="lnk" href="${esc(it.u)}" target="_blank" rel="noopener">Library entry ↗</a>
        ${it.l ? `<a class="lnk" href="${esc(it.l)}" target="_blank" rel="noopener">Original source ↗</a>` : ''}
        <button class="save" data-u="${esc(it.u)}" aria-pressed="${saved}">${saved ? '✓ Saved' : 'Save'}</button>
      </div></article>`;
  };
  const render = () => {
    $('#count').textContent = `${results.length} ${results.length === 1 ? 'work' : 'works'}`;
    $('#results').innerHTML = results.length ? results.slice(0, shown).map(itemHTML).join('') : `<p class="empty">No matches. Try a broader word, or clear the category and format filters.</p>`;
    $('#more').hidden = shown >= results.length;
    const tq = q.value.trim();
    const tlHits = tq.length > 1 ? searchTimeline({ text: tq }, 'relevance').slice(0, 3) : [];
    const strip = $('#tlStrip');
    strip.hidden = !tlHits.length;
    strip.innerHTML = tlHits.length ? `<div class="kicker">On the Timeline of XR</div>` + tlHits.map(e => `<button data-id="${e.id}"><span class="yr">${esc(e.yd)}</span>${esc(e.t)}</button>`).join('') + `<button class="linkbtn" data-all="1">See all ${searchTimeline({ text: tq }).length} on the timeline →</button>` : '';
  };
  const run = () => { results = search({ text: q.value, cat: cat.value || undefined, type: typ.value || undefined, sort: sort.value as any }); render(); };
  q.addEventListener('input', () => { shown = PAGE; run(); });
  [cat, typ, sort].forEach(s => s.addEventListener('change', () => { shown = PAGE; run(); }));
  $('#more').addEventListener('click', () => { shown += PAGE; render(); });
  const stripEl = document.createElement('div'); stripEl.id = 'tlStrip'; stripEl.className = 'tl-strip'; stripEl.hidden = true;
  $('#count').parentElement!.before(stripEl);
  stripEl.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b) return; openTimeline({ query: b.dataset.all ? q.value.trim() : '', id: b.dataset.id }); });
  $('#results').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button.save') as HTMLButtonElement | null; if (b) store.toggleReading(b.dataset.u!); });
  $('#snapshot').textContent = `Snapshot of ${LIBRARY.items.length} works from library.xrguild.org, taken ${LIBRARY.fetched}.`;
  run();

  // ---------- timeline ----------
  const tlState = { text: '', cats: new Set<string>(), era: null as number | null };
  const tlq = $<HTMLInputElement>('#tlq');
  $('#tlCredit').innerHTML = `${ENTRIES.length} entries from the XR Guild's community <a href="${TIMELINE.source}" target="_blank" rel="noopener">Timeline of XR ↗</a>, taken ${TIMELINE.fetched}. Inspired by Avi Bar-Zeev's original XR terminology list.`;
  $('#tlCats').innerHTML = TL_CATS.map(c => `<button class="chip" data-cat="${c.id}" aria-pressed="false"><span class="dot" style="background:${c.color}"></span>${c.name}</button>`).join('');
  const renderSpine = () => {
    const max = Math.max(...ERAS.map(e => eraCount(e)));
    $('#spine').innerHTML = ERAS.map((e, i) => {
      const n = eraCount(e, tlState.cats);
      const lab = i % 2 === 0 || e === ERAS[ERAS.length - 1] ? `<span class="lab">${e === 1800 ? '<1900' : String(e).slice(0, 4)}</span>` : '';
      return `<button data-era="${e}" aria-pressed="${tlState.era === e}" title="${eraLabel(e)}: ${n} ${n === 1 ? 'entry' : 'entries'}"><span class="bar" style="height:${Math.max(4, (n / max) * 100)}%"></span>${lab}</button>`;
    }).join('');
  };
  const evHTML = (e: Entry) => `<div class="ev" id="ev-${e.id}">
      <div class="yr">${esc(e.yd)}</div>
      <div><h3>${esc(e.t)}</h3>
        <div class="kind"><span class="dot" style="background:${catColor(e.c)}"></span>${esc(catLabel(e.c))}${e.s ? ' · ' + esc(e.s) : ''}</div>
        ${e.n ? `<div class="names">${esc(e.n)}</div>` : ''}
        ${e.b ? `<p>${esc(e.b)}</p>` : ''}
        ${e.l.length || e.r.length ? `<div class="row">${e.l.map(l => `<a class="lnk" href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.n || new URL(l.u).hostname.replace('www.', ''))} ↗</a>`).join('')}${e.r.map(id => BY_ID.get(id)).filter(Boolean).map(r => `<button class="rel" data-id="${r!.id}">→ ${esc(r!.t)} (${esc(r!.yd)})</button>`).join('')}</div>` : ''}
      </div></div>`;
  const renderTimeline = () => {
    renderSpine();
    const hits = searchTimeline({ text: tlState.text, cats: tlState.cats, era: tlState.era });
    $('#tlCount').textContent = `${hits.length} ${hits.length === 1 ? 'entry' : 'entries'}${tlState.era != null ? ' in ' + eraLabel(tlState.era) : ''}`;
    $('#tlClear').hidden = tlState.era == null;
    let html = '', cur = -1;
    for (const e of hits) { const er = eraOf(e.y); if (er !== cur) { cur = er; html += `<div class="era">${eraLabel(er)}</div>`; } html += evHTML(e); }
    $('#tlList').innerHTML = html || `<p class="empty">Nothing on the timeline matches. Try another word, or clear the filters.</p>`;
  };
  tlq.addEventListener('input', () => { tlState.text = tlq.value; renderTimeline(); });
  $('#tlCats').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b) return; const c = b.dataset.cat!; tlState.cats.has(c) ? tlState.cats.delete(c) : tlState.cats.add(c); b.setAttribute('aria-pressed', String(tlState.cats.has(c))); renderTimeline(); });
  $('#spine').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b) return; const er = +b.dataset.era!; tlState.era = tlState.era === er ? null : er; renderTimeline(); $('#tab-timeline').scrollTop = 0; });
  $('#tlClear').addEventListener('click', () => { tlState.era = null; renderTimeline(); });
  const jumpTo = (id: string) => {
    const el = document.getElementById('ev-' + id);
    if (!el) { tlState.era = null; tlState.text = ''; tlq.value = ''; tlState.cats.clear(); document.querySelectorAll('#tlCats .chip').forEach(c => c.setAttribute('aria-pressed', 'false')); renderTimeline(); }
    const el2 = document.getElementById('ev-' + id);
    el2?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el2?.classList.remove('flash'); void el2?.offsetWidth; el2?.classList.add('flash');
  };
  $('#tlList').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button.rel') as HTMLButtonElement | null; if (b) jumpTo(b.dataset.id!); });
  const openTimeline = (o: { query?: string; era?: number | null; id?: string } = {}) => {
    setTab('timeline');
    if (o.query !== undefined) { tlq.value = o.query; tlState.text = o.query; }
    if (o.era !== undefined) tlState.era = o.era;
    renderTimeline();
    if (o.id) requestAnimationFrame(() => jumpTo(o.id!));
  };
  renderTimeline();

  // ---------- ask ----------
  const askForm = $<HTMLFormElement>('#askForm'), askQ = $<HTMLTextAreaElement>('#askQ'), out = $('#answer'), stop = $<HTMLButtonElement>('#askStop'), note = $('#askNote');
  const gitbookLink = $<HTMLAnchorElement>('#gitbookAsk');
  const updateGb = () => { gitbookLink.href = `https://library.xrguild.org/xr-guild-library-2.0.md?ask=${encodeURIComponent(askQ.value.trim() || 'What does the library cover?')}`; };
  askQ.addEventListener('input', updateGb); updateGb();
  let ctl: AbortController | null = null;
  const claudeAvail = (window as any).claude?.use ? (window as any).claude.use('sample') : Promise.resolve(null);
  claudeAvail.then((s: any) => {
    sample = s;
    $('#askClaude').hidden = !s && !h.askProxy;
    $('#askFallback').hidden = !!(s || h.askProxy);
  }).catch(() => { $('#askClaude').hidden = !h.askProxy; $('#askFallback').hidden = !!h.askProxy; });
  stop.addEventListener('click', () => ctl?.abort());
  out.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('.tlcite') as HTMLButtonElement | null; if (b) openTimeline({ id: b.dataset.id }); });
  askForm.addEventListener('submit', async e => {
    e.preventDefault();
    const question = askQ.value.trim(); if (!question) return;
    const btn = $<HTMLButtonElement>('#askGo'); btn.disabled = true; stop.hidden = false; note.textContent = '';
    out.innerHTML = '<p class="thinking">Thinking…</p>';
    ctl = new AbortController();
    const ctx = contextFor(question, 18);
    const refs = search({ text: question }).slice(0, 18);
    const tlRefs = timelineContext(question, 12);
    const tlCtx = tlRefs.map((e, i) => `[T${i + 1}] ${e.yd} · ${e.t} (${catLabel(e.c)}${e.s ? ', ' + e.s : ''})${e.n ? ' · ' + e.n : ''}${e.b ? '\n' + e.b : ''}`).join('\n\n');
    try {
      if (sample) {
        const prompt = `You are the reference librarian of the XR Guild Library (library.xrguild.org), a curated collection on XR ethics, privacy, safety and research.
Answer the visitor's question using ONLY the catalog entries and XR timeline entries below. Cite library entries inline as [n] and timeline entries as [Tn]. For history questions, walk through the timeline in date order. If the entries do not answer the question, say so plainly and suggest which categories to browse. Keep it under 220 words. Use short paragraphs or a few bullets. Do not invent titles, authors or links.

Visitor question: ${question}

Catalog entries:
${ctx}

Timeline of XR entries (XR Guild community timeline):
${tlCtx || '(none matched)'}`;
        await sample(prompt, { signal: ctl.signal, onText: ({ text }: { text: string }) => { out.innerHTML = md(text, refs, tlRefs); } });
      } else if (h.askProxy) {
        const r = await fetch(`${h.askProxy}?ask=${encodeURIComponent(question)}`, { signal: ctl.signal });
        if (!r.ok) throw { code: 'upstream_error' };
        const text = (await r.text()).split('\n---\n')[0];
        out.innerHTML = md(text, []);
      }
    } catch (err: any) {
      const code = err?.code;
      if (err?.text) out.innerHTML = md(err.text, refs, tlRefs); else if (code !== 'cancelled') out.innerHTML = '';
      note.textContent = code === 'cancelled' ? 'Stopped.' : code === 'not_granted' || code === 'sampling_disabled' ? 'Asking Claude is turned off for this view. Use the GitBook link below instead.' : code === 'rate_limited' ? 'Too many questions at once. Try again in a minute.' : 'The answer did not come through. Try again, or use the GitBook link below.';
      if (code === 'not_granted' || code === 'sampling_disabled') { $('#askClaude').hidden = true; $('#askFallback').hidden = false; }
    } finally { btn.disabled = false; stop.hidden = true; }
  });

  // ---------- news ----------
  const srcSup = (keys: string[]) => keys.map(k => `<a class="src" href="${esc(SOURCES[k].url)}" target="_blank" rel="noopener" title="${esc(SOURCES[k].name)}">${esc(SOURCES[k].name)}</a>`).join(' ');
  $('#tab-news').innerHTML = `
    <p class="kicker">${esc(HEADLINE.kicker)}</p>
    <h2 class="display">${esc(HEADLINE.title)}</h2>
    <p class="dek">${esc(HEADLINE.dek)}</p>
    <p class="status">${esc(HEADLINE.status)} The 3D model on the table is illustrative, not an official render.</p>
    <p class="fine">Not on the XR Guild Timeline yet. Guild members can propose it at <a href="https://www.xrguild.org/timeline" target="_blank" rel="noopener">xrguild.org/timeline ↗</a>.</p>
    <table class="specs"><tbody>${SPECS.map(s => `<tr><th scope="row">${esc(s.label)}</th><td>${esc(s.value)}${s.flag ? `<div class="flag">⚑ ${esc(s.flag)}</div>` : ''}<div class="srcs">${srcSup(s.src)}</div></td></tr>`).join('')}</tbody></table>
    <h3>Not yet disclosed</h3><ul>${NOT_DISCLOSED.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    ${TALKING_POINTS.map(g => `<h3>${esc(g.group)}</h3><ul>${g.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}
    <button class="ghost" id="copyPoints">Copy questions for Connect</button>
    <h3>Also announced</h3>
    ${ALSO_ANNOUNCED.map(a => `<div class="also"><strong>${esc(a.name)}</strong><span>${esc(a.detail)}</span>${a.flag ? `<div class="flag">⚑ ${esc(a.flag)}</div>` : ''}<div class="srcs">${srcSup(a.src)}</div></div>`).join('')}
    <h3>Sources</h3><ul class="sources">${Object.values(SOURCES).map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></li>`).join('')}</ul>
    <p class="fine">Compiled the evening of Sept 23, 2026, after the keynote. Specs can change before the Spring 2027 launch.</p>`;
  $('#copyPoints').addEventListener('click', e => {
    const txt = `Meta VR Glasses: questions for Connect\n\n` + TALKING_POINTS.map(g => g.group + '\n' + g.items.map(i => '- ' + i).join('\n')).join('\n\n');
    copy(txt, e.currentTarget as HTMLButtonElement);
  });

  // ---------- reading list ----------
  const renderReading = () => {
    const items = LIBRARY.items.filter(i => store.reading.has(i.u));
    $('#readingBody').innerHTML = items.length ? items.map(itemHTML).join('') : `<p class="empty">Nothing saved yet. Save works from the Library tab, or from the library easel in the apse.</p>`;
    $('#copyReading').hidden = !items.length;
    $('#readingCount').textContent = items.length ? String(items.length) : '';
    render();
  };
  $('#tab-reading').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button.save') as HTMLButtonElement | null; if (b) store.toggleReading(b.dataset.u!); });
  $('#copyReading').addEventListener('click', e => {
    const items = LIBRARY.items.filter(i => store.reading.has(i.u));
    copy(items.map(i => `${i.t}\n${i.u}`).join('\n\n'), e.currentTarget as HTMLButtonElement);
  });
  subscribe(renderReading); renderReading();

  // ---------- world → UI bridges ----------
  store.openTab = (t, o) => {
    if (t === 'timeline') { openTimeline(o as any); return; }
    setTab(t);
    if (t === 'library' && o) { if (o.cat !== undefined) cat.value = o.cat; if (o.query !== undefined) q.value = o.query; shown = PAGE; run(); }
  };
  const card = $('#card');
  store.showCard = html => { card.innerHTML = html + '<button class="x" aria-label="Close">×</button>'; card.hidden = false; };
  card.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    if (t.closest('.x')) card.hidden = true;
    const tb = t.closest('[data-tl]') as HTMLElement | null;
    if (tb) { card.hidden = true; openTimeline({ id: tb.dataset.tl }); }
  });

  // ---------- settings ----------
  const rm = $<HTMLInputElement>('#setReduce'), au = $<HTMLInputElement>('#setAurora'), rf = $<HTMLInputElement>('#setRefl');
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  rm.checked = prefersReduced; au.checked = !prefersReduced;
  h.setReduceMotion(rm.checked); h.setAurora(au.checked);
  rm.addEventListener('change', () => h.setReduceMotion(rm.checked));
  au.addEventListener('change', () => h.setAurora(au.checked));
  rf.addEventListener('change', () => h.setReflections(rf.checked));
  $('#settingsBtn').addEventListener('click', () => { const p = $('#settings'); p.hidden = !p.hidden; $('#settingsBtn').setAttribute('aria-expanded', String(!p.hidden)); });

  // VR
  const vr = $<HTMLButtonElement>('#enterVR');
  if (h.enterVR) { vr.hidden = false; vr.addEventListener('click', h.enterVR); }

  let start: Tab = 'news';
  try { const s = localStorage.getItem('xrgh-tab') as Tab | null; if (s) start = s; } catch { /* ignore */ }
  setTab(start);
  if (matchMedia('(max-width: 720px)').matches) { drawer.dataset.open = 'false'; $('#drawerToggle').setAttribute('aria-expanded', 'false'); }
}

export function lineageCard(i: number) {
  const l = LINEAGE.filter(x => x.era !== 'future')[i];
  return `<p class="kicker">${esc(l.era)} · ${esc(l.year)}</p><h3>${esc(l.name)}</h3><p>${esc(l.note)}</p>${l.tl ? `<button class="ghost" data-tl="${l.tl}">See it on the Timeline of XR</button>` : ''}<p class="fine">Pick it up in VR: squeeze or pinch. It returns to its plinth when you let go.</p>`;
}

function copy(text: string, btn: HTMLButtonElement) {
  const label = btn.textContent;
  navigator.clipboard.writeText(text).then(() => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = label), 1600); })
    .catch(() => { btn.textContent = 'Copy blocked here. Select the text instead.'; setTimeout(() => (btn.textContent = label), 2600); });
}

/** Minimal, safe markdown: escape first, then bold, bullets, paragraphs, [n] citations. */
function md(text: string, refs: Item[], tl: Entry[] = []) {
  let h = esc(text);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // markdown links; GitBook answers use site-relative .md paths
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    let u = url.replace(/&amp;/g, '&');
    if (u.startsWith('/')) u = 'https://library.xrguild.org' + u;
    if (!/^https?:\/\//.test(u)) return label;
    u = u.replace(/\.md(?=$|[?#])/, '');
    return `<a href="${u}" target="_blank" rel="noopener">${label}</a>`;
  });
  h = h.replace(/\[T(\d{1,2})\]/g, (m, n) => { const e = tl[+n - 1]; return e ? `<button class="cite tlcite" data-id="${e.id}" title="${esc(e.yd + ' · ' + e.t)}">[${esc(e.yd)}]</button>` : m; });
  h = h.replace(/\[(\d{1,2})\]/g, (m, n) => { const it = refs[+n - 1]; return it ? `<a class="cite" href="${esc(it.u)}" target="_blank" rel="noopener" title="${esc(it.t)}">[${n}]</a>` : m; });
  const blocks = h.split(/\n{2,}/).map(b => {
    if (/^\s*[-*•] /m.test(b)) return '<ul>' + b.split('\n').filter(l => l.trim()).map(l => `<li>${l.replace(/^\s*[-*•]\s+/, '')}</li>`).join('') + '</ul>';
    if (/^#{1,3} /.test(b)) return `<h4>${b.replace(/^#{1,3} /, '')}</h4>`;
    return `<p>${b.replace(/\n/g, '<br>')}</p>`;
  });
  const cited = [...new Set([...text.matchAll(/\[(\d{1,2})\]/g)].map(m => +m[1]))].filter(n => refs[n - 1]).sort((a, b) => a - b);
  const list = cited.length ? `<ol class="refs">${cited.map(n => `<li value="${n}"><a href="${esc(refs[n - 1].u)}" target="_blank" rel="noopener">${esc(refs[n - 1].t)}</a></li>`).join('')}</ol>` : '';
  const tcited = [...new Set([...text.matchAll(/\[T(\d{1,2})\]/g)].map(m => +m[1]))].filter(n => tl[n - 1]).sort((a, b) => tl[a - 1].y - tl[b - 1].y);
  const tlist = tcited.length ? `<div class="refs"><div class="kicker">On the timeline</div>${tcited.map(n => `<button class="cite tlcite" data-id="${tl[n - 1].id}">${esc(tl[n - 1].yd)} · ${esc(tl[n - 1].t)}</button>`).join('<br>')}</div>` : '';
  return blocks.join('') + list + tlist;
}
