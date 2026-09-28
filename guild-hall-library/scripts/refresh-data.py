"""Refresh the two data snapshots the Hall ships with.

  python3 scripts/refresh-data.py

- src/data/library.json   from https://library.xrguild.org (GitBook llms.txt + each item's .md page)
- src/data/timeline.json  from https://www.xrguild.org/api/timeline (the public feed behind /timeline)
- src/data/events.json    from https://www.xrguild.org/api/calendar/events (the public feed behind /calendar)

Only public fields are kept. Contributor keys and feedback counts from the timeline are dropped.
"""
import json, re, datetime, urllib.request, concurrent.futures

UA = {'User-Agent': 'XRGuildHall-refresh/1.0'}
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read().decode('utf-8', 'ignore')

TODAY = datetime.date.today().isoformat()
CATS = {'ai-ethics': 'AI Ethics', 'current-peer-reviewed-immersive-technologies': 'Peer-Reviewed Immersive Tech',
        'ethical-responsibility': 'Ethical Responsibility', 'xr-industry-news-events-sources': 'XR Industry News & Sources',
        'neurotechnology-brain-tech-and-ethical-challenges': 'Neurotech & Brain Tech', 'mind-control-and-privacy-at-work': 'Mind Control & Privacy at Work',
        'physiological-and-psychological-effects-of-xr': 'Physiological & Psychological Effects', 'privacy-and-policy': 'Privacy & Policy', 'security-and-safety': 'Security & Safety'}

def ntype(t):
    t = t.lower()
    if 'choose' in t or not t: return 'Other'
    for k, v in [('journal', 'Journal / White Paper'), ('article', 'Article / Report'), ('report', 'Article / Report'), ('video', 'Video'),
                 ('podcast', 'Podcast'), ('audio', 'Podcast'), ('blog', 'Blog'), ('news', 'News'), ('standard', 'Standard / Spec')]:
        if k in t: return v
    return 'Other'

def library():
    idx = get('https://library.xrguild.org/llms.txt')
    rows = [(m.group(1).replace('\\[', '[').replace('\\]', ']'), m.group(2)) for m in re.finditer(r'^- \[(.+?)\]\((https://library\.xrguild\.org/[^)]+\.md)\)', idx, re.M)]
    rows = [r for r in rows if '/' in r[1].replace('https://library.xrguild.org/', '') and r[1].split('/')[3] in CATS]
    def one(r):
        title, md = r
        body = get(md).split('\n---\n\n# Agent Instructions')[0]
        f = lambda k: (re.search(r'\*\*' + k + r':\*\*\s*(.+)', body) or [None, ''])[1].strip()
        sm = re.search(r'## Summary\s+(.+?)(\n## |\Z)', body, re.S)
        s = re.sub(r'\s+', ' ', sm.group(1)).strip().replace('\\', '') if sm else ''
        return dict(t=title, u=md[:-3], c=md.split('/')[3], a=f('Authors')[:140], d=f('Publication Date')[:40], l=re.sub(r'^<|>$', '', f('Link')),
                    k=f('Keywords')[:220], y=ntype(f('Type')), s=(s[:420] + '…') if len(s) > 420 else s)
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        items = list(ex.map(one, rows))
    cats = [dict(id=k, name=v, url='https://library.xrguild.org/' + k, count=sum(i['c'] == k for i in items)) for k, v in CATS.items()]
    json.dump(dict(fetched=TODAY, source='https://library.xrguild.org', categories=cats, items=items), open('src/data/library.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print('library:', len(items), 'works')

def timeline():
    d = json.loads(get('https://www.xrguild.org/api/timeline'))
    out = []
    for x in sorted(d, key=lambda x: (x['year'], x['term'])):
        if x.get('pending'): continue
        out.append(dict(id=x['id'][:8], t=x['term'].strip(), y=round(x['year'], 2), yd=(x.get('yearDisplay') or str(int(x['year']))).strip(),
                        n=(x.get('names') or '').strip(), c=x['category'], s=(x.get('subcategory') or '').strip(), b=(x.get('body') or '').strip(),
                        l=[{'u': l['url'], 'n': l.get('label') or ''} for l in (x.get('links') or []) if l.get('url', '').startswith('http')][:4],
                        p=x.get('priority', 0), r=[i[:8] for i in (x.get('relatedItems') or [])]))
    json.dump(dict(fetched=TODAY, source='https://www.xrguild.org/timeline', entries=out), open('src/data/timeline.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print('timeline:', len(out), 'entries')

def events():
    d = json.loads(get('https://www.xrguild.org/api/calendar/events'))
    keep = ('id', 'title', 'start', 'end', 'allDay', 'location', 'description', 'eventUrl')
    out = [{k: e.get(k) for k in keep} for e in d.get('events', [])]
    json.dump(dict(fetched=TODAY, source='https://www.xrguild.org/calendar', events=out), open('src/data/events.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print('events:', len(out), 'upcoming')

if __name__ == '__main__':
    library(); timeline(); events()
