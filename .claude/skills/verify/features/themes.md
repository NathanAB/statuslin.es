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

## How to get to it (user POV)

- Open `http://localhost:3110/themes` directly (no link points at it yet).
- A card's plugin link opens `http://localhost:3110/mods/<slug>`.
- The admin opens `http://localhost:3110/admin`.

## Driving it with agent-browser

Preconditions:

- Baseline from the index. `H login admin` ran.
- Rendering calls GitHub and E2B for real (`E2B_API_KEY` from `.env.local`). Get the user's OK first.
- The plugin is the curated `nk-claude-themes` entry in `src/mods/curation.json` (81 themes, 35 light and 46 dark). Import only that entry: write a one-entry JSON array with it to a scratch file outside the repo.

- **Import.** `DATABASE_URL=<H db-url> bun run import:mods <one-entry file>` prints `imported nk-claude-themes v1 at aa5dd0a…: plugin 1.1.0, license none, 0 events, 0 calls` in about 10 s. `H sql "select count(*), count(*) filter (where \"window\"='light') from mod_themes"` prints `81|35`.
- **Needs render.** `H ab admin open http://localhost:3110/admin`. `get text main` shows heading `Curated theme plugins`, card `NK Claude Themes` badged `Curated` and `First publish`, `Render it on your machine:` with `bun run render:mods --slug nk-claude-themes`, and `Themes (81)` with each theme's name.
- **Render.** `DATABASE_URL=<H db-url> bun run render:mods --slug nk-claude-themes` prints `rendered nk-claude-themes theme <key> in the terminal` once per theme, in about 5 to 6 minutes at four at a time. `H sql "select count(*), count(distinct segments::text) from mod_theme_previews"` prints `81|81`.
- **Ready.** Reload `/admin`: the card reads `Rendered. Publish it from the CLI, reading the dry run first:` with `bun run scripts/publish-mod.ts nk-claude-themes <sha>`. `H ab admin find text "Dracula (port)" click` opens that theme: `Dark window`, the recorded screen, then `themes/dracula-port.json` and the file's exact text.
- **Publish.** The dry run ends with `themes: 81 terminal themes. Read each theme's preview and exact file on /admin, under "Curated theme plugins", before --apply.` and `dry run: nothing changed.` Then `--apply --confirm=nk-claude-themes` prints `published "nk-claude-themes" at <sha>`.
- **/themes.** `H errors anon`, `H ab anon open http://localhost:3110/themes`, wait. Title `Claude Code Terminal Themes, Previewed | statuslin.es`, heading `Claude Code terminal themes`. `snapshot -i` lists 81 `Copy install command for NK Claude Themes` buttons. A card reads `Dracula (port)`, `Dark`, `From NK Claude Themes`, `@nils44344`, the install command, and `Start a new session, run /theme and pick Dracula (port).`
- **Copy.** `H copy-spy anon`, `H ab anon find role button click --name "Copy install command for NK Claude Themes"`, then `H copied anon` prints `claude plugin marketplace add http://localhost:3110/marketplace.json && claude plugin install nk-claude-themes@statuslines`.
- **Plugin page.** `/mods/nk-claude-themes` has region headings `Themes` and `What it does`, 81 `pick` steps, and no `Preview` heading.
- **Not a mod.** `/mods` shows no `NK Claude Themes` row. `curl -s http://localhost:3110/marketplace.json` lists `nk-claude-themes` with a `git-subdir` source pinned by `sha`.
- **Phone.** `H ab anon set viewport 375 548` on `/themes`: each preview fits its card with no sideways scroll.
- **Proof.** In `H evidence themes`: the `/admin` text before and after render, the render log, the opened theme screenshot, the publish dry run and apply output, the `/themes` snapshot and screenshots (desktop and phone), the copied text, the plugin page snapshot, `/mods` text, the marketplace JSON, `H errors anon` output, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-11-23 with `nk-claude-themes` on Claude Code 2.1.309 in the sandbox.
- Before publish, `/themes` answers 200 with no cards and `noindex`, and `/mods/nk-claude-themes` is a 404.
- The page copy of a theme plugin's page still says "mod" in places (`What this mod can do`, the breadcrumb), and the install count doesn't move when a `/themes` card's command is copied.
- A theme preview's turn row always reads `Worked for 1s · done 9:41 AM`: the recorded verb and clock are replaced so every run stores the same preview.
