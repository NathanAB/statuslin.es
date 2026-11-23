# The theme is the browse unit, the plugin is the review unit

Accepted 2026-11-23. Claude Code has two kinds of theme (GLOSSARY.md): terminal themes, which a plugin ships as color files, and Desktop themes, which a mod sets in Claude Desktop. People shop for a look, not for a plugin, and one plugin can carry many looks: the first pack we curated holds 81 terminal themes. But Claude Code installs, updates and removes a plugin as one thing, and a theme file can change only when its plugin's commit does.

## What changes

1. **The plugin stays the unit we review, pin and install**, exactly as a mod is: the same submission, review in `/admin`, pin to a commit, release finding (ADR 0009) and one marketplace entry.
2. **Each theme is its own item**, belonging to one version of its plugin: a name, a kind (terminal now, Desktop next), a window (light or dark), its previews, and how to switch to it. Each one is a card on `/themes`, so the 81-theme pack shows 81 cards. A card leads to its plugin's listing, which shows all of the plugin's themes.
3. **Terminal theme plugins are listed beside mods.** A plugin whose only components are terminal theme files is accepted, though it runs no code. A plugin with hooks modules and theme files is reviewed as a mod, and its themes are listed too. Any other component is still refused. `claude plugin validate` says nothing about theme files, so statuslin.es reads and checks each one inside the inspection sandbox (ADR 0010) and stores it exactly as pinned.
4. **The operator reads every theme before it goes live.** `/admin` shows each theme's preview beside its exact pinned file, for submitted plugins and for curated ones, which are still published from the command line. A version can't be approved or published until every theme it carries has its own preview.
5. **A card's preview and its switch step name the same theme.** The preview is recorded in real Claude Code (ADR 0002) with the `theme` setting set to `custom:<plugin name>:<file slug>`, and the card tells visitors to pick that file's name in `/theme`. Both come from one stored theme, and one plugin may not carry two themes with the same name.
6. **A theme plugin stays out of the mod lists.** It runs no code, so it isn't called a mod (GLOSSARY.md) and has no mod card on `/mods`, the home page or related lists. It is on `/themes`, has its listing page and is in the marketplace.

## What others do

- Claude Code itself installs a plugin as one unit and lists each theme it carries separately in `/theme`, under the theme file's name, "marked as from" its plugin ([plugin components](https://code.claude.com/docs/en/plugins/components), [terminal config](https://code.claude.com/docs/en/terminal-config#create-a-custom-theme)). We mirror that: install the plugin, browse and pick the theme.
- VS Code's [color theme guide](https://code.visualstudio.com/api/extension-guides/color-theme) has a theme published inside an extension and picked by name in a Color Theme picker with a live preview, the same split between what you install and what you pick.

## Considered options

- **Each theme as its own listing, reviewed and pinned on its own.** 81 reviews and 81 marketplace entries for one commit, although Claude Code can only install them together, and a re-pin would move all 81 at once anyway.
- **One card per plugin.** Hides 80 of the pack's 81 looks behind the first, which is what visitors came to compare.
- **Store themes on the version as one JSON column, with previews in the mod preview table under a per-theme scenario key.** A theme would have no identity of its own to hang a preview, a card and later a Desktop shot on, and "scenario" would stop meaning a session state.
- **Record one session and recolor it ourselves for each theme.** Cheaper, but not what Claude Code draws, which ADR 0002 rules out.

## Consequences

- `render:mods` records one terminal session per theme, so a pack of 81 costs 81 recordings. A full run skips themes already recorded.
- A theme plugin still gets the mod's own terminal and Desktop recording, which shows it draws nothing. That spends a Desktop run per plugin, accepted for now.
- Theme names are author text. They are refused if they hold control or format characters, shown only as plain text, and never put in a prompt.
- A theme folder named by `experimental.themes` in plugin.json is still refused, as is the deprecated top-level `themes` key. Only the default `themes/` folder is read.
