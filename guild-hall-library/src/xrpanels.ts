import { ENTRIES, TL_CATS, ERAS, BY_ID, eraOf, eraLabel, eraCount, catColor, catLabel, searchTimeline, TIMELINE, type Entry } from './timeline';
import { CanvasPanel, INK, type Fonts } from './panel';
import { HEADLINE, SPECS, NOT_DISCLOSED, TALKING_POINTS, ALSO_ANNOUNCED, SOURCES } from './data/news';
import { CATS, search, catName, QUICK_TOPICS, LIBRARY, type Item } from './search';
import { store, subscribe } from './store';

// ---------------- News panel ----------------
export function newsPanel(fonts: Fonts) {
  let tab: 'specs' | 'open' | 'more' | 'sources' = 'specs';
  const p = new CanvasPanel(1.25, 1.66, 880, (p) => {
    const g = p.ctx, W = p.W;
    p.bg();
    p.text(HEADLINE.kicker.toUpperCase(), 64, 60, { font: `600 26px ${fonts.mono}`, color: INK.teal });
    p.text(HEADLINE.title, 64, 104, { font: `74px ${fonts.display}`, color: INK.goldHi });
    let y = 210;
    y += p.wrap(HEADLINE.dek, 64, y, W - 128, 40, { font: `31px ${fonts.body}`, color: INK.text });
    y += 8;
    y += p.wrap(HEADLINE.status, 64, y, W - 128, 34, { font: `italic 25px ${fonts.body}`, color: INK.dim });
    y += 22;
    const tabs: [typeof tab, string][] = [['specs', 'Specs'], ['open', 'Open questions'], ['more', 'Also announced'], ['sources', 'Sources']];
    const tw = (W - 128 - 3 * 14) / 4;
    tabs.forEach(([id, label], i) => p.button('tab-' + id, 64 + i * (tw + 14), y, tw, 60, label, () => { tab = id; }, { active: tab === id }));
    y += 88;
    if (tab === 'specs') {
      for (const s of SPECS) {
        const lh = 33;
        p.text(s.label.toUpperCase(), 64, y + 3, { font: `600 21px ${fonts.mono}`, color: INK.gold });
        const h = p.wrap(s.value, 300, y, W - 364, lh, { font: `27px ${fonts.body}`, color: INK.text, maxLines: 2 });
        let hh = h;
        if (s.flag) { hh += p.wrap('⚑ ' + s.flag, 300, y + h, W - 364, 28, { font: `22px ${fonts.body}`, color: INK.amber, maxLines: 2 }); }
        y += Math.max(hh, lh) + 12;
        p.rule(64, y - 6, W - 128, 'rgba(216,174,90,0.15)');
      }
    } else if (tab === 'open') {
      p.text('NOT YET DISCLOSED', 64, y, { font: `600 24px ${fonts.mono}`, color: INK.amber }); y += 40;
      for (const n of NOT_DISCLOSED) { y += p.wrap('· ' + n, 80, y, W - 160, 34, { font: `27px ${fonts.body}` }) + 4; }
      y += 22;
      for (const grp of TALKING_POINTS) {
        p.text(grp.group.toUpperCase(), 64, y, { font: `600 24px ${fonts.mono}`, color: INK.teal }); y += 40;
        for (const it of grp.items) { y += p.wrap('· ' + it, 80, y, W - 160, 33, { font: `26px ${fonts.body}` }) + 6; }
        y += 16;
      }
    } else if (tab === 'more') {
      for (const a of ALSO_ANNOUNCED) {
        g.beginPath(); g.roundRect(64, y, W - 128, 150, 16); g.fillStyle = 'rgba(255,255,255,0.04)'; g.fill(); g.strokeStyle = INK.line; g.lineWidth = 2; g.stroke();
        p.text(a.name, 88, y + 20, { font: `36px ${fonts.display}`, color: INK.goldHi });
        let h = p.wrap(a.detail, 88, y + 72, W - 176, 32, { font: `26px ${fonts.body}`, maxLines: 2 });
        if (a.flag) p.wrap('⚑ ' + a.flag, 88, y + 72 + h, W - 176, 28, { font: `22px ${fonts.body}`, color: INK.amber, maxLines: 1 });
        y += 168;
      }
    } else {
      p.wrap('Every figure on this panel carries a source. Open the News tab in the 2D view to follow the links.', 64, y, W - 128, 34, { font: `27px ${fonts.body}`, color: INK.dim }); y += 90;
      for (const s of Object.values(SOURCES)) {
        p.text(s.name, 64, y, { font: `600 29px ${fonts.body}`, color: INK.text });
        p.text(new URL(s.url).hostname.replace('www.', ''), 64, y + 38, { font: `23px ${fonts.mono}`, color: INK.teal });
        y += 88;
      }
    }
    p.text('Compiled Sept 23, 2026 after the keynote · figures may change before launch', 64, p.H - 76, { font: `22px ${fonts.body}`, color: INK.dim });
  });
  p.fonts = fonts;
  return p;
}

// ---------------- Library panel ----------------
export function libraryPanel(fonts: Fonts) {
  const st = { cat: '' as string, topic: '' as string, page: 0, sel: null as Item | null };
  const PER = 6;
  const p = new CanvasPanel(2.2, 1.35, 760, (p) => {
    const g = p.ctx, W = p.W, H = p.H;
    p.bg();
    p.text('The Guild Library', 64, 58, { font: `64px ${fonts.display}`, color: INK.goldHi });
    p.text(`${LIBRARY.items.length} works · snapshot of library.xrguild.org, ${LIBRARY.fetched}`, 66, 140, { font: `24px ${fonts.body}`, color: INK.dim });
    // left: categories
    const lx = 64, lw = 440;
    let y = 196;
    p.button('cat-all', lx, y, lw, 52, 'All categories', () => { st.cat = ''; st.page = 0; st.sel = null; }, { active: !st.cat }); y += 60;
    for (const c of CATS) {
      p.button('cat-' + c.id, lx, y, lw, 52, `${c.name}  ·  ${c.count}`, () => { st.cat = c.id; st.page = 0; st.sel = null; }, { active: st.cat === c.id, font: `26px ${fonts.body}` });
      y += 60;
    }
    // right: topics + results or detail
    const rx = lx + lw + 40, rw = W - rx - 64;
    let tx = rx; y = 196;
    p.text('TOPICS', rx, y - 2, { font: `600 22px ${fonts.mono}`, color: INK.teal });
    tx = rx + 110;
    for (const t of QUICK_TOPICS) {
      g.font = `24px ${fonts.body}`; const w = g.measureText(t).width + 40;
      if (tx + w > rx + rw) { tx = rx + 110; y += 52; }
      p.button('topic-' + t, tx, y - 10, w, 42, t, () => { st.topic = st.topic === t ? '' : t; st.page = 0; st.sel = null; }, { active: st.topic === t, font: `24px ${fonts.body}` });
      tx += w + 10;
    }
    y += 56;
    p.rule(rx, y, rw);
    y += 18;
    if (st.sel) {
      const it = st.sel;
      p.button('back', rx, y, 150, 48, '← Back', () => { st.sel = null; });
      const saved = store.reading.has(it.u);
      p.button('save', rx + rw - 330, y, 330, 48, saved ? '✓ In reading list' : 'Save to reading list', () => store.toggleReading(it.u), { active: saved });
      y += 70;
      p.text(catName(it.c).toUpperCase() + '  ·  ' + it.y.toUpperCase(), rx, y, { font: `600 21px ${fonts.mono}`, color: INK.teal }); y += 36;
      y += p.wrap(it.t, rx, y, rw, 52, { font: `38px ${fonts.display}`, color: INK.goldHi, maxLines: 3 }) + 10;
      const meta = [it.a, it.d].filter(Boolean).join(' · ');
      if (meta) y += p.wrap(meta, rx, y, rw, 32, { font: `25px ${fonts.body}`, color: INK.dim, maxLines: 2 }) + 12;
      y += p.wrap(it.s || 'No summary in the library entry.', rx, y, rw, 35, { font: `27px ${fonts.body}`, maxLines: 9 }) + 14;
      if (it.k) p.wrap('Keywords: ' + it.k, rx, y, rw, 30, { font: `22px ${fonts.body}`, color: INK.dim, maxLines: 2 });
      p.text('Saved items appear in the Reading list tab of the 2D view, with links.', rx, H - 90, { font: `22px ${fonts.body}`, color: INK.dim });
      return;
    }
    const results = search({ text: st.topic, cat: st.cat || undefined });
    const pages = Math.max(1, Math.ceil(results.length / PER));
    st.page = Math.min(st.page, pages - 1);
    p.text(`${results.length} result${results.length === 1 ? '' : 's'}${st.topic ? ` for “${st.topic}”` : ''}${st.cat ? ` in ${catName(st.cat)}` : ''}`, rx, y, { font: `24px ${fonts.body}`, color: INK.dim });
    y += 44;
    const rowH = 104;
    results.slice(st.page * PER, st.page * PER + PER).forEach((it, i) => {
      const id = 'item-' + i; const yy = y + i * (rowH + 8);
      const hov = p.hover === id;
      g.beginPath(); g.roundRect(rx, yy, rw, rowH, 14); g.fillStyle = hov ? INK.hover : 'rgba(255,255,255,0.035)'; g.fill();
      g.strokeStyle = hov ? INK.teal : 'rgba(216,174,90,0.22)'; g.lineWidth = 2; g.stroke();
      p.wrap(it.t, rx + 22, yy + 14, rw - 44, 34, { font: `600 28px ${fonts.body}`, maxLines: 1 });
      p.text(`${catName(it.c)} · ${it.y}${it.d ? ' · ' + it.d : ''}`, rx + 22, yy + 56, { font: `22px ${fonts.body}`, color: INK.dim });
      if (store.reading.has(it.u)) p.text('✓', rx + rw - 44, yy + 14, { font: `28px ${fonts.body}`, color: INK.gold });
      p.regions.push({ x: rx, y: yy, w: rw, h: rowH, id, onClick: () => { st.sel = it; } });
    });
    const by = H - 112;
    p.button('prev', rx, by, 160, 54, '← Prev', () => { st.page = Math.max(0, st.page - 1); });
    p.text(`Page ${st.page + 1} of ${pages}`, rx + rw / 2, by + 27, { font: `24px ${fonts.body}`, color: INK.dim, align: 'center', baseline: 'middle' });
    p.button('next', rx + rw - 160, by, 160, 54, 'Next →', () => { st.page = Math.min(pages - 1, st.page + 1); });
  });
  p.fonts = fonts;
  subscribe(() => p.draw());
  return { panel: p, state: st };
}

// ---------------- Timeline panel ----------------

export function timelinePanel(fonts: Fonts) {
  const st = { era: 2010 as number | null, cats: new Set<string>(), page: 0, sel: null as Entry | null };
  const PER = 6;
  const p = new CanvasPanel(1.25, 1.66, 880, (p) => {
    const g = p.ctx, W = p.W, H = p.H;
    p.bg();
    p.text('XR GUILD COMMUNITY TIMELINE', 64, 60, { font: `600 26px ${fonts.mono}`, color: INK.teal });
    p.text('Timeline of XR', 64, 104, { font: `72px ${fonts.display}`, color: INK.goldHi });
    p.text(`${ENTRIES.length} entries · xrguild.org/timeline · ${TIMELINE.fetched}`, 66, 196, { font: `23px ${fonts.body}`, color: INK.dim });
    // category toggles
    let x = 64; const y0 = 240; const bw = (W - 128 - 4 * 10) / 5;
    TL_CATS.forEach((c, i) => p.button('cat-' + c.id, 64 + i * (bw + 10), y0, bw, 50, c.name, () => { st.cats.has(c.id) ? st.cats.delete(c.id) : st.cats.add(c.id); st.page = 0; st.sel = null; }, { active: st.cats.has(c.id), accent: c.color, font: `23px ${fonts.body}` }));
    // spine
    const sy = 318, sh = 150, sw = (W - 128) / ERAS.length;
    const max = Math.max(...ERAS.map(e => eraCount(e)));
    ERAS.forEach((e, i) => {
      const n = eraCount(e, st.cats); const bh = Math.max(6, (n / max) * (sh - 40));
      const bx = 64 + i * sw + 3, act = st.era === e, hov = p.hover === 'era-' + e;
      const grd = g.createLinearGradient(0, sy + sh - 34 - bh, 0, sy + sh - 34);
      grd.addColorStop(0, act ? INK.goldHi : hov ? '#9ff0dd' : INK.teal); grd.addColorStop(1, act ? INK.gold : 'rgba(95,224,198,0.3)');
      g.fillStyle = grd; g.beginPath(); g.roundRect(bx, sy + sh - 34 - bh, sw - 6, bh, [5, 5, 0, 0]); g.fill();
      if (i % 2 === 0 || act) p.text(e === 1800 ? '<1900' : String(e), bx + (sw - 6) / 2, sy + sh - 26, { font: `${act ? '600 ' : ''}19px ${fonts.mono}`, color: act ? INK.goldHi : INK.dim, align: 'center' });
      p.regions.push({ x: bx - 3, y: sy, w: sw, h: sh, id: 'era-' + e, onClick: () => { st.era = st.era === e ? null : e; st.page = 0; st.sel = null; } });
    });
    let y = sy + sh + 16;
    p.rule(64, y, W - 128); y += 20;
    if (st.sel) {
      const e = st.sel;
      p.button('back', 64, y, 150, 50, '← Back', () => { st.sel = null; }); y += 76;
      g.fillStyle = catColor(e.c); g.beginPath(); g.arc(74, y + 14, 8, 0, Math.PI * 2); g.fill();
      p.text(`${e.yd} · ${catLabel(e.c)}${e.s ? ' · ' + e.s : ''}`.toUpperCase(), 92, y + 2, { font: `600 22px ${fonts.mono}`, color: INK.gold }); y += 44;
      y += p.wrap(e.t, 64, y, W - 128, 62, { font: `46px ${fonts.display}`, color: INK.goldHi, maxLines: 3 }) + 8;
      if (e.n) y += p.wrap(e.n, 64, y, W - 128, 34, { font: `27px ${fonts.body}`, color: INK.dim, maxLines: 2 }) + 12;
      if (e.b) y += p.wrap(e.b, 64, y, W - 128, 38, { font: `29px ${fonts.body}`, maxLines: 8 }) + 16;
      if (e.l.length) { y += p.wrap('Sources: ' + e.l.map(l => l.n || new URL(l.u).hostname.replace('www.', '')).join(' · '), 64, y, W - 128, 30, { font: `23px ${fonts.body}`, color: INK.teal, maxLines: 2 }) + 14; }
      const rel = e.r.map(id => BY_ID.get(id)).filter(Boolean) as Entry[];
      if (rel.length) {
        p.text('RELATED', 64, y, { font: `600 21px ${fonts.mono}`, color: INK.teal }); y += 36;
        rel.slice(0, 3).forEach((r, i) => { p.button('rel-' + i, 64, y, W - 128, 50, `${r.yd} · ${r.t}`, () => { st.sel = r; st.era = eraOf(r.y); }, { font: `24px ${fonts.body}` }); y += 60; });
      }
      p.text('Links open from the Timeline tab in the 2D view.', 64, H - 76, { font: `22px ${fonts.body}`, color: INK.dim });
      return;
    }
    const hits = searchTimeline({ cats: st.cats, era: st.era });
    const pages = Math.max(1, Math.ceil(hits.length / PER)); st.page = Math.min(st.page, pages - 1);
    p.text(`${st.era != null ? eraLabel(st.era) : 'All eras'} · ${hits.length} ${hits.length === 1 ? 'entry' : 'entries'}`, 64, y, { font: `26px ${fonts.display}`, color: INK.goldHi });
    y += 50;
    const rowH = 104;
    hits.slice(st.page * PER, st.page * PER + PER).forEach((e, i) => {
      const id = 'ev-' + i, yy = y + i * (rowH + 8), hov = p.hover === id;
      g.beginPath(); g.roundRect(64, yy, W - 128, rowH, 14); g.fillStyle = hov ? INK.hover : 'rgba(255,255,255,0.035)'; g.fill();
      g.strokeStyle = hov ? INK.teal : 'rgba(216,174,90,0.22)'; g.lineWidth = 2; g.stroke();
      p.text(e.yd, 88, yy + 18, { font: `600 26px ${fonts.mono}`, color: INK.gold });
      p.wrap(e.t, 230, yy + 14, W - 128 - 190, 34, { font: `600 28px ${fonts.body}`, maxLines: 1 });
      g.fillStyle = catColor(e.c); g.beginPath(); g.arc(238, yy + 70, 7, 0, Math.PI * 2); g.fill();
      p.wrap(`${catLabel(e.c)}${e.s ? ' · ' + e.s : ''}${e.n ? ' · ' + e.n : ''}`, 254, yy + 58, W - 128 - 214, 28, { font: `22px ${fonts.body}`, color: INK.dim, maxLines: 1 });
      p.regions.push({ x: 64, y: yy, w: W - 128, h: rowH, id, onClick: () => { st.sel = e; } });
    });
    const by = H - 118;
    p.button('prev', 64, by, 170, 56, '← Earlier', () => { st.page = Math.max(0, st.page - 1); });
    p.text(`${st.page + 1} / ${pages}`, W / 2, by + 28, { font: `24px ${fonts.body}`, color: INK.dim, align: 'center', baseline: 'middle' });
    p.button('next', W - 64 - 170, by, 170, 56, 'Later →', () => { st.page = Math.min(pages - 1, st.page + 1); });
  });
  p.fonts = fonts;
  return { panel: p, state: st };
}
