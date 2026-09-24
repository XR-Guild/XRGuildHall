import lib from './data/library.json';

export interface Item { t: string; u: string; c: string; a: string; d: string; l: string; k: string; y: string; s: string; }
export interface Category { id: string; name: string; url: string; count: number; }

export const LIBRARY = lib as { fetched: string; source: string; categories: Category[]; items: Item[] };
export const CATS = LIBRARY.categories;
export const catName = (id: string) => CATS.find(c => c.id === id)?.name ?? id;
export const TYPES = Array.from(new Set(LIBRARY.items.map(i => i.y))).sort();

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const tok = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 1);
const STOP = new Set(['the', 'and', 'of', 'in', 'to', 'for', 'on', 'an', 'is', 'with', 'what', 'how', 'does', 'about', 'are']);

interface Indexed { item: Item; fields: [string[], number][]; year: number; }
const INDEX: Indexed[] = LIBRARY.items.map(item => {
  const ym = item.d.match(/(19|20)\d{2}/);
  return {
    item,
    year: ym ? +ym[0] : 0,
    fields: [[tok(item.t), 6], [tok(item.k), 4], [tok(item.a), 3], [tok(catName(item.c)), 2], [tok(item.s), 1]],
  };
});

export interface Query { text: string; cat?: string; type?: string; sort?: 'relevance' | 'newest' | 'title'; }

export function search(q: Query): Item[] {
  const terms = tok(q.text).filter(w => !STOP.has(w));
  let res: { it: Indexed; score: number }[] = [];
  for (const it of INDEX) {
    if (q.cat && it.item.c !== q.cat) continue;
    if (q.type && it.item.y !== q.type) continue;
    let score = terms.length ? 0 : 1;
    let matched = 0;
    for (const term of terms) {
      let best = 0;
      for (const [words, w] of it.fields) {
        for (const wd of words) {
          if (wd === term) best = Math.max(best, w * 1.0);
          else if (wd.startsWith(term) && term.length >= 3) best = Math.max(best, w * 0.7);
          else if (term.length >= 5 && wd.includes(term)) best = Math.max(best, w * 0.4);
        }
      }
      if (best > 0) matched++;
      score += best;
    }
    if (terms.length && matched === 0) continue;
    if (terms.length > 1) score *= 0.6 + 0.4 * (matched / terms.length);
    // exact phrase bonus
    if (q.text.trim().length > 3 && norm(it.item.t).includes(norm(q.text.trim()))) score += 8;
    res.push({ it, score });
  }
  const sort = q.sort ?? 'relevance';
  res.sort((a, b) => sort === 'newest' ? b.it.year - a.it.year || b.score - a.score
    : sort === 'title' ? a.it.item.t.localeCompare(b.it.item.t)
    : b.score - a.score || b.it.year - a.it.year);
  return res.map(r => r.it.item);
}

/** Compact catalog lines for grounding an answer. */
export function contextFor(question: string, n = 24) {
  const hits = search({ text: question }).slice(0, n);
  return hits.map((it, i) => `[${i + 1}] ${it.t} | ${catName(it.c)} | ${it.y}${it.d ? ' | ' + it.d : ''}${it.a ? ' | ' + it.a : ''}\nURL: ${it.u}\nKeywords: ${it.k}\nSummary: ${it.s}`).join('\n\n');
}

export const QUICK_TOPICS = ['eye tracking', 'children', 'harassment', 'neural data', 'deepfakes', 'consent', 'avatars', 'governance', 'mental health', 'standards'];
