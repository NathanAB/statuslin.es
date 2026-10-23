# Launch metrics for the home redesign

The numbers to compare once the redesign is on production, and the numbers from before it.
The baseline was pulled on 2026-10-22, before the redesign reached production. Compare the
four weeks after the deploy with the four weeks before it. `launch-plan.md` has the deploy steps,
when to roll back, and the queries that produce these numbers.

## What to compare

The redesign's job is to turn more home page visits into installs.

- **Primary:** the share of sessions that start on `/` and copy a status line or a mod install
  prompt (`statusline_prompt_copied`, `statusline_script_copied`, `mod_install_command_copied`).
- **Also:** the share of those sessions that open a status line or mod page, the home bounce
  rate, copies per detail page view, and `marketplace_fetched` per week (real installs).
- **Guardrails:** Search Console clicks, impressions and position for each page group; home
  page LCP and CLS at p75 (PostHog `$web_vitals`); `$exception` count.

## Baseline

PostHog sessions that started on `/`, by week (weeks start Sunday):

| Week of | Sessions | Opened a detail page | Copied or installed |
|---|---|---|---|
| 2026-09-20 | 156 | 37.8% | 19.9% |
| 2026-09-27 | 152 | 41.4% | 25.0% |
| 2026-10-04 | 151 | 38.4% | 14.6% |
| 2026-10-11 | 157 | 35.0% | 19.1% |
| 2026-10-18 (partial) | 161 | 38.5% | 17.4% |

Home bounce rate was 21% to 28% a week over the same weeks.

Week of 2026-10-18 (partial):

- Status line copies per status line page view: 36 / 144 (25%).
- Mod install copies per mod page view: 107 / 402 (27%).
- `marketplace_fetched`: 122, up from 40 the week before, when mods launched.

Web vitals, p75 over the 14 days to 2026-10-22: home LCP 1.28 s, CLS 0.001, INP 96 ms. There
were 7 `$exception` events in the 28 days to 2026-10-22.

Search Console for 2026-09-22 to 2026-10-19:

| Page group | Clicks | Impressions | CTR | Avg position |
|---|---|---|---|---|
| `/status-lines/*` | 30 | 1,192 | 2.5% | 7.1 |
| `/resources` | 16 | 969 | 1.7% | 7.8 |
| `/mods/*` | 33 | 380 | 8.7% | 5.8 |
| Guides | 7 | 329 | 2.1% | 12.1 |
| `/` | 12 | 306 | 3.9% | 7.4 |
| `/c/*` | 1 | 132 | 0.8% | 6.7 |

The week of 2026-10-19 alone had 81 clicks, 1,173 impressions and an average position of 6.3.

## Reading the comparison

- Mods launched in mid-October, and traffic doubled in the week of 2026-10-18. Compare rates,
  not counts.
- About 160 sessions a week start on `/`, so a weekly copy rate moves by about 6 points by chance
  alone. Read four-week windows, not single weeks.
- From this release, copy events carry `surface`: `home_hero` for the hero's button and `page`
  for a detail page. Older events have no `surface`, and all of them came from a page, since the
  hero didn't exist yet.
- `gallery_kind_changed` no longer fires, because the gallery's kind switch was removed.
- `github_star_link_clicked` now also fires from the plain GitHub link in the header and the
  phone menu.
- The gallery search (`?q=`) and the marketplace command copy on `/mods` and `/resources` send no
  event.

## Titles changed in this release

Seven page titles change in the same deploy. A search drop on one of these pages starts at the
deploy date. Record that date here when the release goes out.

Deploy date: 2026-10-23, 18:05 UTC (production release v79, image
`sha256:67d45749cf10b7e2c2f71b1b8883c15614551b9e287548d63f5f57c3fc6d55f5`; both machines on it by
18:06). The search snapshots from just before and just after are `seo/prod-before.json` and
`seo/prod-after.json`.

| Page | Before | After |
|---|---|---|
| `/` | Claude Code Status Lines & Mods | Claude Code Mods & Status Lines |
| `/mods` | Claude Code Mods Directory & Marketplace | Best Claude Code Mods, Ranked by Installs |
| `/status-lines/burn-rate` | Claude Code Status Lines That Show Burn Rate | Claude Code Burn Rate Status Lines & Mods |
| `/status-lines/git` | Claude Code Status Lines With Git Branch & Diff Stats | Claude Code Git Branch Status Lines & Mods |
| `/status-lines/quota` | Claude Code Usage Limits: Status Lines & Mods | Claude Code Usage Limit Status Lines & Mods |
| `/status-lines/token-usage` | Claude Code Token Usage: Status Lines & Mods | Claude Code Token Usage Status Lines & Mods |
| `/status-lines/weather` | Claude Code Status Lines That Show the Weather | Claude Code Weather Status Lines & Mods |

Every title ends in `| statuslin.es`, which the table leaves out.

## Changes to the same pages after launch

Changes that touch pages in this comparison, so the week-4 read can tell them apart from the
launch itself.

- **Topic page header** (opened 2026-10-23, deployed: _not yet_). Every topic page opens with one
  line, the count and the topic's advice, and then the list. The git, token-usage and quota pages
  move their how-to answer from above the list to the first of their common questions, with a link
  to `/guide`. Titles, descriptions, h1s and canonicals don't change, and every word stays on the
  page. The kinds note and "Open one to copy its install prompt" are gone.
