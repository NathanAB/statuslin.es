# Browse the gallery

A visitor lands on the home page and sees published status lines and mods as cards. They narrow
the list with the `Show` filter (All, Status lines, Mods), reorder it with the sort menu (Trending,
Top, New), and reach topic pages such as `/status-lines/bash` and `/status-lines/best`. Only
published items appear.

## Sub-features

- `gallery-list` shows published cards: title link, a `Status line` or `Mod` chip, a copy count (`0 copies`), tag chips such as `Bash` linking to facet pages, and the `@author` link.
- `gallery-show` filters by kind with the `Show` radio group and writes `?kind=` into the URL.
- `gallery-sort` reorders with the `Sort: <order>` menu.
- `gallery-facet` lists the matching status lines and mods on `/status-lines/<facet>` pages, with a count line such as `1 published status line.`
- `gallery-empty` says `Nothing matches these filters yet.` when a filter has no results.
- `gallery-unpublished` keeps pending and rejected submissions out of every list.

## How to get to it (user POV)

- Open `http://localhost:3110/`.
- Choose the interpreter link on a card (for example `Bash`) to reach its facet page.
- Open `http://localhost:3110/status-lines/best` or `http://localhost:3110/status-lines/<facet>` directly.

## Driving it with agent-browser

Preconditions:

- Baseline from the index.
- One published status line `Verify Probe` (bash), made through [submit-status-line](./submit-status-line.md) and [review-queue](./review-queue.md). Optionally one pending submission, to prove it stays hidden.

- **Land.** Run `H ab anon open http://localhost:3110/` and wait. `snapshot -i` shows heading `Claude Code status lines and mods`, radiogroup `Show` with radio `All` checked, button `Sort: Trending`, button `Submit` (with a + icon), link `statusline-anywhere`, and a level-3 heading with link `Verify Probe`, link `Bash` and link `@verify-author`. `get text main` shows `Community sourced and human reviewed.`, `Using the Claude desktop app? Add your status line with statusline-anywhere.`, the card's `Status line` chip and `0 copies`, and the footer `1 published status lines, copied 0 times as of <date>.`
- **Filter.** Run `H ab anon find role radio click --name Mods --exact`. The URL becomes `http://localhost:3110/?kind=mods` and `get text main` shows `Nothing matches these filters yet.` Choose `Status lines` and `Verify Probe` is back.
- **Sort.** Run `H ab anon find role button click --name "Sort: Trending"`. Menu items `Trending` (checked), `Top`, `New` appear as `menuitemradio`. Run `H ab anon find role menuitemradio click --name New --exact`; the button reads `Sort: New` and `sort=new` joins the URL's query (`/?sort=new` from a plain home page, `/?kind=status-lines&sort=new` after choosing `Status lines`).
- **Facet page.** Run `H ab anon find first 'main a[href="/status-lines/bash"]' click` (the card's `Bash` link) or open `http://localhost:3110/status-lines/bash`. Title `Claude Code Status Lines Written in Bash | statuslin.es`, heading `Claude Code status lines written in bash`, the count line `1 published status line.`, and link `Verify Probe` in the list. An unknown facet (`/status-lines/nope`) returns 404 showing `No status lines here yet.`, and so does a real facet with no published match (`/status-lines/python` while only bash configs are published).
- **Best page.** Open `http://localhost:3110/status-lines/best`: heading `Best Claude Code status lines` and link `Verify Probe`.
- **Past the last page.** `http://localhost:3110/?page=2` on a one-page gallery returns 404 showing `There is no gallery page with that number.`
- **Hidden until published.** With a pending submission in the DB, none of these pages has a link with its title.
- **Proof.** In the `H evidence gallery` directory: snapshots and screenshots of home, the filtered URL, the sort menu, and the facet page, plus `H errors anon` output and `NOTES.md`.

## Gotchas

- In a worktree-isolated session the command checker refuses a helper call whose argument is the bare word `Bash`, so select the interpreter link by its `href` as above.
- The sort menu makes the rest of the page inert while open. Close it (`press Escape`) and give it a moment before clicking `Show` radios, or `find role radio` reports no element.
- The footer line `N published status lines, copied N times as of <date>` counts only published configs; use it as a quick read-back.
- Topic facets other than interpreters (`git`, `cost`, `token-usage`, …) match on tags from the page-copy step (`bun run generate:content`), which nothing runs on a fresh verify DB, so they 404 there. A facet page exists only while at least one published config matches it; interpreter facets match on the interpreter. Don't write tags with `sql` to get around it; report those facets as skipped.
- Mods appear only once a mod is published, which needs the mods setup in [mods](./mods.md). With one published, `/?kind=mods` shows its card with a `Mod` chip, its copy count, and a preview for each surface it drew on (`Terminal`, `Claude Desktop`); statusline-anywhere, which draws nothing in the terminal, shows only `Claude Desktop`.
