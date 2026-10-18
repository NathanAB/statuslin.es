# Claude Code buddy guide

`/guide/claude-code-buddy` says Claude Code removed `/buddy`, links the "Bring Back Buddy" issue,
then lists each published pet mod from a fixed list with its recorded previews, fact tiles and the
mod page's counted `Copy install prompt` button. A pet that isn't published is left out; with none
published the page says so. When two listed pets add the same slash command, a notice says to
install only one. The page is in the sitemap, `/llms.txt` and the footer (`Buddy pets`).

## Sub-features

- `buddy-empty` shows the intro, `No pet mods are published yet.`, and the FAQ when no listed pet is published.
- `buddy-pets` shows one section per published pet in list order, with its previews, fact tiles and install button.
- `buddy-clash` shows `… all add /pet, so install only one of them.` when two or more listed pets add `/pet`.
- `buddy-copy` copies a pet's install prompt from the guide and counts it like the mod page does.
- `buddy-discovery` lists the page in `/sitemap.xml`, `/llms.txt`, the footer, and its TechArticle, BreadcrumbList and FAQPage JSON-LD.

## How to get to it (user POV)

- The footer link `Buddy pets` on any page.
- Open `http://localhost:3110/guide/claude-code-buddy` directly; `/guide/claude-code-buddy/` redirects there (308).

## Driving it with agent-browser

Preconditions:

- Baseline from the index. The listed pets are `pixipet`, `pixel-cat`, `familiar`, `pets`, `code-pet` and `deck` (`BUDDY_PET_MOD_SLUGS`).
- For `buddy-pets`, `buddy-clash` and `buddy-copy`, those mods are imported, rendered and published in the verify DB. Importing and rendering call GitHub and E2B for real and take about 30 minutes for all six; get the user's OK first. With `DATABASE_URL` set to `H db-url`'s output: `bun run import:mods <file>` with a curation file holding those six entries from `src/mods/curation.json`, `bun run render:mods`, then for each `bun run scripts/publish-mod.ts <slug> <sha> --apply --confirm=<slug>`. Rows already rendered in another local DB can be copied with `pg_dump --data-only --disable-triggers -t mods -t mod_versions -t mod_previews -t mod_desktop_previews`, then published the same way.

- **Empty.** Before publishing, run `H errors anon`, `H ab anon open http://localhost:3110/guide/claude-code-buddy`, wait, and `get text main`: heading `Claude Code /buddy removed? Pet mods that replace it`, link `Bring Back Buddy, #45596`, `No pet mods are published yet.`, heading `Common questions`.
- **Pets.** After publishing, reload. `get text main` shows the six titles in list order, each with `Terminal`, `Claude Desktop`, the tiles (`What you see` … `Preview recorded with`) and `Copy install prompt`. `snapshot` shows a region per pet named by its title, with a link to `/mods/<slug>`.
- **Clash.** The notice reads `Pixipet, Claude Pets, and Code Pet all add /pet, so install only one of them.`
- **Copy.** `H copy-spy anon`, then `H ab anon find role button click --name "Copy install prompt for Pixipet" --exact` and `wait --text "1 copy"`. `H copied anon` prints the two-line install prompt ending `plugin install pixipet@statuslines`; `H sql "select copy_count from mods where slug = 'pixipet'"` prints `1`.
- **Discovery.** `curl -s http://localhost:3110/sitemap.xml | grep -A1 claude-code-buddy` shows its `<loc>` and `<lastmod>`; `curl -s http://localhost:3110/llms.txt | grep -i buddy` shows the link line; `H ab anon get attr "footer a[href='/guide/claude-code-buddy']" href` prints the path.
- **Proof.** In the `H evidence buddy-guide` directory: the empty and populated text and screenshots, the publish output, the copy `copied` text and `sql`, the discovery output, `H errors anon` before and after, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-10-17 with all six pets published.
- A full-page screenshot can show a lazy-loaded Desktop image as an empty box; scroll to it or check its `src` before calling it broken.
- Familiar's terminal preview shows only two rows of its sprite: the render crop drops rows made of background-colored spaces. Its Desktop shot is whole.
- `/mods/<slug>` is the full mod page; the guide repeats its previews and tiles but not its "How it works" and "Good to know".
