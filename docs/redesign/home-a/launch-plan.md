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

## When to roll back

Roll back on any of these:

- A main page (home, a status line or mod page, `/mods`, `/submit`, a guide) returns 5xx or renders
  blank.
- More than 10 `$exception` events in an hour, or one error repeating on a main page. The baseline
  is 7 in 28 days.

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
| End of week 1 | Web vitals p75 per page group over the 7 days. In Search Console, URL Inspection on the 7 retitled pages (do they show the new title?), their impressions and position against the week before, and the Pages report for new 404s or server errors. A PageSpeed Insights rerun. |
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

Property `sc-domain:statuslin.es`. In Performance, filter by page and compare clicks, impressions
and position with the per-group table in `launch-metrics.md`, using the same 28-day windows. The
titles that changed are listed there too.

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
