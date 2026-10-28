# Launch plan for the home redesign

How to put the redesign on production, what to check after, when to roll back, and how to measure
it. The numbers to compare against are in `launch-metrics.md`; this plan says when and how to read
them.

## What ships

Production gets the image staging runs now: main at 62d838a8. It carries the redesign (#174),
redirects for unknown home search values and a real 404 page (#207), and two mod render fixes
(#206, #209). It also first brings #208 to production, which merged after v78: new submissions
render against scenarios that send every documented stdin field.

| | Image | Bundle |
| --- | --- | --- |
| Staging (to ship) | `registry.fly.io/statuslines-staging@sha256:67d45749cf10b7e2c2f71b1b8883c15614551b9e287548d63f5f57c3fc6d55f5` | `/assets/index-CDbgZfe7.js` |
| Production now (v78, 2026-10-20) | `registry.fly.io/statuslines-staging@sha256:e1de33ec21bc0f304f518e011e298373a79f84aba658f3f362c545582ec821b6` | `/assets/index-C-1EWDNF.js` |

There are no migrations and no new environment variables, so rolling back is swapping the image.

Staging sits behind Cloudflare and production doesn't (staging's `server` header is `cloudflare`,
production's is Fly). Cloudflare rewrites some markup and compresses differently, so measure
weight and speed on production, not staging.

## Before deploying

1. Staging still runs the image above. `fly image show --app statuslines-staging` shows that digest,
   and this prints `/assets/index-CDbgZfe7.js`:

   ```bash
   curl -s https://staging.statuslin.es/ | grep -o '/assets/index-[A-Za-z0-9_-]*\.js' | sort -u
   ```

2. You can watch for two hours after the deploy and look again the next morning. On a Friday that
   means being around on Saturday; otherwise deploy on a weekday morning.
3. Retake production's search snapshot from the repo root, so the diff after the deploy shows only
   the deploy's changes (see "Search"):

   ```bash
   python3 -I docs/redesign/home-a/seo/seo_snapshot.py snapshot https://statuslin.es docs/redesign/home-a/seo/prod-before.json
   ```

4. Run PageSpeed Insights (mobile) on `/` and save the result.

## Deploy

1. In your terminal, from the repo root:
   `PATH=/Users/nate/.nvm/versions/node/v24.22.1/bin:$PATH bun run deploy:prod`. It smokes staging
   in a real browser, then promotes the staging image by digest, and refuses if either app's image
   changes while it checks.
2. Confirm production runs it: `fly image show --app statuslines` shows the staging digest, and the
   bundle command above, pointed at `https://statuslin.es/`, prints `/assets/index-CDbgZfe7.js`.
3. Write the deploy date and time, in UTC, in `launch-metrics.md`.

## The first two hours

Never click a copy or install button on production to test it: every click adds to a listing's
install count. Real visitors' events show whether copying works.

1. The smoke test against production passes:

   ```bash
   SMOKE_BASE_URL=https://statuslin.es SMOKE_SIGNED_OUT_ONLY=1 PATH=/Users/nate/.nvm/versions/node/v24.22.1/bin:$PATH bun run smoke
   ```

2. The search snapshot diff in "Search" shows only the expected changes. It also checks that every
   sitemap URL answers 200.
3. `curl -sI 'https://statuslin.es/?kind=foo'` answers 307 to `/`, and
   `curl -sI https://statuslin.es/nope` answers 404.
4. On `/`, each of the 8 hero entries draws in Terminal and in Claude Desktop.
5. `fly status --app statuslines` shows both machines started, and `fly logs --app statuslines`
   shows no repeating errors. `fly.toml` defines no health checks, so "started" is all Fly knows.
6. The exceptions query below shows nothing new on a main page.
7. The copies query below shows real copy events arriving with `surface` set.

The dry run on 2026-10-23 already checked prod's data with this code: every sitemap URL at 1440 and
390px, all 77 share cards and the 8 hero picks, with no errors. These checks confirm the deploy
itself.

## Search

Organic search, almost all of it Google, brought 29% of sessions on 2026-10-16 to 22, second to
direct visits (45%), and it's the main way new visitors find the site. A wrong title or canonical for a few days can cost
rankings that take weeks to come back.

### What changes for search

Checked on 2026-10-23 by snapshotting every sitemap page's head on production, then on this code
running against a copy of production's database, and diffing the two. `seo/prod-before.json` and
`seo/expected-after.json` are those snapshots; `seo/seo_snapshot.py` takes and diffs them. Each
snapshot records the status, the `X-Robots-Tag` header, title, description, canonical, robots
meta, Open Graph and Twitter tags, h1 and JSON-LD.

- **Titles:** home and its `?page=N` pages, `/mods`, and the five topic pages in
  `launch-metrics.md`. `/submit` (noindex) becomes "Submit a mod".
- **h1s:** home ("Customize Claude Code with mods", also on `?page=N`), `/mods` ("Best Claude Code
  mods"), `/resources` ("Claude Code customization tools & resources"), and the git, burn-rate and
  weather topics, which add "and mods".
- **Descriptions:** home, `/mods` (drops "Reviewed by a person"), `/resources`, `/terms`,
  `/status-lines/best` (copies become installs), the five retitled topic pages, and
  `/guide/claude-code-buddy`.
- **JSON-LD:** every status line page's breadcrumb names its topic by its short name ("Git"); topic
  pages list mods as well as status lines; `/resources` lists its new tools; two topic FAQ answers
  and one `/mods` FAQ answer are reworded; the guides' `dateModified` moves to 2026-10-23.
- **New page:** `/how-it-works`, the only URL that joins the sitemap. None leaves it.
- **Redirects:** a home URL with an unknown search value (`/?kind=foo`, `/?sort=foo`) answers 307 to
  the URL without it. Unknown paths answer a real 404 page.
- **Unchanged:** robots.txt; every page's status, canonical, robots meta and `X-Robots-Tag`; every
  status line page's title and description; and every mod, compare and alternatives page's head.
  The three pages outside the sitemap that Search Console shows with impressions
  (`/status-lines/powerline`, `/status-lines/markets`, `/submit`) were already noindex and still
  render.

`/resources` is the site's top search page (about 950 impressions in 28 days, for "ccstatusline"
and similar tool names). Its title keeps those names, but its h1 no longer says "status line".
Watch it closely.

### Right after the deploy

1. From the repo root, snapshot production and diff it against what the dry run predicted:

   ```bash
   cd docs/redesign/home-a/seo
   python3 -I seo_snapshot.py snapshot https://statuslin.es prod-after.json
   python3 -I seo_snapshot.py diff expected-after.json prod-after.json
   python3 -I seo_snapshot.py diff prod-before.json prod-after.json
   ```

   The first diff should show only data that moved since the dry run: the order of a list, a date, a
   new listing. Any change to a title, description, canonical, robots tag, `X-Robots-Tag`, h1 or
   status is a problem. The second diff should match the list above.
2. `curl -sI https://statuslin.es/ | grep -i x-robots-tag` prints nothing. Staging sets
   `noindex, nofollow` there through `NOINDEX_SITE`, an app setting that must never reach
   production.
3. In Search Console, URL Inspection, "Test live URL", on `/`, `/mods`, `/resources` and
   `/status-lines/git`: each is indexable and shows the new title. Then "Request indexing" for `/`,
   `/mods`, `/resources`, `/how-it-works` and the five retitled topic pages. Resubmitting
   `sitemap.xml` under Sitemaps is optional.
4. Google's Rich Results Test on `/`, one `/c/` page, one `/mods/` page and `/guide`: no errors.
5. `https://statuslin.es/llms.txt` loads and names both kinds, for AI search.

### The first four weeks

Search Console data lags about two days, and most of the site's pages get a handful of clicks a
week, so most week-to-week moves are noise. On the old code, `/status-lines/*` clicks went from 13
to 6 in a week, and the guides' positions moved 4 to 5 places.

- **Days 1 to 3:** the Pages report (indexing) for new 404s, soft 404s, "Excluded by noindex" or
  "Duplicate without user-selected canonical" on a main page, and URL Inspection on the retitled
  pages.
- **Weekly:** `seo/search_console.py` by page group. Only `/mods/*` has enough clicks to read week
  to week; October's growth came from mod pages ranking for mod names. Their titles don't change,
  so a drop there points at something else.
- **End of week 1:** search for "claude code status line", "ccstatusline" and two top mod names,
  and note any title Google rewrites.
- **Week 4:** for each retitled page and `/resources`, the impressions and position of its top
  queries over 28 days against the 28 days before. Search Console's Performance report, filtered
  to the page, with Queries and "Compare" dates, shows this.

Act on these:

- **At once:** an indexing error on a main page (5xx, noindex, wrong canonical). Fix forward or roll
  back.
- **At week 4:** a page whose top queries lost more than 30% of their impressions, or more than 2
  places of average position, with search demand steady. Put that page's old title or heading
  back, rather than rolling back the whole release. Topic titles and h1s live in their `FACETS`
  entry (`src/gallery/facets.ts`), the `/resources` h1 in `src/resources/resources-content.tsx`,
  and the rest in `src/lib/page-title.ts`.

## When to roll back

Roll back on any of these:

- A main page (home, a status line or mod page, `/mods`, `/submit`, a guide) returns 5xx or renders
  blank.
- More than 10 `$exception` events in an hour, or the same error in 3 or more sessions on a main
  page. The baseline is 7 in 28 days.
- The search snapshot diff shows a main page with a wrong canonical, a `noindex` or `X-Robots-Tag`
  it shouldn't have, or a non-200 status, and no fix is quick.

Investigate first, and roll back if no fix is quick, on these:

- No copy events after about 40 detail page views. About a quarter of detail views lead to a copy.
  Check copying on the local verify instance (`.claude/skills/verify`), which records to its own
  database, and look in the exceptions for errors near the copy button.
- Home LCP at p75 above 2.5 s, or INP at p75 above 200 ms, over 7 days with at least 100 values.
  Those are Google's "good" limits; the baseline in `launch-metrics.md` is 1.36 s and 72 ms. A
  single day is too noisy: the home page logs 5 to 25 values of each a day, and the old code had
  days with INP at 280 ms.

To roll back, from the repo root (`fly deploy` reads `fly.toml` from the current directory):

```bash
fly deploy --app statuslines --image registry.fly.io/statuslines-staging@sha256:e1de33ec21bc0f304f518e011e298373a79f84aba658f3f362c545582ec821b6
```

`docs/deploy.md` keeps production deploys to `deploy:prod`; this hand deploy is the emergency
exception. Then:

- Confirm the home page's bundle is `/assets/index-C-1EWDNF.js` again, and run the smoke test
  against production.
- Expect a short burst of exceptions: tabs left open on the new version ask for script files the old
  image doesn't have.
- The database needs nothing, and copy events written in between stay valid (the old code ignores
  `surface`). Note the rollback window in `launch-metrics.md` so the comparison leaves it out.
- Staging still runs the new image, so the next `deploy:prod` would promote it again: fix on main,
  deploy staging, then production.

## After that

| When | Look at |
| --- | --- |
| Next morning | Exceptions since the deploy, copies by surface, and the home bounce rate. |
| End of week 1 | Web vitals p75 per page group over the 7 days. The search checks for week 1 above. A PageSpeed Insights rerun on `/`. |
| Week 4 (about 2026-11-20) | The full comparison in `launch-metrics.md`, the 4 weeks after against the 4 weeks before, and the search decision above. Decide what to keep and what to change. |

## How to measure

### PostHog

Project 475282. Paste these into PostHog's SQL editor. Under **Filters**, turn on **Filter out
internal and test users**, so `{filters}` leaves out bot traffic (`docs/analytics-filter.md`). Set
`{deploy}` to the deploy time with its timezone, for example
`toDateTime('2026-10-23 18:05:00', 'UTC')`. A time with no timezone is read in the project's
timezone, America/New_York.

Sessions that start on `/`, the share that open a detail page, and the share that copy (the primary
metric). Run it once for each four-week window, with `{from}` and `{to}` set like `{deploy}`. With
the bot filter on, one query over eight weeks times out:

```sql
select toStartOfWeek(t0) as wk, count() as sessions,
  round(avg(has_detail), 3) as to_detail, round(avg(has_adopt), 3) as adopted
from (
  select $session_id as sid, min(timestamp) as t0,
    argMin(properties.$pathname, timestamp) as entry,
    max(event in ('statusline_detail_viewed', 'mod_detail_viewed')) as has_detail,
    max(event in ('statusline_prompt_copied', 'statusline_script_copied', 'mod_install_command_copied')) as has_adopt
  from events
  where timestamp >= {from} and timestamp < {to} and $session_id != '' and {filters}
  group by sid
)
where entry = '/'
group by wk order by wk
```

Web vitals at p75 by page group, with the number of values behind each:

```sql
select multiIf(properties.$pathname = '/', 'home', properties.$pathname like '/c/%', 'status line page',
    properties.$pathname like '/mods/%', 'mod page', 'other') as page,
  countIf(properties.$web_vitals_LCP_value is not null) as lcp_n,
  round(quantile(0.75)(toFloat(properties.$web_vitals_LCP_value))) as lcp_p75_ms,
  countIf(properties.$web_vitals_INP_value is not null) as inp_n,
  round(quantile(0.75)(toFloat(properties.$web_vitals_INP_value))) as inp_p75_ms,
  round(quantile(0.75)(toFloat(properties.$web_vitals_CLS_value)), 3) as cls_p75
from events
where event = '$web_vitals' and timestamp >= {deploy} and {filters}
group by page order by lcp_n desc
```

Exceptions, newest first. This query leaves out `{filters}`, so it shows an error whoever hit it:

```sql
select timestamp, $session_id as session, properties.$exception_types as types,
  properties.$current_url as url
from events
where event = '$exception' and timestamp >= {deploy}
order by timestamp desc limit 50
```

Copies by surface (`home_hero` is the hero's button, `page` a detail page), next to detail views:

```sql
select event, properties.surface as surface, count() as n
from events
where event in ('statusline_prompt_copied', 'statusline_script_copied', 'mod_install_command_copied',
    'statusline_detail_viewed', 'mod_detail_viewed')
  and timestamp >= {deploy} and {filters}
group by event, surface order by n desc
```

Home bounce rate by week. `{filters}` fails on the `sessions` table, so the query keeps the sessions
whose page views pass it:

```sql
select toStartOfWeek($start_timestamp) as wk, count() as sessions, round(avg($is_bounce), 3) as bounce
from sessions
where $entry_pathname = '/' and $start_timestamp >= now() - interval 56 day
  and session_id in (
    select $session_id from events
    where event = '$pageview' and timestamp >= now() - interval 56 day and {filters}
  )
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

For one page's queries, use Search Console's Performance report with a page filter, the Queries
tab and "Compare" dates. For week 4, also compare with the per-group table in `launch-metrics.md`.

### Lab performance

- PageSpeed Insights (pagespeed.web.dev), mobile, on `/`: the score, LCP, TBT, CLS and bytes
  transferred, before and after. The site may get too little traffic for PageSpeed's field data;
  PostHog's web vitals above are the field numbers.
- Home page weight, on production only (see "What ships"):

  ```bash
  curl -s https://statuslin.es/ | wc -c
  curl -s -H 'Accept-Encoding: gzip, deflate, br, zstd' -o /dev/null -w '%{size_download}\n' https://statuslin.es/
  ```

  Before the deploy, production's home page is 162 KB, 19 KB as Chrome receives it (zstd). The dry
  run's HTML was 403 KB, 82 KB gzipped, with prod's 76 items. The item data comes after the hero's
  markup, so the hero paints first; the extra weight delays when the page becomes interactive,
  which INP and TBT show.

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
