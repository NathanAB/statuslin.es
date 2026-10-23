# How listings are checked

After the gallery, the home page has a band, `How listings are checked`, naming the four checks
every listing passes, with a link to `/how-it-works`. That page walks through each check (pinned to
one version, run in a sandbox, reviewed before it's listed, listed with what it can reach), then
says it's all open source and what review can't promise. Where items are published, it shows real
examples: the top mod's `marketplace.json` entry and its `What this mod can do` panel, and the top
status line as the sandbox recorded it.

## Sub-features

- `checks-home` shows the region `How listings are checked` on every home page, with `read on GitHub`, link `How it works`, and four level-3 checks: `Pinned to one version`, `Run in a sandbox`, `Reviewed before it's listed`, `Listed with what it can reach`.
- `checks-link` opens `/how-it-works` from the band's `How it works`.
- `hiw-page` shows the title `How statuslin.es Checks Claude Code Mods & Status Lines`, heading `How statuslin.es checks mods and status lines`, navigation `On this page` with six links, and a region per section.
- `hiw-examples` shows the top mod's marketplace entry (`<Mod>'s entry in statuslin.es/marketplace.json, …`), the top status line's sandbox rows (`Clean repo`, `New session`, `Dirty branch`, `<Line>, as the sandbox recorded it.`), and the top mod's `What this mod can do` panel (`<Mod>'s panel, as its own page shows it.`).
- `hiw-empty` drops every example when nothing is published and keeps the text.

## How to get to it (user POV)

- The home band's `How it works` link, after the gallery.
- The footer's `How it works` (in the `About` column) on any page, and links from the mod safety guide.
- Open `http://localhost:3110/how-it-works` directly.

## Driving it with agent-browser

Preconditions:

- Baseline from the index. Signed out (`anon`) is enough.
- For `hiw-examples`, a published status line and a published mod; the mod needs a populated instance (see the index). Without a mod, the mod examples are absent.

- **Home band.** `H errors anon`, `H ab anon open http://localhost:3110/`, wait. `snapshot` shows region `How listings are checked` holding heading `How listings are checked`, `statuslin.es is open source, and every check below is code you can read on GitHub.`, link `read on GitHub` (href `https://github.com/NathanAB/statuslin.es`), link `How it works`, and the four level-3 headings, each with its line (`You install the exact version that was checked.`, `Its previews are recorded in a throwaway sandbox.`, `Nothing goes live on its own, updates included.`, `Its page shows what it can reach, next to the install button.`).
- **Click through.** `H ab anon click 'main a[href="/how-it-works"]'`, `wait --url "**/how-it-works"`. `get title` prints `How statuslin.es Checks Claude Code Mods & Status Lines`.
- **The page.** `snapshot -i` shows heading `How statuslin.es checks mods and status lines`, navigation `On this page` (`Pinned to one version`, `Run in a sandbox`, `Reviewed before it's listed`, `Listed with what it can reach`, `All of it is open source`, `What review can't promise`), a region per section, link `statuslin.es/marketplace.json`, heading `The sandbox is only for previews`, region `What this mod can do` with link `Are mods safe?`, links `statuslin.es on GitHub`, `SECURITY.md` and `Are Claude Code mods safe?`.
- **Examples.** `get text main` shows `<Mod>'s entry in statuslin.es/marketplace.json, the file Claude Code installs mods from. Its sha is the pinned commit.`, `A status line runs in 8 sample sessions`, `Clean repo`, `<Line>, as the sandbox recorded it.` and `<Mod>'s panel, as its own page shows it.` The examples are the hero's first status line and first mod ([home-hero](./home-hero.md)).
- **Empty.** On a fresh DB, `get text main` has none of `Clean repo`, `marketplace.json, the file`, `as the sandbox recorded`, `panel, as its own`, and `snapshot -i` has no `What this mod can do`; the band on home is unchanged.
- **Proof.** In the `H evidence how-it-works` directory: the band snapshot, the page snapshot, text and full screenshot, the empty-page text, `H errors anon` output, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-10-23.
- `How it works` names both the band's link and the footer's, and `Are mods safe?` both the panel's and the footer's; select the band's by `main a[href="/how-it-works"]`.
- The examples follow Trending, so a copy can change which item they show on the next load.
- With the fake runner the sandbox rows show their labels over empty strips.
- Below 1280 px, `On this page` sits between the intro and the body.
