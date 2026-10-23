# Launch plan for the home redesign

How to put the redesign on production, what to check after, when to roll back, and how to measure
it. The numbers to compare against are in `launch-metrics.md`; this plan says when and how to read
them.

## What ships

Production gets the image staging runs now: main at 62d838a8, which carries the redesign (#174),
redirects for unknown home search values and a real 404 page (#207), and two mod render fixes
(#206, #209).

| | Image | Bundle |
| --- | --- | --- |
| Staging (to ship) | `registry.fly.io/statuslines-staging@sha256:67d45749cf10b7e2c2f71b1b8883c15614551b9e287548d63f5f57c3fc6d55f5` | `index-CDbgZfe7.js` |
| Production now (v78, 2026-10-20) | `registry.fly.io/statuslines-staging@sha256:e1de33ec21bc0f304f518e011e298373a79f84aba658f3f362c545582ec821b6` | |

There are no migrations and no new environment variables, so rolling back is swapping the image.

## Before deploying

- Staging still runs the image above: `fly image show --app statuslines-staging` shows that
  digest, and `curl -s https://staging.statuslin.es/ | grep -o 'index-[A-Za-z0-9_-]*\.js'` prints
  `index-CDbgZfe7.js`.
- You can watch for two hours after the deploy and look again the next morning. On a Friday that
  means being around on Saturday; otherwise deploy on a weekday morning.
- Run PageSpeed Insights (mobile) on `/`, one `/c/` page and `/mods`, and save the results. The
  PostHog and Search Console baselines are already in `launch-metrics.md`.

## Deploy

1. In your terminal: `PATH=/Users/nate/.nvm/versions/node/v24.22.1/bin:$PATH bun run deploy:prod`.
   It smokes staging in a real browser, then promotes the staging image by digest, and refuses if
   either app's image changes while it checks.
2. Confirm production runs it: `fly image show --app statuslines` shows the staging digest, and
   `curl -s https://statuslin.es/ | grep -o 'index-[A-Za-z0-9_-]*\.js'` prints `index-CDbgZfe7.js`.
3. Write the deploy date and time in `launch-metrics.md`.

## The first two hours

Never click a copy or install button on production to test it: every click adds to a listing's
install count. Real visitors' events show whether copying works.

1. The smoke test against production passes:

   ```bash
   SMOKE_BASE_URL=https://statuslin.es SMOKE_SIGNED_OUT_ONLY=1 bun run smoke
   ```

2. Every sitemap URL answers 200. This prints nothing when they all do:

   ```bash
   curl -s https://statuslin.es/sitemap.xml | grep -o '<loc>[^<]*' | sed 's/<loc>//' | while read u; do echo "$(curl -s -o /dev/null -w '%{http_code}' "$u") $u"; done | grep -v '^200'
   ```

3. `curl -sI 'https://statuslin.es/?kind=foo'` answers 307 to `/`, and
   `curl -sI https://statuslin.es/nope` answers 404.
4. On `/`, each of the 8 hero entries draws in Terminal and in Claude Desktop.
5. `fly status --app statuslines` shows healthy machines, and `fly logs --app statuslines` shows no
   repeating errors.
6. The exceptions query below shows nothing new on a main page.
7. The copies by surface query below shows real copy events arriving with `surface` set.

The dry run on 2026-10-23 already checked prod's data with this code: every sitemap URL at 1440 and
390px, all 77 share cards and the 8 hero picks, with no errors. These checks confirm the deploy
itself.

## Search

Most visits come from Google, so search gets its own checks. A title or canonical that's wrong for a
few days can cost rankings that take weeks to come back.

### What changes for search

Checked on 2026-10-23 by snapshotting every sitemap page's head on production and on staging and
comparing them (`seo/seo_snapshot.py`):

- **Titles:** the 7 in `launch-metrics.md`. Every other page keeps its title.
- **h1s:** home ("Customize Claude Code with mods"), `/mods` ("Best Claude Code mods"),
  `/resources` ("Claude Code customization tools & resources"), and the git, burn-rate and weather
  topics, which add "and mods".
- **Meta descriptions:** home, `/mods`, `/resources`, `/terms`, `/status-lines/best` (copies become
  installs) and the five retitled topic pages. `/mods` drops "Reviewed by a person".
- **JSON-LD:** topic pages list mods as well as status lines; `/resources` lists its new tools; the
  guides' `dateModified` moved to 2026-10-23.
- **New page:** `/how-it-works`, in the sitemap.
- **Redirects:** a home URL with an unknown search value (`/?kind=foo`, `/?sort=foo`) answers 307 to
  the URL without it. Unknown paths answer a real 404 page.
- **Unchanged:** robots.txt, every status line page's head, and every mod page's title and
  description. No URL leaves the sitemap: the dry run on prod's data listed every URL production's
  sitemap has. No URL that Search Console shows with impressions stops answering: the three outside
  the sitemap (`/status-lines/powerline`, `/status-lines/markets`, `/submit`) were already noindex
  and still render.

### Before deploying

Take a fresh snapshot of production right before the deploy, so the diff after it shows only the
deploy's changes. `seo/prod-before.json` is the one taken on 2026-10-23; retake it if content
changed since.

```bash
cd docs/redesign/home-a/seo && python3 -I seo_snapshot.py snapshot https://statuslin.es prod-before.json
```

### Right after the deploy

1. Snapshot production again and compare:

   ```bash
   python3 -I seo_snapshot.py snapshot https://statuslin.es prod-after.json
   python3 -I seo_snapshot.py diff prod-before.json prod-after.json
   ```

   Every changed page must be in the list above. Fix anything else before Google recrawls: a
   changed canonical, a robots `noindex` on an indexed page, a status line or mod page's title, a
   URL that left the sitemap, or a status other than 200.
2. In Search Console, under Sitemaps, resubmit `https://statuslin.es/sitemap.xml`.
3. URL Inspection, "Test live URL", on `/`, `/mods` and `/status-lines/git`: the page is
   indexable and the live title is the new one. Then "Request indexing" for `/`, `/mods`,
   `/how-it-works` and the five retitled topic pages.
4. Google's Rich Results Test on `/`, one `/c/` page, one `/mods/` page and `/guide`: no errors.
5. `https://statuslin.es/llms.txt` loads and names both kinds, for AI search.

### The first two weeks

Search Console data lags about two days. Each day, compare clicks, impressions and position by
page group with the days before the deploy, using `seo/search_console.py` (under "How to
measure"):

- The retitled pages and the home page, which change the most.
- `/mods/*`: October's growth came from mod pages ranking for mod names. Their titles don't change,
  so a drop there points at something else, such as the page losing content or links.
- The Pages report (indexing): new 404s, soft 404s, "Excluded by noindex", or "Duplicate without
  user-selected canonical" on a main page.
- How Google shows the new titles: search for "claude code status line", "ccstatusline" and two
  top mod names, and note any title Google rewrites.

Rankings move for a few days after titles change while Google recrawls, so don't act on less than
a week of data. Act on these:

- **Now:** an indexing error on a main page (5xx, noindex, wrong canonical). Fix forward or roll
  back.
- **After two weeks:** a page group's clicks down more than 30% against the two weeks before, with
  its average position down more than 2 and impressions steady, so it isn't a fall in demand. Put
  that page's old title or heading back first (topic titles live in their `FACETS` entry, the rest in
  `src/lib/page-title.ts`), rather than rolling back the whole release.

## When to roll back

Roll back on any of these:

- A main page (home, a status line or mod page, `/mods`, `/submit`, a guide) returns 5xx or renders
  blank.
- More than 10 `$exception` events in an hour, or one error repeating on a main page. The baseline
  is 7 in 28 days.
- The search snapshot diff shows a main page with a wrong canonical, a `noindex` it shouldn't have,
  or a non-200 status, and no fix is quick.

Investigate first, and roll back if no fix is quick, on these:

- No copy events in the first 6 daytime hours. The week before launch had 9 to 49 a day. Check
  copying on the local verify instance (`.claude/skills/verify`), which records to its own
  database, and look in the exceptions for errors near the copy button.
- Home LCP at p75 above 2.5 s, or INP at p75 above 200 ms, once a day of samples is in. Those are
  Google's "good" limits; the baseline in `launch-metrics.md` is 1.28 s and 96 ms.

To roll back:

```bash
fly deploy --app statuslines --image registry.fly.io/statuslines-staging@sha256:e1de33ec21bc0f304f518e011e298373a79f84aba658f3f362c545582ec821b6
```

The database needs nothing, and copy events written in between stay valid (the old code ignores
`surface`). Confirm the home page's bundle name changed back, and note the rollback window in
`launch-metrics.md` so the comparison leaves it out. Staging still runs the new image, so the next
`deploy:prod` would promote it again: fix on main, deploy staging, then production.

## After that

| When | Look at |
| --- | --- |
| Next morning | Exceptions since the deploy; copies by surface; home bounce rate; web vitals (about 40 home samples a day, enough for a first read). |
| Daily, for two weeks | Search Console by page group, as in "Search" above. |
| End of week 1 | Web vitals p75 per page group over the 7 days. URL Inspection on the 7 retitled pages: does Google show the new title? A PageSpeed Insights rerun. |
| End of week 2 | The search decision in "Search" above: keep each new title, or put an old one back. |
| Week 4 (about 2026-11-20) | The full comparison in `launch-metrics.md`: the 4 weeks after against the 4 weeks before. PageSpeed Insights' field data (CrUX) covers 28 days by then. Decide what to keep and what to change. |

## How to measure

### PostHog

Project 475282. Paste these into PostHog's SQL editor, with `{deploy}` set to the deploy time, for
example `toDateTime('2026-10-23 18:00:00')`.

Sessions that start on `/`, the share that open a detail page, and the share that copy (the primary
metric):

```sql
select toStartOfWeek(t0) as wk, count() as sessions,
  round(avg(has_detail), 3) as to_detail, round(avg(has_adopt), 3) as adopted
from (
  select $session_id as sid, min(timestamp) as t0,
    argMin(properties.$pathname, timestamp) as entry,
    max(event in ('statusline_detail_viewed', 'mod_detail_viewed')) as has_detail,
    max(event in ('statusline_prompt_copied', 'statusline_script_copied', 'mod_install_command_copied')) as has_adopt
  from events
  where timestamp >= now() - interval 56 day and $session_id != ''
  group by sid
)
where entry = '/'
group by wk order by wk
```

Web vitals at p75 by page group:

```sql
select multiIf(properties.$pathname = '/', 'home', properties.$pathname like '/c/%', 'status line page',
    properties.$pathname like '/mods/%', 'mod page', 'other') as page,
  count() as n,
  round(quantile(0.75)(toFloat(properties.$web_vitals_LCP_value))) as lcp_p75_ms,
  round(quantile(0.75)(toFloat(properties.$web_vitals_CLS_value)), 3) as cls_p75,
  round(quantile(0.75)(toFloat(properties.$web_vitals_INP_value))) as inp_p75_ms
from events
where event = '$web_vitals' and timestamp >= {deploy}
group by page order by n desc
```

Exceptions, newest first:

```sql
select timestamp, properties.$exception_types as types, properties.$current_url as url
from events
where event = '$exception' and timestamp >= {deploy}
order by timestamp desc limit 50
```

Copies by surface (`home_hero` is the hero's button, `page` a detail page):

```sql
select event, properties.surface as surface, count() as n
from events
where event in ('statusline_prompt_copied', 'statusline_script_copied', 'mod_install_command_copied')
  and timestamp >= {deploy}
group by event, surface order by n desc
```

Home bounce rate by week:

```sql
select toStartOfWeek($start_timestamp) as wk, count() as sessions, round(avg($is_bounce), 3) as bounce
from sessions
where $entry_pathname = '/' and $start_timestamp >= now() - interval 56 day
group by wk order by wk
```

`marketplace_fetched` per week counts whole-marketplace adds; compare it the same way.

### Search Console

Property `sc-domain:statuslin.es`. `seo/search_console.py` prints clicks, impressions, CTR and
average position by page group for a date window against the same number of days before it,
through the Composio CLI:

```bash
python3 -I docs/redesign/home-a/seo/search_console.py 2026-10-24 2026-10-30
```

In the Search Console UI, Performance with a page filter and "Compare" dates gives the same numbers
for one page. For week 4, compare with the per-group table in `launch-metrics.md`, using 28-day
windows.

`seo/seo_snapshot.py` takes and compares the head snapshots described in "Search".

### Lab performance

- PageSpeed Insights (pagespeed.web.dev), mobile, on `/`, one `/c/` page and `/mods`. Record the
  score, LCP, TBT, CLS and the bytes transferred, before and after.
- Home page weight: `curl -s https://statuslin.es/ | wc -c`, and gzipped with
  `curl -s -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download}' https://statuslin.es/`. The
  dry run measured 403 KB (82 KB gzipped) with prod's 76 items, against 162 KB (19 KB) before. The
  item data comes after the hero's markup, so the hero paints first; the extra weight delays when
  the page becomes interactive, which INP and TBT show.

## Follow-ups after launch

- Re-render existing previews so they show the stdin fields #208 added (prompt cache, fast mode and
  others): `bun run with-env production scripts/rerender-previews.ts`. Check first that the
  production env sets `E2B_API_KEY`; without it the script uses the fake runner and writes empty
  previews over the real ones. Run it on staging first.
- Trim the home page's per-item preview and search data, or move search to the server, before the
  catalog grows much. Do it sooner if INP or TBT regress.
- Small issues found in review and left for later: a signed-in visitor sees the signed-out header on
  the 404 page and on `/admin` without admin rights; an empty gallery says "Nothing matches these
  filters yet." with no filter set; the hero's "Open page" link is announced with a stray space
  before its colon.
