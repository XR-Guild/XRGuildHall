import tl from './data/timeline.json';

// XR Guild Timeline of XR (xrguild.org/timeline), community-maintained.
export interface Entry { id: string; t: string; y: number; yd: string; n: string; c: string; s: string; b: string; l: { u: string; n: string }[]; p: number; r: string[]; }
export const TIMELINE = tl as { fetched: string; source: string; entries: Entry[] };
export const ENTRIES = TIMELINE.entries;
export const BY_ID = new Map(ENTRIES.map(e => [e.id, e]));

export const TL_CATS: { id: string; name: string; color: string }[] = [
  { id: 'products', name: 'Products', color: '#5fe0c6' },
  { id: 'research', name: 'Research', color: '#a791ff' },
  { id: 'concepts', name: 'Concepts', color: '#f1d58f' },
  { id: 'fiction', name: 'Fiction', color: '#f09a7a' },
  { id: 'infrastructure', name: 'Infrastructure', color: '#8fb8ff' },
];
export const catColor = (c: string) => TL_CATS.find(x => x.id === c)?.color ?? '#a9b3a9';
export const catLabel = (c: string) => TL_CATS.find(x => x.id === c)?.name ?? c;

/** Eras used for the spine: everything before 1900 is one bucket, then decades. */
export const eraOf = (y: number) => (y < 1900 ? 1800 : Math.floor(y / 10) * 10);
export const eraLabel = (e: number) => (e === 1800 ? 'Before 1900' : `${e}s`);
export const ERAS = Array.from(new Set(ENTRIES.map(e => eraOf(e.y)))).sort((a, b) => a - b);
export const eraCount = (e: number, cats?: Set<string>) => ENTRIES.filter(x => eraOf(x.y) === e && (!cats || !cats.size || cats.has(x.c))).length;

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const tok = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 1);

export interface TLQuery { text?: string; cats?: Set<string>; era?: number | null; }
export function searchTimeline(q: TLQuery, order: 'year' | 'relevance' = 'year'): Entry[] {
  const terms = tok(q.text ?? '');
  const res: { e: Entry; s: number }[] = [];
  for (const e of ENTRIES) {
    if (q.cats && q.cats.size && !q.cats.has(e.c)) continue;
    if (q.era != null && eraOf(e.y) !== q.era) continue;
    if (!terms.length) { res.push({ e, s: 0 }); continue; }
    const fields: [string, number][] = [[e.t, 5], [e.n, 3], [e.s + ' ' + e.c, 2], [e.b, 1], [e.yd, 4]];
    let score = 0, hit = 0;
    for (const term of terms) {
      let best = 0;
      for (const [f, w] of fields) for (const wd of tok(f)) {
        if (wd === term) best = Math.max(best, w); else if (term.length >= 3 && wd.startsWith(term)) best = Math.max(best, w * 0.7);
      }
      if (best) hit++; score += best;
    }
    if (hit) res.push({ e, s: score * (hit / terms.length) });
  }
  // stay chronological: the timeline is the organizing idea
  return res.sort((a, b) => order === 'year' ? a.e.y - b.e.y || b.s - a.s : b.s - a.s || a.e.y - b.e.y).map(r => r.e);
}

export function timelineContext(question: string, n = 12) {
  return searchTimeline({ text: question }, 'relevance').slice(0, n).sort((a, b) => a.y - b.y);
}
