# Unreviewed Desktop theme mods show their previews and no install

Accepted 2026-11-24. `src/mods/curation.json` curates 42 mods that carry Desktop themes (ADR 0013), about 170 of the 200 themes `/themes` was built for. Their hooks code is about 10.5 MB, and only agents have read it. Quality bar rule 8 says a person sees the exact code before it is installable, so they can't go live as listings. The maintainer wants search traffic from them now and reviews them later.

They go live as **unreviewed mods** (GLOSSARY.md, ADR 0011), with one difference: their pages and their theme cards show the recorded previews, because the preview is what a theme page is for.

## What changes

1. **The state lives on the curated draft.** These mods are already imported as drafts and recorded from the operator's machine (ADR 0013). A draft gains one nullable column, `unreviewed_page_at`. A command sets it, and only on a draft whose live commit is the one in the curation file, whose every Desktop theme has its recording, and whose repository folder statuslin.es never removed or rejected. The mod stays a draft, so everything that lists, counts or installs reads `status = 'published'` and still leaves it out, and every draft workflow (recording, re-import, /admin's theme review, page copy, publish) works unchanged.
2. **The page installs nothing.** It is the unreviewed mod page at `/mods/unreviewed/<owner>/<plugin name>`: no install prompt and no command, ours or the author's, and the mod is not in `/marketplace.json`. It shows what ADR 0011's page shows (author, license, repository, what the code can reach with the commit and date it was checked, the "Not reviewed" label, the "request a review" and removal links) and adds each theme's recorded preview. Theme cards show no switch steps: those are for an installed plugin.
3. **Its themes are on /themes and on palette pages, in their own section.** Below the reviewed themes, a "Not reviewed" section holds their cards, each labelled and linking the mod's unreviewed page. They are in no reviewed count, no JSON-LD list, not on the home page and not in `llms.txt`. They are in the sitemap through their mod's page, and on `/mods` in the "Mods not reviewed" section.
4. **A palette of unreviewed themes alone still has a page.** Search is why these pages exist, and nearly every Desktop theme is unreviewed for now, so Tokyo Night and Solarized would otherwise lose theirs. Such a page is in the sitemap and in /themes' palette links, with its own title, description and share card. Its copy, its card and its count say "not reviewed yet", it lists no plugin in JSON-LD, and its themes sit under "Not reviewed" with no install. `llms.txt` links only palette pages with a reviewed theme.
5. **The operator sees each page on staging first.** The command runs per environment, as publishing does: on staging, look at the page, then on production. A page shows only what was imported and recorded at the curation file's commit.
6. **Publishing it is the review.** `publish-mod` clears the column, the listing goes live with its install, and the unreviewed address redirects to it permanently, as ADR 0011's does. The command's `--hide` takes the page down, and so does any mod that pinned the folder being delisted or a submission of it being rejected. The command refuses an address an unreviewed mod or a listing already holds, and the unreviewed mods import refuses an address a shown draft holds, so one page never mixes two mods' facts and previews.
7. **No pilot stop rule.** ADR 0011's 28-day rule tests whether a facts-only page earns clicks. These pages carry recorded previews, and the maintainer intends to review each pack, so no date takes them down.

## What others do

- [claudemods.dev](https://claudemods.dev) shows recordings and install commands for about 1,500 projects it hasn't reviewed. We show the recordings and keep the install for code a person read.
- The VS Code Marketplace lists [unverified publishers](https://code.visualstudio.com/docs/editor/extension-runtime-security) beside verified ones, with screenshots, and marks them, but installs them all. Our mark goes further: no install at all.
- [Firefox Add-ons](https://support.mozilla.org/en-US/kb/recommended-extensions-program) labels add-ons outside its Recommended program as not monitored for security. Like it, we label rather than hide, and put the reviewed ones first.

## Considered options

- **Move the 42 into `src/mods/unreviewed.json`.** That table has no versions and no themes, so showing previews would mean a second recording pipeline for it. The curated drafts already have both.
- **A new mod status, `unreviewed`.** Fails closed the same way, but every draft workflow would need to accept it too: recording, re-import of Desktop themes, /admin's curated theme review, page copy and publish.
- **Hold all 42 until the maintainer reads them.** Keeps one tier, and leaves about 170 themes off the site for months.
- **Publish them as listings.** Breaks the promise every listing makes.
- **Show the switch steps on the cards.** They are slash commands, not installs, but they tell a visitor how to run unread code.

## Consequences

- `/themes` and palette pages now show looks from code nobody here read. The label, the separate section and the missing install keep "every listed install is reviewed" true, and a change to any of the three needs this decision revisited.
- Re-recording a draft replaces its unreviewed page's previews on that environment at once, as it does for a published mod.
- The public Desktop preview image route serves a theme's still while its card is visible: for a published mod, or a draft with an unreviewed page.
- A palette page can now say nothing but "not reviewed": its words come from unreviewed themes until one of them is reviewed.
