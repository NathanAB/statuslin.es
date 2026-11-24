# Themes

A theme is one look a plugin carries. A terminal theme plugin ships color files in `themes/`, and
Claude Code applies one when it is picked in `/theme`. statuslin.es reviews, pins and installs the
plugin as it does a mod, and shows each theme as its own card on `/themes`: its preview recorded in
real Claude Code in that theme's colors, in a light or dark window, with the plugin and author, the
plugin's install command, and the name to pick in `/theme`. Before publish, `/admin` shows every
theme's preview beside its exact pinned file. The plugin's page at `/mods/<slug>` lists all its
themes, and a plugin made only of themes has no card on `/mods`.

## Sub-features

- `theme-review-curated` lists a curated theme plugin on `/admin` under `Curated theme plugins`, with the render command, then the publish command, and every theme folded with its preview and exact file.
- `theme-publish-cli` publishes it with `scripts/publish-mod.ts`, whose dry run names how many themes to read on `/admin`.
- `themes-page` renders `/themes` with one card per published theme, its window label, plugin link, author, install command and `/theme` step.
- `theme-install-copy` copies a card's install command.
- `theme-plugin-page` lists the plugin's themes on `/mods/<slug>`, without the empty mod preview.
- `theme-plugin-not-a-mod` keeps a theme-only plugin off `/mods` while `/marketplace.json` serves it.
- `themes-filter` filters `/themes` by window (`?window=light|dark`); a `Where it applies` control shows only once themes of more than one kind are listed.
- `theme-install-count` counts a card's copied command as an install of its plugin, once per visitor, as a mod page's copy does.
- `theme-plugin-wording` names a theme plugin's page by its themes: breadcrumb `Themes`, `What this theme plugin can do`, and a prompt and toast that say "theme plugin".
- `themes-home-row` shows three theme cards and `Browse all <n> themes` on the home page, after the gallery.
- `themes-share` unfurls `/themes` with `/og/themes.png` and a theme plugin's page with its first theme on `/og/mods/<slug>.png`.
- `themes-discovery` lists `/themes` in `/sitemap.xml` and theme plugins under `## Themes` in `/llms.txt`.

## How to get to it (user POV)

- The header's `Themes` link, or the home page's `Browse all <n> themes`, opens `http://localhost:3110/themes`.
- A card's plugin link opens `http://localhost:3110/mods/<slug>`.
- The admin opens `http://localhost:3110/admin`.

## Driving it with agent-browser

Preconditions:

- Baseline from the index. `H login admin` ran.
- Rendering calls GitHub and E2B for real (`E2B_API_KEY` from `.env.local`). Get the user's OK first.
- The plugin is the curated `nk-claude-themes` entry in `src/mods/curation.json` (81 themes, 35 light and 46 dark). Import only that entry: write a one-entry JSON array with it to a scratch file outside the repo.

- **Import.** `DATABASE_URL=<H db-url> bun run import:mods <one-entry file>` prints `imported nk-claude-themes v1 at aa5dd0a…: plugin 1.1.0, license none, 0 events, 0 calls` in about 10 s. `H sql "select count(*), count(*) filter (where \"window\"='light') from mod_themes"` prints `81|35`.
- **Needs render.** `H ab admin open http://localhost:3110/admin`. `get text main` shows heading `Curated theme plugins`, card `NK Claude Themes` badged `Curated` and `First publish`, `Render it on your machine:` with `bun run render:mods --slug nk-claude-themes`, and `Themes (81)` with each theme's name.
- **Render.** `DATABASE_URL=<H db-url> bun run render:mods --slug nk-claude-themes` prints `rendered nk-claude-themes theme <key> in the terminal` once per theme, in about 10 minutes at two at a time. `H sql "select count(*), count(distinct segments::text) from mod_theme_previews"` prints `81|81`. Each preview is the theme scene: `❯ fix the failing sum test`, a reply, `Read 1 file`, `Update(src/sum.js)` with `return a - b` removed and `return a + b` added, `Now I'll run the tests.`, then the `Bash command` prompt for `npm test` ending `Esc to cancel · Tab to amend`.
- **Ready.** Reload `/admin`: the card reads `Rendered. Publish it from the CLI, reading the dry run first:` with `bun run scripts/publish-mod.ts nk-claude-themes <sha>`. `H ab admin find text "Dracula (port)" click` opens that theme: `Dark window`, the recorded screen, then `themes/dracula-port.json` and the file's exact text.
- **Publish.** The dry run ends with `themes: 81 terminal themes. Read each theme's preview and exact file on /admin, under "Curated theme plugins", before --apply.` and `dry run: nothing changed.` Then `--apply --confirm=nk-claude-themes` prints `published "nk-claude-themes" at <sha>`.
- **/themes.** `H errors anon`, `H ab anon open http://localhost:3110/themes`, wait. Title `Claude Code Themes: Light and Dark, Previewed | statuslin.es`, heading `Claude Code themes`, and `81 themes` beside the `Window` control. `snapshot -i` lists 81 `Copy install command for NK Claude Themes` buttons. A card reads `Dracula (port)`, `Dark`, `From NK Claude Themes`, `@nils44344`, the install command, and `Start a new session, run /theme and pick Dracula (port).`
- **Copy.** `H copy-spy anon`, `H ab anon find role button click --name "Copy install command for NK Claude Themes"`, then `H copied anon` prints `claude plugin marketplace add http://localhost:3110/marketplace.json && claude plugin install nk-claude-themes@statuslines`.
- **Filter.** `H ab anon find role radio click --name Light --exact`: the URL gains `?window=light` and `get text main` shows `35 of 81 themes`; `Dark` shows `46 of 81 themes`; `All` drops the search. Opening `/themes?window=dim` redirects to `/themes`.
- **Install count.** A copy from the plugin page counts the same visitor, so first `H sql "delete from mod_copy_events; update mods set copy_count=0 where slug='nk-claude-themes'"`. Copy a card's command on `/themes`: `H sql "select copy_count, (select count(*) from mod_copy_events) from mods where slug='nk-claude-themes'"` prints `1|1`.
- **Plugin page.** `/mods/nk-claude-themes` has region headings `Themes` and `What it does`, 81 `pick` steps, and no `Preview` heading. Its title is `NK Claude Themes — Claude Code Themes | statuslin.es`, its breadcrumb runs `statuslin.es › Themes › NK Claude Themes`, the install panel is headed `What this theme plugin can do`, and `copied anon` after `Copy install prompt` starts `Install the nk-claude-themes theme plugin from localhost:3110.` with the toast `... pick a theme with /theme in the terminal. Theme plugins need Claude Code 2.1.118 or later.`
- **Home row.** `/` shows heading `Claude Code themes`, three cards (`Amber 1982`, `Aurora Night Train`, `Badminton Hall`) and link `Browse all 81 themes` to `/themes`.
- **Share.** `curl -s http://localhost:3110/themes | grep og:image` names `/og/themes.png`; that PNG (200, `image/png`) draws a dark and a light theme under `81 themes, each previewed in a real session`. `/og/mods/nk-claude-themes.png` draws `Amber 1982` under `81 Claude Code themes · by @nils44344`.
- **Discovery.** `/sitemap.xml` lists `/themes` and `/mods/nk-claude-themes`; `/llms.txt` links `[Themes]` under `## Browse` and lists NK Claude Themes under `## Themes`, not `## Mods`.
- **Not a mod.** `/mods` shows no `NK Claude Themes` row. `curl -s http://localhost:3110/marketplace.json` lists `nk-claude-themes` with a `git-subdir` source pinned by `sha`.
- **Phone.** `H ab anon set viewport 375 548` and `393 660` on `/themes`: each preview fits its card with no sideways scroll, and the filter fits beside the count. For Safari, the site sends `X-Frame-Options: DENY`, so a phone-size iframe page needs a local proxy that strips it.
- **Proof.** In `H evidence themes`: the `/admin` text before and after render, the render log, the opened theme screenshot, the publish dry run and apply output, the `/themes` snapshot and screenshots (desktop and phone), the copied text, the plugin page snapshot, `/mods` text, the marketplace JSON, `H errors anon` output, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-11-23 with `nk-claude-themes` on Claude Code 2.1.309 in the sandbox, rendered at two at a time (about 12 minutes), then again for the filters, home row, share cards and install count.
- Before publish, `/themes` answers 200 with no cards and `noindex`, and `/mods/nk-claude-themes` is a 404.
- A theme plugin's install panel still reads `What it can reach isn't recorded yet`, though it runs no code.
- A theme preview stops on the `npm test` permission prompt, and nothing runs. The bullet before `Running 1 shell command…` blinks, so it is stored dark, and a theme recording ends once `Do you want to proceed?` shows rather than at 2 s of quiet.
- `/themes` is about 26,000 px tall at desktop width. An `agent-browser screenshot <selector>` of a card far down the page comes out blank: scroll the card into view, take a viewport screenshot, and crop to the card's box (`sips -c <h> <w> --cropOffset <y> <x>`). A `screenshot --full` shows Desktop theme cards blank too, since their images load lazily: first run `ab <role> eval "for (const i of document.images) i.loading = 'eager'"` and wait until every visible image has loaded.
