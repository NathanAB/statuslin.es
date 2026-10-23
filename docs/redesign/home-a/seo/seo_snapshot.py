"""Snapshot and compare what search engines read on every sitemap page.

    python3 -I seo_snapshot.py snapshot https://statuslin.es prod-before.json
    python3 -I seo_snapshot.py diff prod-before.json prod-after.json

A snapshot records, for each sitemap URL: the status code (redirects are not followed), the
X-Robots-Tag header, the title,
meta description, canonical, robots meta, Open Graph and Twitter tags, the h1 text and the JSON-LD.
It also records robots.txt and the sitemap's URL list. The site's origin is written as {site}, so
a staging snapshot compares with a production one.
"""

import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

# Filtered home views, and pages outside the sitemap that had search impressions (2026-07 to 10).
EXTRA_PATHS = [
    '/?sort=top', '/?kind=mods', '/?tags=git',
    '/status-lines/powerline', '/status-lines/markets', '/submit',
]
META_NAMES = {'description', 'robots', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'}
META_PROPERTIES = {'og:title', 'og:description', 'og:image', 'og:url', 'og:type'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'statuslines-seo-snapshot'})
    try:
        with OPENER.open(request, timeout=30) as response:
            return response.status, response.headers, response.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read().decode('utf-8', 'replace')


class Head(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.facts = {'title': None, 'canonical': None, 'h1': [], 'jsonld': []}
        self._in = None
        self._text = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title' and self.facts['title'] is None:
            self._in, self._text = 'title', []
        elif tag == 'h1':
            self._in, self._text = 'h1', []
        elif tag == 'script' and a.get('type') == 'application/ld+json':
            self._in, self._text = 'jsonld', []
        elif tag == 'link' and a.get('rel') == 'canonical':
            self.facts['canonical'] = a.get('href')
        elif tag == 'meta':
            key = a.get('name') if a.get('name') in META_NAMES else a.get('property')
            if key in META_NAMES or key in META_PROPERTIES:
                self.facts[key] = a.get('content')

    def handle_endtag(self, tag):
        if self._in and tag == {'title': 'title', 'h1': 'h1', 'jsonld': 'script'}[self._in]:
            text = ''.join(self._text)
            if self._in == 'title':
                self.facts['title'] = text.strip()
            elif self._in == 'h1':
                self.facts['h1'].append(re.sub(r'\s+', ' ', text).strip())
            else:
                try:
                    self.facts['jsonld'].append(json.loads(text))
                except ValueError:
                    self.facts['jsonld'].append({'unparsed': text[:200]})
            self._in = None

    def handle_data(self, data):
        if self._in:
            self._text.append(data)


def normalize(value, origin):
    text = json.dumps(value, sort_keys=True).replace(origin, '{site}')
    return json.loads(text)


def snapshot(base, out):
    base = base.rstrip('/')
    _, _, sitemap = fetch(f'{base}/sitemap.xml')
    urls = re.findall(r'<loc>([^<]+)</loc>', sitemap)
    paths = sorted({u.replace(base, '') or '/' for u in urls} | set(EXTRA_PATHS))
    pages = {}
    for path in paths:
        status, headers, body = fetch(f'{base}{path}')
        # NOINDEX_SITE noindexes a whole app through this header, not through the page's meta tags.
        page = {'status': status, 'x-robots-tag': headers.get('X-Robots-Tag')}
        if 300 <= status < 400:
            page['location'] = headers.get('Location')
        if 'html' in (headers.get('Content-Type') or ''):
            parser = Head()
            parser.feed(body)
            page.update(parser.facts)
        pages[path] = normalize(page, base)
        print(f'{status} {path}', file=sys.stderr)
    _, _, robots = fetch(f'{base}/robots.txt')
    result = {
        'base': base,
        'taken_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'robots': robots.replace(base, '{site}'),
        'sitemap': sorted(u.replace(base, '') or '/' for u in urls),
        'pages': pages,
    }
    with open(out, 'w') as f:
        json.dump(result, f, indent=2, sort_keys=True)
    print(f'{len(pages)} pages -> {out}', file=sys.stderr)


def flatten(value, prefix=''):
    if isinstance(value, dict):
        for key, item in value.items():
            yield from flatten(item, f'{prefix}.{key}' if prefix else key)
    elif isinstance(value, list):
        for i, item in enumerate(value):
            yield from flatten(item, f'{prefix}[{i}]')
    else:
        yield prefix, value


def diff(before_path, after_path):
    before, after = (json.load(open(p)) for p in (before_path, after_path))
    print(f"before: {before['base']} at {before['taken_at']}\nafter:  {after['base']} at {after['taken_at']}")
    if before['robots'] != after['robots']:
        print('\nrobots.txt changed')
    gone = sorted(set(before['sitemap']) - set(after['sitemap']))
    added = sorted(set(after['sitemap']) - set(before['sitemap']))
    print(f'\nsitemap: {len(gone)} URLs left it, {len(added)} joined it')
    for path in gone:
        print(f'  - {path}')
    for path in added:
        print(f'  + {path}')
    shared = sorted(set(before['pages']) & set(after['pages']))
    changed = 0
    for path in shared:
        old, new = dict(flatten(before['pages'][path])), dict(flatten(after['pages'][path]))
        keys = sorted(k for k in set(old) | set(new) if old.get(k) != new.get(k))
        if not keys:
            continue
        changed += 1
        print(f'\n{path}')
        for key in keys[:12]:
            print(f'  {key}:\n    - {old.get(key)!r}\n    + {new.get(key)!r}')
        if len(keys) > 12:
            print(f'  ...and {len(keys) - 12} more changed fields')
    print(f'\n{changed} of {len(shared)} shared pages changed')


if __name__ == '__main__':
    command, *args = sys.argv[1:]
    {'snapshot': snapshot, 'diff': diff}[command](*args)
