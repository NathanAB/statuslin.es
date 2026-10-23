"""Search Console clicks, impressions, CTR and position by page group, for a date window and the
window of the same length just before it.

    python3 -I search_console.py 2026-10-24 2026-10-30

Reads sc-domain:statuslin.es through the Composio CLI (GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY).
Search Console data lags about two days, so end the window two days ago.
"""

import collections
import json
import subprocess
import sys
from datetime import date, timedelta

SITE = 'sc-domain:statuslin.es'
GROUPS = [
    ('/c/', '/c/*'), ('/mods/', '/mods/*'), ('/status-lines/', '/status-lines/*'),
    ('/guide', 'guides'), ('/compare', 'compare'), ('/alternatives', 'alternatives'),
    ('/resources', '/resources'), ('/how-it-works', '/how-it-works'),
]


def query(start, end):
    body = {'site_url': SITE, 'start_date': start, 'end_date': end, 'dimensions': ['page'],
            'row_limit': 1000, 'data_state': 'all'}
    out = json.loads(subprocess.run(['composio', 'execute', 'GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY',
                                     '-d', json.dumps(body)], capture_output=True, text=True).stdout)
    # A large response comes back as a path to a file instead of inline.
    if out.get('storedInFile'):
        with open(out['outputFilePath']) as f:
            out = json.load(f)

    def rows(o):
        if isinstance(o, dict):
            if 'rows' in o:
                return o['rows']
            for v in o.values():
                found = rows(v)
                if found is not None:
                    return found
        return None

    found = rows(out)
    if found is None:
        sys.exit(f'Search Console returned no rows for {start}..{end}: {json.dumps(out)[:300]}')
    return found


def group(url):
    path = url.replace('https://statuslin.es', '') or '/'
    for prefix, name in GROUPS:
        if path.startswith(prefix):
            return name
    return {'/': '/', '/mods': '/mods'}.get(path, 'other')


def totals(rows):
    by = collections.defaultdict(lambda: [0, 0, 0.0])
    for r in rows:
        g = by[group(r['keys'][0])]
        g[0] += r['clicks']
        g[1] += r['impressions']
        g[2] += r['position'] * r['impressions']
    return by


def main(start, end):
    s, e = date.fromisoformat(start), date.fromisoformat(end)
    days = (e - s).days + 1
    before = totals(query((s - timedelta(days)).isoformat(), (s - timedelta(1)).isoformat()))
    after = totals(query(start, end))
    print(f'{start}..{end} against the {days} days before\n')
    print(f"{'group':18} {'clicks':>13} {'impressions':>15} {'ctr':>13} {'position':>13}")
    for name in sorted(set(before) | set(after), key=lambda n: -after.get(n, before[n])[1]):
        b, a = before.get(name, [0, 0, 0.0]), after.get(name, [0, 0, 0.0])
        ctr = lambda x: x[0] / x[1] if x[1] else 0
        pos = lambda x: x[2] / x[1] if x[1] else 0
        print(f'{name:18} {b[0]:>5} -> {a[0]:<5} {b[1]:>6} -> {a[1]:<6} '
              f'{ctr(b):.3f} -> {ctr(a):.3f} {pos(b):5.1f} -> {pos(a):<5.1f}')


if __name__ == '__main__':
    main(*sys.argv[1:3])
