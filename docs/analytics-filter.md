# PostHog bot filter

PostHog leaves bot traffic out of reports through the project's **Filter out internal and test
users** setting, its test-account filter. This page lists the filter's rules, the evidence for
each, where the filter applies, and how to keep it current.

## A visit counts unless a rule shows no person was there

A rule joins the filter only when it removes almost none of the visits that people clearly made.
Two groups of sessions stand in for people:

- Link sessions. These arrived from another site, such as a search engine, GitHub, Reddit or Hacker
  News, and came from outside Singapore and China, where the suspect traffic was.
- Sessions that copied a status line or a mod install prompt.

A rule passes when it removes under 1% of the link sessions and none of the sessions that copied.
Suspicion alone, such as a country or an odd timezone, is not a reason to remove a visit.

## Rules in the filter

All evidence covers the 60 days to 2026-10-28: 2,544 sessions, of which 17.8% copied something.
1,189 of them are link sessions.

| Rule | What it removes | Evidence |
|---|---|---|
| The **Internal / Test users** cohort | Your own accounts. | Not a bot rule. |
| `isBot` is true | Events that `src/lib/posthog-bot-tag.ts` tags: a desktop Chrome or Edge window exactly the size of the screen. The tag exists only on events from 2026-10-19. | 216 sessions came from such a window. 3 of them (1.4%) copied. 2 link sessions match. |
| Screen 1920×1080, window height 1080, timezone `America/Los_Angeles` | Events from the fleet that #189 describes, a 1920×1080 screen with no browser window, including events from before the tag existed. | The fleet made 15 of 25 sign-in clicks in two weeks (#189). |
| Old Chrome, one page, nothing after | A Chrome visit of one page view that sent no other event, on a Chrome version replaced more than 42 days earlier. | Removes 270 sessions. 8 link sessions (0.7%). None of the 453 sessions that copied. 162 of 241 Singapore and China sessions. |

PostHog's SDK also drops events from browsers that report automation (`navigator.webdriver`) or
name a known bot in their user agent. Those events never reach the filter.

### Why the last rule needs both conditions

Chrome updates itself, so 88% of Chrome link sessions ran the version most visitors used that week,
or a newer one, or the one just before it. Automation
tools such as Puppeteer and Playwright ship one fixed Chrome build, so their fleets fall further
behind each release. The most common version among the removed sessions is Chrome 148, which
Chrome 149 replaced on 2026-06-02.

Each condition alone removes too many people:

- One page and nothing after removes 84 of 1,189 link sessions (7.1%).
- Old Chrome alone removes 43 of 1,189 link sessions (3.6%) and 19 sessions that copied. Real
  visitors from China often run old Chrome too.

The 42-day cutoff comes from this comparison of the combined rule:

| Replaced more than | Link sessions removed | Singapore and China sessions removed |
|---|---|---|
| 14 days | 2.0% | 66% |
| 28 days | 0.8% | 66% |
| 42 days | 0.6% | 66% |
| 56 days | 0.6% | 66% |
| 84 days | 0.6% | 54% |

These figures come from a model of the rule run over exported sessions. The HogQL rule removes 0.7%
of link sessions, one more than the model, because it reads "nothing after" from PostHog's session
duration.

The rule measures age in days, not in versions behind, because Chrome moved from a release every
four weeks to one every two weeks with Chrome 153 in September 2026.

This is the rule as it stands in the filter, a HogQL expression. The filter in PostHog is the live
copy. Change both together.

```sql
not(ifNull(properties.$browser = 'Chrome' and session.$pageview_count = 1 and session.$session_duration = 0 and toInt(floor(toFloat(properties.$browser_version))) < 145 + arrayCount(x -> x <= toDate(timestamp) - 43, [toDate('2026-03-10'), toDate('2026-04-07'), toDate('2026-05-05'), toDate('2026-06-02'), toDate('2026-06-30'), toDate('2026-07-28'), toDate('2026-08-25'), toDate('2026-09-08'), toDate('2026-09-22'), toDate('2026-10-06'), toDate('2026-10-20'), toDate('2026-11-03'), toDate('2026-11-17'), toDate('2026-12-08'), toDate('2027-01-05'), toDate('2027-01-19'), toDate('2027-02-02'), toDate('2027-02-16'), toDate('2027-03-02'), toDate('2027-03-16'), toDate('2027-03-30'), toDate('2027-04-13'), toDate('2027-04-27'), toDate('2027-05-11'), toDate('2027-05-25'), toDate('2027-06-08')]), 0))
```

The array holds the stable dates of Chrome 146 to 171. `145 + arrayCount(...)` is the newest Chrome
version that was stable 43 days before the event, so a lower version was replaced more than 42 days
earlier.

## Rules we tested and left out

- **Browser timezone differs from the IP's timezone.** These are mostly VPN users. 12.1% of these
  sessions copied, against 19.8% of the rest.
- **Browser timezone is UTC.** 77 sessions and 1 copy, but that copy came from a Brave user who
  arrived from GitHub and copied 4 times.
- **Country.** A country says nothing about one visit.
- **Data-center networks.** Plausible drops about 32,000 data-center IP ranges by default and
  accepts losing some VPN users ([Plausible's bot filtering](https://plausible.io/docs/bot-traffic-filtering)).
  PostHog's GeoIP data has no network owner, so this project can't measure the rule without an
  IP-to-network table.

## Where the filter applies

- **Insights and dashboards.** Each insight has a **Filter out internal and test users** switch.
  New insights start with it on. Every visitor tile on the statuslin.es dashboard has it on.
- **Web analytics.** The **Filter test accounts** switch at the top right. It starts off, and
  PostHog remembers it for each user.
- **SQL.** Add `{filters}` to the `where` clause. In the SQL editor, open **Filters** and turn on
  **Filter out internal and test users**, which starts off. With no time range set, `{filters}`
  doesn't narrow the dates, so the query's own date conditions apply. `{filters}` fails on the
  `sessions` table, so match `session_id` against filtered events instead, as the home bounce rate
  query in `docs/redesign/home-a/launch-plan.md` does.

The filter runs when a query runs, so it applies to past events too. The `isBot` rule is the
exception, because the tag exists only on events from 2026-10-19. The rules that read browser
properties never remove server-side events such as `marketplace_fetched` and the copy events.

## Keep the Chrome dates current

The last date in the rule is 2027-06-08. After it, the rule treats no newer version as old, so it
removes less, never more. Before that date:

1. Open Chrome's release schedule:
   `https://chromiumdash.appspot.com/fetch_milestone_schedule?offset=-12&n=26`. Each entry has an
   `mstone` and a `stable_date`.
2. Append the `stable_date` of each milestone after 171 to the array in this page's rule, in
   milestone order. Don't remove dates from the start, because `145` counts the versions before the
   first date.
3. Paste the new rule over the old one in PostHog's **Filter out internal and test users** setting.
4. Change the date in the first sentence of this section.
