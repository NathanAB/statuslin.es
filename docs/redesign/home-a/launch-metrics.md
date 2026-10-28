# Launch metrics for the home redesign

The numbers to compare once the redesign is on production, and the numbers from before it.
The baseline covers the weeks before the deploy, up to 2026-10-23 at 18:05 UTC. It was re-pulled on
2026-10-28 with PostHog's bot filter on (`docs/analytics-filter.md`). Compare the four weeks after
the deploy with the four weeks before it. `launch-plan.md` has the deploy steps, when to roll back,
and the queries that produce these numbers.

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
| 2026-09-20 | 139 | 41.7% | 22.3% |
| 2026-09-27 | 137 | 46.7% | 29.2% |
| 2026-10-04 | 132 | 41.7% | 15.9% |
| 2026-10-11 | 130 | 40.8% | 21.5% |
| 2026-10-18 (to the deploy) | 131 | 39.7% | 22.1% |

Home bounce rate was 14% to 25% a week over the same weeks.

Week of 2026-10-18, to the deploy:

- Status line copies per status line page view: 37 / 126 (29%).
- Mod install copies per mod page view: 130 / 433 (30%).
- `marketplace_fetched`: 130, up from 48 the week before, when mods launched.

Web vitals, p75 over 2026-10-08 to 2026-10-22: home LCP 1.36 s, CLS 0.005, INP 72 ms. There were 7
`$exception` events in the 28 days to 2026-10-22, counted without the bot filter.

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
- About 135 sessions a week start on `/` once bots are left out, so a weekly copy rate moves by
  about 7 points by chance alone. Read four-week windows, not single weeks.
- The bot filter applies to both windows, with one gap. The `isBot` tag exists only on events from
  2026-10-19, so the weeks before it keep up to 15 sessions a week that start on `/` from a
  full-screen browser window, which the filter drops after that date. These sessions rarely copy,
  so they lower the baseline's copy rate a little and favor the redesign.
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

- **Topic page header** (#211, deployed 2026-10-23 at 20:38 UTC, production release v80, image
  `sha256:c64d37574c460f37e0b55d74b1c8ea11ad0bea122b8f25e73190896de94d0347`). Every topic page
  opens with one line, the count and what the topic's status lines show, and then the list. The
  git, token-usage and quota pages move their how-to answer from above the list to the first of
  their common questions, with a link to `/guide`. The token-usage, git and burn-rate intros are
  reworded to say what their status lines show before asking you to pick. The kinds note and "Open
  one to copy its install prompt" are gone. A search snapshot diff around the deploy showed no
  change to any page's status, title, description, canonical, robots tag or h1; only the three
  pages' FAQPage JSON-LD changed.
- **Gallery cards and six curated mods** (#212, #213, #214, #221, #224, #225, #227 and dependency
  updates including Bun 1.4.4, deployed 2026-10-25 at 16:35 UTC, production release v81, image
  `sha256:438c3ca0a1e1a51e54f98a9b6825994a532385e9225a301e47d0bb9d745f0b71`). Gallery cards list
  their page's tags, and the author sits on the title's baseline. Session HUD, Token Run, Time
  Machine, Context Inspector, Pin Memo and Mission Control join the gallery and
  `/marketplace.json`, so mod page views and copies after this date come from a larger catalog.
  Curated mods re-pin to their new releases, and publishing a version updates a mod's description
  from its plugin.json.
- **Share cards** (#228, #229, deployed 2026-10-26 at 01:23 UTC, production release v83, image
  `sha256:18ddbf9e26fbedd1fb4c2d05eacd218265b7594d7132d2a2d5e9af69b00c3312`; v82 failed with the
  same image). The home page's share card is redrawn as the new hero, and the detail pages' cards
  set their title and byline in the sans font. Pages themselves don't change.
- **Exception tracking** (#230, deployed 2026-10-26 at 13:23 UTC, production release v84, image
  `sha256:021eee0dcd5c0a38123b14aee1b1af0b6933036dff054753d022e65ba05bd29e`). The server stops
  sending 4xx responses to PostHog as `$exception`. Three of the five exceptions between the
  launch and this release were these server-side `Bad Request` errors, so leave them out of both
  windows when comparing the `$exception` count.
- **Mod page titles and install counts** (#231, #232, #233, #234, #236, #238, #239, #240, deployed
  2026-10-28 at 11:54 UTC, production release v85, image
  `sha256:def1534e15b3e45947708b7dbfcd45141ee63749f0c889338e39d3175a6e4c11`). A mod page whose page
  copy has a reviewed headline is titled and subtitled by it and shows "Common questions" (Context
  Inspector's title became "Context Inspector: Find what is wasting your Claude Code…"). A search
  change on a mod page starts at this date; the drop in `/mods/*` clicks on 2026-10-24 to 26 (9
  against 31 on the same weekdays a week earlier, at a steady position) came before it. Install
  counts below 3 are hidden. Mod previews record in a sample project and show the prompt box when a
  mod restyles its text. #239 lets a curated mod's card show its terminal preview, but only two of
  #236's five new mods use it, and none of the five was published on 2026-10-28. #242, which turns
  it on for published mods' cards, wasn't yet on production.
