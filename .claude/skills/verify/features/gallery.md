# Browse the gallery

Below the home hero, a visitor browses published status lines and mods as full-width rows, ten to a
page. They reorder the list with the `Sort` control (Trending, Top, New), search it, page through
it, and open topic pages such as `/status-lines/bash`, `/status-lines/best` and the ranked mods
list `/mods`. `?kind=` and `?tags=` still filter, from the URL only, with a `Clear filters` link.
Only published items appear.

## Sub-features

- `gallery-list` shows published rows: a level-3 title link, an `@author` link, a facts line (`Mod` for a mod, then the tags its page header shows as links such as `Bash`, then `N installs`), the `@author` text on the title's baseline, a preview and the description.
- `gallery-sort` reorders with the radiogroup `Sort` and writes `?sort=` into the URL.
- `gallery-search` filters with the searchbox `Search status lines and mods`, writes `?q=`, and says `Nothing matches “<q>”.` with a `Clear search` link when nothing matches.
- `gallery-pages` pages ten items at a time with the `Gallery pages` navigation (`Page N of M`, `Next page`, `Previous page`), and returns 404 past the last page.
- `gallery-filter` filters by `?kind=mods|status-lines` and `?tags=` from the URL, shows `Clear filters`, and says `Nothing matches these filters yet.` when nothing matches.
- `gallery-facet` lists the matching items on `/status-lines/<facet>` pages, with a count line such as `11 status lines.`, and 404s an unknown or empty facet.
- `gallery-best` ranks status lines on `/status-lines/best` and mods on `/mods`.
- `gallery-unpublished` keeps pending and rejected submissions out of every list.

## How to get to it (user POV)

- Open `http://localhost:3110/` and scroll past the hero; the gallery's visually hidden heading is `Status lines and mods`.
- A row's tag link (for example `Bash`) opens its topic page; a topic page's `Topics` navigation links the others.
- The footer's `Best status lines` (`/status-lines/best`) and `Best mods` (`/mods`).
- `?kind=` and `?tags=` have no control on the page; open them as URLs.

## Driving it with agent-browser

Preconditions:

- Baseline from the index.
- On a fresh DB, one published status line `Verify Probe` (bash), made through [submit-status-line](./submit-status-line.md) and [review-queue](./review-queue.md), covers rows, sort, search, facet, best and unpublished. Optionally one rejected submission, to prove it stays hidden.
- Paging needs more than ten published items, and the `kind=mods` filter and mod rows need published mods. The app can't get a fresh DB there (3 submissions per user per hour; mods need GitHub and E2B), so drive those on a populated instance (see the index) or report them skipped. The counts below come from one with 12 status lines (11 bash, 1 python) and 6 mods.

- **Land.** `H errors anon`, `H ab anon open http://localhost:3110/`, wait. `get title` prints `Claude Code Mods & Status Lines | statuslin.es`. `snapshot -i` shows heading `Status lines and mods`, radiogroup `Sort` with radio `Trending` checked and radios `Top` and `New`, searchbox `Search status lines and mods`, navigation `Gallery pages` (only with more than ten items), and per row a level-3 heading holding the title link, then an `@author` link and tag links. `get text main` shows each row's facts on separate lines split by `·`, ending `0 installs`; a mod row's facts start `Mod`.
- **Sort.** `H ab anon find role radio click --name New --exact`; the URL becomes `/?sort=new` and the newest item leads. `Top` gives `/?sort=top`; `Trending` from there gives `/?sort=trending`.
- **Search.** `H ab anon find role searchbox fill "kanji" --name "Search status lines and mods"`, then wait a second: the URL is `/?q=kanji` and only matching rows remain (title, description, author, tags and page copy are searched). A button `Clear search` sits in the field; clicking it returns to `/`. `http://localhost:3110/?q=zzqx` shows `Nothing matches “zzqx”.` and a link `Clear search`; `find role link click --name "Clear search" --exact` returns to `/`.
- **Pages.** `H ab anon click 'nav[aria-label="Gallery pages"] a'`. The URL is `/?page=2#gallery`, the text shows `Page 2 of 2`, the nav holds link `Previous page`, and the title reads `Claude Code Mods & Status Lines — Page 2 | statuslin.es`. The hero stays, its h1 named `Customize Claude Code with mods , page 2`. One page past the last (`/?page=3` here, `/?page=2` with ten or fewer items) returns 404 showing `That gallery page doesn't exist.`
- **Filter from the URL.** `http://localhost:3110/?kind=mods` lists only mod rows and link `Clear filters`, which returns to `/`. `?kind=status-lines` drops the mods. `?tags=node` with no node item shows `Nothing matches these filters yet.`
- **Topic page.** `H ab anon find first 'main a[href="/status-lines/bash"]' click` (a row's `Bash` link) or open `http://localhost:3110/status-lines/bash`. Title `Claude Code Status Lines Written in Bash | statuslin.es`, navigation `Breadcrumb` (`statuslin.es › Bash`), heading `Claude Code status lines written in bash`, navigation `Topics`, the count line (`11 status lines.`), and the matching rows. An unknown facet (`/status-lines/nope`) and a facet with no published match (`/status-lines/node` while nothing is node) return 404 showing `Nothing here yet.`
- **Best pages.** `http://localhost:3110/status-lines/best`: once any copy exists, title `Best Claude Code Status Line Examples (<Month> <Year>)` and heading `Best Claude Code status lines (<Month> <Year>)`, dated by the newest copy in UTC; before one, the title is `Best Claude Code Status Line Examples | statuslin.es`. `http://localhost:3110/mods`: title `Best Claude Code Mods, Ranked by Installs | statuslin.es`, heading `Best Claude Code mods`, mods ranked by installs, or `No mods yet.` with none.
- **Hidden until published.** With a rejected or pending submission in the DB, `/?q=verify` lists only the published `Verify …` rows and its `/c/<slug>` returns 404.
- **Proof.** In the `H evidence gallery` directory: snapshots and screenshots of home, the sorted and searched URLs, page 2, the filtered URL, the topic page, the `sql` read-back of published and rejected rows, `H errors anon` output, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-10-23 against the populated instance described above, plus a fresh one for the empty and unpublished cases.
- In a worktree-isolated session the command checker refuses a helper call whose argument is the bare word `Bash`, so select the tag link by its `href` as above.
- `Clear search` names both the field's button and the no-results link; pick one with `find role link` or `find role button`.
- The search writes `?q=` 200 ms after typing stops, replacing the history entry, and rows animate when the list changes; wait a second before reading the URL or snapshotting.
- On a DB with nothing published the gallery reads `Nothing matches these filters yet.` though no filter is set.
- A mod row shows one unlabeled preview: the Desktop shot (img alt `<title> in Claude Desktop`) or the terminal strip.
- A copy changes Trending, so a full reload after one can reorder the rows and the hero.
- Topic facets other than interpreters (`git`, `tokens`, `cost`, …) match on tags from the page-copy step (`bun run generate:content`), which nothing runs on a fresh verify DB, so they 404 there. Don't write tags with `sql` to get around it; report those facets as skipped.
