# Claude Code buddy guide

`/guide/claude-code-buddy` says users report `/buddy` gone from Claude Code, links the "Bring Back
Buddy" issue, then lists each published pet mod from a fixed list as the gallery's mod row, in one
column. Each row links to its mod page, which holds the full previews, fact tiles and install
prompt. A pet that isn't published is left out; with none published the page says so and links
every mod. When two listed pets add the same slash command, a note above the rows says to install
only one. A `Made your own pet?` section links `/submit`. The page is in the sitemap, `/llms.txt`
and the footer (`Buddy pets`).

## Sub-features

- `buddy-empty` shows the intro, `No pet mods are published yet.` with link `Browse every mod`, and the FAQ when no listed pet is published.
- `buddy-pets` shows one mod card per published pet in list order, each linking to `/mods/<slug>`.
- `buddy-clash` shows `… all add /pet. Install only one.` above the cards when two or more listed pets add `/pet`.
- `buddy-card-click` opens the pet's mod page from its card (counted as `mod_card_clicked` with surface `buddy_guide`).
- `buddy-discovery` lists the page in `/sitemap.xml`, `/llms.txt`, the footer, and its TechArticle, BreadcrumbList and FAQPage JSON-LD.

## How to get to it (user POV)

- The footer link `Buddy pets` (in the `Guides` column) on any page.
- Open `http://localhost:3110/guide/claude-code-buddy` directly; `/guide/claude-code-buddy/` redirects there (308).

## Driving it with agent-browser

Preconditions:

- Baseline from the index. The listed pets are `pixipet`, `pixel-cat`, `familiar`, `pets`, `code-pet` and `deck` (`BUDDY_PET_MOD_SLUGS`).
- For `buddy-pets`, `buddy-clash` and `buddy-card-click`, those mods are imported, rendered and published in the verify DB. Importing and rendering call GitHub and E2B for real and take about 30 minutes for all six; get the user's OK first. With `DATABASE_URL` set to `H db-url`'s output: `bun run import:mods <file>` with a curation file holding those six entries from `src/mods/curation.json`, `bun run render:mods`, then for each `bun run scripts/publish-mod.ts <slug> <sha> --apply --confirm=<slug>`. Rows already rendered in another local DB can be copied with `pg_dump --data-only --disable-triggers -t mods -t mod_versions -t mod_previews -t mod_desktop_previews`, then published the same way.

- **Empty.** Before publishing, run `H errors anon`, `H ab anon open http://localhost:3110/guide/claude-code-buddy`, wait, and `get text main`: heading `Claude Code /buddy removed? Pet mods that replace it`, `Users report it gone since 2.1.97`, link `Bring Back Buddy, #45596`, heading `Pet mods`, `No pet mods are published yet. Browse every mod.`, heading `Made your own pet?`, heading `Common questions`.
- **Pets.** After publishing, reload. `snapshot` lists links `Pixipet`, `Pixel Cat`, `Familiar`, `Claude Pets`, `Code Pet`, `Deck` in that order; `H ab anon get text "main a[href='/mods/pixipet']"` prints `Pixipet`, and the same for each slug. The page has no `Copy install prompt` button and no fact tiles.
- **Clash.** The note above the first card reads `Pixipet, Claude Pets, and Code Pet all add /pet. Install only one.` With only some pets published, the note names the published ones and needs at least two of Pixipet, Claude Pets and Code Pet.
- **Card click.** `H ab anon find role link click --name "Code Pet" --exact` (or any published pet, such as `Deck`), wait; `get url` prints `http://localhost:3110/mods/code-pet`. Analytics is off on the verify instance, so the click event itself is covered by the unit test.
- **Discovery.** `curl -s http://localhost:3110/sitemap.xml | grep -A1 claude-code-buddy` shows its `<loc>` and `<lastmod>`; `curl -s http://localhost:3110/llms.txt | grep -i buddy` shows the link line; `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3110/guide/claude-code-buddy/` prints `308` and the path without the slash; `H ab anon get attr "footer a[href='/guide/claude-code-buddy']" href` prints the path.
- **Proof.** In the `H evidence buddy-guide` directory: the empty and populated text and screenshots at 1280 and 375 px wide, the publish output, the card links and the click-through URL, the discovery output, `H errors anon` before and after, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-10-17 (per-pet sections) and 2026-10-18 (cards) with all six pets published. On 2026-10-23 the empty page, two published pets (`Claude Pets`, `Deck`), the click-through and discovery were driven again; the clash note wasn't, since it needs two of the `/pet` pets.
- Desktop card images load lazily, so a full-page screenshot shows the lower cards' images as empty boxes. Before a full capture, `H ab anon scrollintoview "img[alt='Deck in Claude Desktop']"` (and each pet above it) so every image has loaded.
- Familiar's terminal preview shows only two rows of its sprite: the render crop drops rows made of background-colored spaces. Its Desktop shot is whole.
- A pane pet's Desktop card is its pane (since #148). Rows rendered before that still hold the old top-of-window card; run `render:mods --slug <slug>` again.
